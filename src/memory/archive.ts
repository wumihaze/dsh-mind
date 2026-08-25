/**
 * `memory-archive`: move sticky-note overflow into per-topic files.
 *
 * Shared by `memory-auto` and the `POST /dsh-mind/memory` web route so neither
 * ever hard-fails on the sticky-note budget: when appending would exceed it,
 * non-pinned entries that route to a topic are appended to that topic file
 * (`<topic>.md`) and removed from MEMORY.md. Nothing is deleted — it moves.
 *
 * Topic files are already indexed for semantic search (`search/loadDocs` reads
 * every `*.md` beside MEMORY.md), so archived facts stay findable. The vector
 * manifest is delta-synced by `syncIfStale` on the next search, so no extra
 * indexing code is needed here.
 *
 * An entry is only removed from the sticky notes after it was successfully
 * persisted to a topic file — archiving never loses data.
 *
 * @module @wumihaze/dsh-mind/memory/archive
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * User-facing archive settings (subset of `ArchiveOptions`).
 * @public
 */
export interface ArchiveConfig {
  /** Keyword → topic-name routing table. Lowercase substring match, longest keyword wins. */
  keywords?: Record<string, string>
  /** Topic used when no keyword matches (default `misc`). */
  fallback?: string
  /** Entries shorter than this are never archived (default `24`). */
  minLength?: number
  /** When archiving creates a NEW topic file, add a `→ memory/<topic>.md` pointer to the sticky notes (default `true`). */
  leavePointerForNewTopic?: boolean
}

/** Full archiver options. */
export interface ArchiveOptions extends ArchiveConfig {
  /** dsh home; topic files live at `<root>/memory/<topic>.md`. */
  root: string
  /** Pinned entry texts — never archived. */
  pinned?: string[]
  /** Extra texts to keep in the sticky notes (e.g. freshly extracted facts). */
  protected?: string[]
  /** Sticky-note budget to trim down to (default `2200`). */
  budget?: number
}

export interface ArchiveResult {
  /** Sticky-note entries after archiving (≤ budget when candidates allow). */
  entries: string[]
  /** What moved and where. */
  archived: Array<{ text: string; topic: string }>
  /** Topic files newly created by this run (a pointer line was added for each). */
  newTopics: string[]
}

/** Default keyword routing table, matching the shipped per-topic files. */
const DEFAULT_KEYWORDS: Record<string, string> = {
  // llama.cpp / local LLM
  'llama.cpp': 'llama',
  llama: 'llama',
  qwen: 'llama',
  mtp: 'llama',
  推理: 'llama',
  'tok/s': 'llama',
  // PDF → Word (long, specific keywords win over generic `python`/`web`)
  'python-docx': 'pdf',
  'pdf2docx': 'pdf',
  pymupdf: 'pdf',
  fitz: 'pdf',
  pdf: 'pdf',
  word: 'pdf',
  docx: 'pdf',
  omml: 'pdf',
  数学: 'pdf',
  公式: 'pdf',
  公众号: 'pdf',
  // dsh / plugins / cordis
  dsh: 'dsh',
  cordis: 'dsh',
  fdrop: 'dsh',
  slot: 'dsh',
  插件: 'dsh',
  preset: 'dsh',
  // environment / proxy / windows
  env: 'env',
  windows: 'env',
  python: 'env',
  powershell: 'env',
  代理: 'env',
  v2ray: 'env',
  xray: 'env',
  curl: 'env',
  // per-service topics
  telegram: 'telegram',
  tg: 'telegram',
  qq: 'qq',
  torrent: 'torrents',
  种子: 'torrents',
  music: 'music',
  音乐: 'music',
  github: 'github',
  git: 'github',
  prefs: 'prefs',
  偏好: 'prefs',
  web: 'web',
  网页: 'web',
}

function memoryDir(root: string): string {
  return join(root, 'memory')
}

