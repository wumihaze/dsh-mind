/**
 * `search` — semantic search coordinator for dsh-mind memory.
 *
 * Indexes sticky notes (MEMORY.md) and topic files (~/.dsh/memory/*.md) into a
 * cloud vector store, keyed by content-hash so edits/adds/removes produce only
 * delta syncs. Text is never stored in the vector store — only vectors + a
 * stable id — so results are mapped back to local text after a query.
 *
 * A local manifest (`memory/.vector-index.json`) records what has been synced;
 * `syncIfStale()` compares the current content fingerprints against it and
 * syncs only the delta. This works no matter which write path touched the
 * files (agent tool / Web GUI / CLI / memory-auto), so no per-writer hooks are
 * needed.
 *
 * Every network call is best-effort: failures return `null` and the caller
 * falls back to the existing keyword search.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { embedTexts } from './embed.ts'
import { DEFAULT_CHUNK_SIZE, DEFAULT_COLLECTION, DEFAULT_TOP_K, resolveSearchConfig, type ResolvedSearchConfig } from './config.ts'
import {
  deleteAllPoints,
  deletePoints,
  ensureCollection,
  pointCount,
  searchPoints,
  upsertPoints,
  type VectorPoint,
} from './vector-store.ts'

export { resolveSearchConfig, DEFAULT_COLLECTION, DEFAULT_TOP_K, DEFAULT_CHUNK_SIZE }
export type { SearchConfig, ResolvedSearchConfig } from './config.ts'

/** bge-m3 output dimension. */
export const VECTOR_DIMS = 1024
/** Free-tier hard wall: 1M vectors / 1 collection. */
const MAX_POINTS = 1_000_000
const MANIFEST_FILE = '.vector-index.json'

export interface MemoDoc {
  kind: 'memo'
  id: string
  text: string
  hash: string
}

export interface TopicDoc {
  kind: 'topic'
  id: string
  name: string
  title: string
  text: string
  hash: string
}

export type Doc = MemoDoc | TopicDoc

export interface MemoHit {
  kind: 'memo'
  id: string
  index: number
  text: string
  score: number
}

export interface TopicHit {
  kind: 'topic'
  id: string
  name: string
  title: string
  text: string
  score: number
}

export type SemanticHit = MemoHit | TopicHit

/** Stable 16-hex content hash used as vector point id. */
export function hashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

/** Read sticky-note entries out of MEMORY.md. */
function readMemoEntries(root: string): string[] {
  const path = join(root, 'memory', 'MEMORY.md')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
}

/** Read topic files beside MEMORY.md (comfyui.md, dsh.md, …). */
function readTopicsRaw(root: string): Array<{ name: string; title: string; text: string }> {
  const dir = join(root, 'memory')
  if (!existsSync(dir)) return []
  const topics: Array<{ name: string; title: string; text: string }> = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && x !== 'MEMORY.md').sort()) {
    const text = readFileSync(join(dir, f), 'utf8')
    const title = (text.split('\n').find((l) => l.startsWith('# ')) ?? '').replace(/^#\s*/, '').trim() || f.replace(/\.md$/, '')
    topics.push({ name: f.replace(/\.md$/, ''), title, text })
  }
  return topics
}

