/**
 * `search` config resolution.
 *
 * Semantic search needs two cloud credentials (embedding API + vector store).
 * Credentials are resolved in order: per-plugin `search` config overrides, then
 * a local config file `~/.dsh/memory/.vector-config.json`, then env vars
 * (`DSH_MIND_EMBED_KEY` / `DSH_MIND_VECTOR_URL` / `DSH_MIND_VECTOR_KEY`). The
 * config file is the convenient way to keep semantic search working without
 * managing env vars on every launch. Search stays OFF unless credentials are
 * present (or `enabled: true` forces it on).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SearchConfig {
  /** Force-enable semantic search even without env credentials. */
  enabled?: boolean
  /** Embedding API URL (default: SiliconFlow OpenAI-compatible endpoint). */
  embedUrl?: string
  /** Embedding model id (default `BAAI/bge-m3`). */
  embedModel?: string
  /** Embedding API key. Falls back to `DSH_MIND_EMBED_KEY`. */
  embedApiKey?: string
  /** Qdrant cluster URL (e.g. `https://<cluster>.qdrant.io`). */
  vectorUrl?: string
  /** Vector store API key. Falls back to `DSH_MIND_VECTOR_KEY`. */
  vectorApiKey?: string
  /** Qdrant collection name (default `dsh-mind-memory`). */
  collection?: string
  /** Number of semantic hits to return (default `8`). */
  topK?: number
  /** Topic-file chunk size in chars (default `500`). */
  chunkSize?: number
}

/** Fully-resolved search config; every field explicit (may be undefined). */
export interface ResolvedSearchConfig {
  enabled: boolean
  embedApiKey: string | undefined
  vectorApiKey: string | undefined
  vectorUrl: string | undefined
  embedUrl: string | undefined
  embedModel: string | undefined
  collection: string | undefined
  topK: number
  chunkSize: number
}

export const DEFAULT_COLLECTION = 'dsh-mind-memory'
export const DEFAULT_TOP_K = 8
export const DEFAULT_CHUNK_SIZE = 500

/**
 * Read string fields from `~/.dsh/memory/.vector-config.json` (best-effort;
 * malformed or missing file → empty map).
 */
function fileFields(root?: string): Record<string, string> {
  if (!root) return {}
  try {
    const path = join(root, 'memory', '.vector-config.json')
    if (!existsSync(path)) return {}
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

function first(...values: Array<string | undefined>): string | undefined {
  return values.find((v): v is string => typeof v === 'string')
}

/**
 * Resolve search config. Precedence per field: plugin `search` config →
 * `.vector-config.json` → env vars. Null when disabled.
 */
export function resolveSearchConfig(overrides?: SearchConfig, root?: string): ResolvedSearchConfig | null {
  const file = fileFields(root)
  const env = process.env
  const embedApiKey = first(overrides?.embedApiKey, file['embedApiKey'], env['DSH_MIND_EMBED_KEY'])
  const vectorApiKey = first(overrides?.vectorApiKey, file['vectorApiKey'], env['DSH_MIND_VECTOR_KEY'])
  const vectorUrl = first(overrides?.vectorUrl, file['vectorUrl'], env['DSH_MIND_VECTOR_URL'])
  const enabled = overrides?.enabled === true || Boolean(embedApiKey && vectorApiKey && vectorUrl)
  if (!enabled || !embedApiKey || !vectorApiKey || !vectorUrl) return null
  return {
    enabled: true,
    embedApiKey,
    vectorApiKey,
    vectorUrl,
    embedUrl: first(overrides?.embedUrl, file['embedUrl'], env['DSH_MIND_EMBED_URL']),
    embedModel: first(overrides?.embedModel, file['embedModel'], env['DSH_MIND_EMBED_MODEL']),
    collection: first(overrides?.collection, file['collection'], env['DSH_MIND_COLLECTION']),
    topK: overrides?.topK ?? numOr(file['topK'], numOr(env['DSH_MIND_TOP_K'], DEFAULT_TOP_K)),
    chunkSize: overrides?.chunkSize ?? numOr(file['chunkSize'], DEFAULT_CHUNK_SIZE),
  }
}

function numOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