/** Local date `YYYY-MM-DD` for the archive section header. */
function today(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Topic names of files already present beside MEMORY.md. */
function existingTopics(root: string): Set<string> {
  const dir = memoryDir(root)
  if (!existsSync(dir)) return new Set()
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').map((f) => f.slice(0, -3)))
}

/** Route an entry to a topic: longest matching keyword wins, else the fallback. */
function routeTopic(text: string, keywords: Record<string, string>, fallback: string): string {
  const lower = text.toLowerCase()
  let best: string | undefined
  let bestLen = -1
  for (const [kw, topic] of Object.entries(keywords)) {
    if (kw.length > bestLen && lower.includes(kw)) {
      best = topic
      bestLen = kw.length
    }
  }
  return best ?? fallback
}

/**
 * Append entries to a topic file under a single `## YYYY-MM-DD 归档（自动）`
 * section. When the file does not exist yet (either at start or earlier this
 * run) it is created with an `# <topic>` title.
 * @returns `true` when the write succeeded.
 */
function appendToTopic(root: string, topic: string, entries: string[], date: string, fileExists: boolean): boolean {
  const file = join(memoryDir(root), `${topic}.md`)
  const section = `## ${date} 归档（自动）\n${entries.map((e) => `- ${e}`).join('\n')}\n`
  try {
    if (fileExists) {
      if (!existsSync(file)) return false
      const existing = readFileSync(file, 'utf8')
      writeFileSync(file, `${existing.trimEnd()}\n\n${section}`, 'utf8')
    } else {
      const dir = memoryDir(root)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(file, `# ${topic}\n\n${section}`, 'utf8')
    }
    return true
  } catch {
    return false
  }
}

interface Candidate {
  text: string
  idx: number
  topic: string
}

/**
 * Select candidates to drop until the notes fit `targetTotal`, group them by
 * topic, write each group, and report only the entries that were persisted.
 */
function writeArchived(
  candidates: Candidate[],
  entries: string[],
  currentTotal: number,
  targetTotal: number,
  root: string,
  date: string,
  existing: Set<string>,
  created: Set<string>,
): { removed: Set<number>; archived: Array<{ text: string; topic: string; idx: number }> } {
  const selected = new Set<number>()
  let cur = currentTotal
  for (const c of candidates) {
    if (cur <= targetTotal) break
    if (selected.has(c.idx)) continue
    selected.add(c.idx)
    cur -= c.text.length + 1 // the entry text and its line separator leave the notes
  }

  const grouped = new Map<string, number[]>()
  for (const c of candidates) {
    if (!selected.has(c.idx)) continue
    let list = grouped.get(c.topic)
    if (list === undefined) grouped.set(c.topic, (list = []))
    list.push(c.idx)
  }

  const archived: Array<{ text: string; topic: string; idx: number }> = []
  for (const [topic, idxs] of grouped) {
    const texts = idxs.map((i) => entries[i]!)
    const fileExists = existing.has(topic) || created.has(topic)
    if (appendToTopic(root, topic, texts, date, fileExists)) {
      created.add(topic)
      for (const i of idxs) archived.push({ text: entries[i]!, topic, idx: i })
    }
  }
  return { removed: new Set(archived.map((a) => a.idx)), archived }
}

/**
 * Trim sticky notes that exceed the budget by archiving entries into topic files.
 *
 * Selection order: skip pinned and protected entries, skip entries shorter than
 * `minLength`, prefer entries that route to an already-existing topic file, and
 * archive the longest entries first (fastest space recovery).
 *
 * When a NEW topic file is created and `leavePointerForNewTopic` is set, a short
 * `- <topic> 经验 → memory/<topic>.md` pointer is appended to the notes so the
 * sticky-note index stays in sync; if there is no room, the pointer is skipped.
 */
export function archiveOverflow(entries: string[], opts: ArchiveOptions): ArchiveResult {
  const budget = opts.budget ?? 2200
  const fallback = opts.fallback ?? 'misc'
  const minLength = opts.minLength ?? 24
  const keywords = opts.keywords ?? DEFAULT_KEYWORDS
  const leavePointer = opts.leavePointerForNewTopic ?? true
  const root = opts.root
  const pinned = new Set(opts.pinned ?? [])
  const protect = new Set(opts.protected ?? [])

  const total = entries.join('\n').length
  if (total <= budget) return { entries: [...entries], archived: [], newTopics: [] }

  const date = today()
  const existing = existingTopics(root)
  const created = new Set<string>()

  const base: Candidate[] = entries
    .map((text, idx) => ({ text, idx, topic: routeTopic(text, keywords, fallback) }))
    .filter((c) => !pinned.has(c.text) && !protect.has(c.text) && c.text.length >= minLength)

  // First pass: archive best candidates until the notes fit the budget.
  const ordered = [...base].sort(
    (a, b) => Number(existing.has(b.topic)) - Number(existing.has(a.topic)) || b.text.length - a.text.length,
  )
  const first = writeArchived(ordered, entries, total, budget, root, date, existing, created)
  if (first.archived.length === 0) return { entries: [...entries], archived: [], newTopics: [] }

  let removed = first.removed
  let archived = first.archived
  let notes = entries.filter((_, i) => !removed.has(i))

  // New topic files created by this run → keep an index pointer in the notes.
  const newTopics = [...created].filter((t) => !existing.has(t))
  if (leavePointer && newTopics.length > 0) {
    const pointers = newTopics.map((t) => `${t} 经验 → memory/${t}.md`)
    const fits = (list: string[], extra: string[]): boolean => [...list, ...extra].join('\n').length <= budget

    if (!fits(notes, pointers)) {
      // Make room by re-archiving longest-first (skipping already-removed).
      const room = base.filter((c) => !removed.has(c.idx)).sort((a, b) => b.text.length - a.text.length)
      const more = writeArchived(room, entries, notes.join('\n').length, budget - pointers.join('\n').length, root, date, existing, created)
      if (more.archived.length > 0) {
        removed = new Set([...removed, ...more.removed])
        archived = [...archived, ...more.archived]
        notes = entries.filter((_, i) => !removed.has(i))
      }
    }

    const kept = pointers.filter((_, i) => fits(notes, pointers.slice(0, i + 1)))
    if (kept.length > 0) notes = [...notes, ...kept]
  }

  return { entries: notes, archived, newTopics }
}