/** Split topic text into chunks, preferring markdown heading boundaries. */
export function chunkText(text: string, size: number): string[] {
  const sections = text.split(/^(?=#{1,6}\s)/m)
  const chunks: string[] = []
  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue
    if (trimmed.length <= size) {
      chunks.push(trimmed)
      continue
    }
    let rest = trimmed
    while (rest.length > size) {
      let cut = rest.lastIndexOf('\n', size)
      if (cut < size / 2) cut = size
      const piece = rest.slice(0, cut).trim()
      if (piece) chunks.push(piece)
      rest = rest.slice(cut).trim()
    }
    if (rest) chunks.push(rest)
  }
  return chunks
}

/** Build the full set of indexable docs (memos + topic chunks). */
export function loadDocs(root: string, chunkSize: number): Doc[] {
  const docs: Doc[] = []
  for (const text of readMemoEntries(root)) {
    const hash = hashOf(text)
    docs.push({ kind: 'memo', id: `memo:${hash}`, text, hash })
  }
  for (const tp of readTopicsRaw(root)) {
    for (const text of chunkText(tp.text, chunkSize)) {
      const hash = hashOf(text)
      docs.push({ kind: 'topic', id: `topic:${tp.name}:${hash}`, name: tp.name, title: tp.title, text, hash })
    }
  }
  return docs
}

interface Manifest {
  version: number
  items: Record<string, string>
}

function manifestPath(root: string): string {
  return join(root, 'memory', MANIFEST_FILE)
}

function readManifest(root: string): Manifest {
  const path = manifestPath(root)
  if (!existsSync(path)) return { version: 1, items: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Manifest>
    return { version: raw.version ?? 1, items: raw.items ?? {} }
  } catch {
    return { version: 1, items: {} }
  }
}

function writeManifest(root: string, items: Record<string, string>): void {
  const path = manifestPath(root)
  const dir = join(path, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify({ version: 1, items }, null, 2) + '\n', 'utf8')
}

/**
 * Bring the vector store in sync with the current memory content (delta-only).
 * @returns `true` when synced (or already in sync); throws on hard failures.
 */
export async function syncIfStale(root: string, cfg: ResolvedSearchConfig): Promise<boolean> {
  const docs = loadDocs(root, cfg.chunkSize)
  const manifest = readManifest(root)
  const toAdd = docs.filter((d) => manifest.items[d.id] !== d.hash)
  const current = new Set(docs.map((d) => d.id))
  const toRemove = Object.keys(manifest.items).filter((id) => !current.has(id))
  if (toAdd.length === 0 && toRemove.length === 0) return true

  await ensureCollection(cfg, VECTOR_DIMS)

  if (toAdd.length > 0) {
    const count = await pointCount(cfg)
    if (count + toAdd.length > MAX_POINTS) {
      throw new Error(`vector store free-tier limit: ${count} + ${toAdd.length} > ${MAX_POINTS}`)
    }
    const vectors = await embedTexts(cfg, toAdd.map((d) => d.text))
    if (vectors.length !== toAdd.length) throw new Error('embedding count mismatch')
    const points: VectorPoint[] = toAdd.map((d, i) => ({
      id: d.id,
      vector: vectors[i]!,
      payload: d.kind === 'topic' ? { kind: 'topic', name: d.name, title: d.title } : { kind: 'memo' },
    }))
    await upsertPoints(cfg, points)
  }

  if (toRemove.length > 0) await deletePoints(cfg, toRemove)

  const next: Record<string, string> = {}
  for (const d of docs) next[d.id] = d.hash
  writeManifest(root, next)
  return true
}

/** Wipe the vector store and rebuild the index from scratch. */
export async function reindex(root: string, cfg: ResolvedSearchConfig): Promise<void> {
  await ensureCollection(cfg, VECTOR_DIMS)
  await deleteAllPoints(cfg)
  writeManifest(root, {})
  await syncIfStale(root, cfg)
}

/** Map vector hits back to local memo/topic text. */
function mapHits(root: string, hits: Array<{ id: string; score: number }>, chunkSize: number): SemanticHit[] {
  const memos = readMemoEntries(root).map((text) => ({ text, hash: hashOf(text) }))
  const topicCache = new Map<string, Array<{ text: string; hash: string; title: string }>>()
  const out: SemanticHit[] = []
  for (const hit of hits) {
    if (hit.id.startsWith('memo:')) {
      const hash = hit.id.slice(5)
      const idx = memos.findIndex((m) => m.hash === hash)
      if (idx >= 0) out.push({ kind: 'memo', id: hit.id, index: idx, text: memos[idx]!.text, score: hit.score })
    } else if (hit.id.startsWith('topic:')) {
      const rest = hit.id.slice('topic:'.length)
      const colon = rest.indexOf(':')
      if (colon > 0) {
        const name = rest.slice(0, colon)
        const hash = rest.slice(colon + 1)
        let chunks = topicCache.get(name)
        if (chunks === undefined) {
          const raw = readTopicsRaw(root).find((t) => t.name === name)
          chunks = raw ? chunkText(raw.text, chunkSize).map((t) => ({ text: t, hash: hashOf(t), title: raw.title })) : []
          topicCache.set(name, chunks)
        }
        const found = chunks.find((c) => c.hash === hash)
        if (found) out.push({ kind: 'topic', id: hit.id, name, title: found.title, text: found.text, score: hit.score })
      }
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/**
 * Semantic search over memory. Best-effort: returns `null` when disabled or
 * on any failure so callers can fall back to keyword search.
 */
export async function semanticSearch(
  root: string,
  query: string,
  cfg: ResolvedSearchConfig,
  topK: number = cfg.topK,
): Promise<SemanticHit[] | null> {
  try {
    await syncIfStale(root, cfg)
    const vectors = await embedTexts(cfg, [query])
    const vec = vectors[0]
    if (!vec) return null
    const hits = await searchPoints(cfg, vec, topK)
    if (hits.length === 0) return []
    return mapHits(root, hits, cfg.chunkSize)
  } catch {
    return null
  }
}
