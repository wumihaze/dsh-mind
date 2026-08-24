/**
 * `search` config resolution.
 *
 * Semantic search needs two cloud credentials (embedding API + vector store).
 * Keys are read from env vars by default (kept out of git) and can be
 * overridden per-plugin via `search` config in the user's own profile patch.
 * Search stays OFF unless both credentials are present (or `enabled: true`
 * forces it on).
 */

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

/** Resolve search config from explicit overrides + env. Null when disabled. */
export function resolveSearchConfig(overrides?: SearchConfig): ResolvedSearchConfig | null {
  const env = process.env
  const embedApiKey = overrides?.embedApiKey ?? env['DSH_MIND_EMBED_KEY']
  const vectorApiKey = overrides?.vectorApiKey ?? env['DSH_MIND_VECTOR_KEY']
  const vectorUrl = overrides?.vectorUrl ?? env['DSH_MIND_VECTOR_URL']
  const enabled = overrides?.enabled === true || Boolean(embedApiKey && vectorApiKey && vectorUrl)
  if (!enabled || !embedApiKey || !vectorApiKey || !vectorUrl) return null
  return {
    enabled: true,
    embedApiKey,
    vectorApiKey,
    vectorUrl,
    embedUrl: overrides?.embedUrl ?? env['DSH_MIND_EMBED_URL'],
    embedModel: overrides?.embedModel ?? env['DSH_MIND_EMBED_MODEL'],
    collection: overrides?.collection ?? env['DSH_MIND_COLLECTION'],
    topK: overrides?.topK ?? numOr(env['DSH_MIND_TOP_K'], DEFAULT_TOP_K),
    chunkSize: overrides?.chunkSize ?? DEFAULT_CHUNK_SIZE,
  }
}

function numOr(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
