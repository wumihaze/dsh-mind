/**
 * `vector-store` — minimal Qdrant REST client (free tier).
 *
 * Covers exactly what dsh-mind needs: ensure collection, upsert, search,
 * delete-by-id, delete-all (reindex), and a points_count preflight — the free
 * tier hard-caps at 1M vectors / 1 collection, and insertions past the wall
 * fail silently, so we check before writing.
 */

import { DEFAULT_COLLECTION } from './config.ts'

export interface VectorStoreConfig {
  vectorUrl: string | undefined
  vectorApiKey: string | undefined
  collection: string | undefined
}

export interface VectorPoint {
  id: string
  vector: number[]
  payload?: Record<string, unknown>
}

export interface ScoredPoint {
  id: string
  score: number
  payload: Record<string, unknown> | undefined
}

const TIMEOUT_MS = 30_000

function base(cfg: VectorStoreConfig): string {
  return (cfg.vectorUrl ?? '').replace(/\/+$/, '')
}

function collectionName(cfg: VectorStoreConfig): string {
  return cfg.collection ?? DEFAULT_COLLECTION
}

function headers(cfg: VectorStoreConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.vectorApiKey) h['api-key'] = cfg.vectorApiKey
  return h
}

/** Create the collection if it does not exist yet (1024-dim, cosine). */
export async function ensureCollection(cfg: VectorStoreConfig, dims: number): Promise<void> {
  const url = `${base(cfg)}/collections/${collectionName(cfg)}`
  const head = headers(cfg)
  const res = await fetch(url, { headers: head, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.ok) return
  if (res.status === 404) {
    const created = await fetch(url, {
      method: 'PUT',
      headers: head,
      body: JSON.stringify({ vectors: { size: dims, distance: 'Cosine' } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!created.ok) throw new Error(`vector store: create collection failed HTTP ${created.status}: ${await created.text()}`)
    return
  }
  throw new Error(`vector store: collection check failed HTTP ${res.status}: ${await res.text()}`)
}

/** Upsert points. */
export async function upsertPoints(cfg: VectorStoreConfig, points: VectorPoint[]): Promise<void> {
  if (points.length === 0) return
  const url = `${base(cfg)}/collections/${collectionName(cfg)}/points?wait=true`
  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(cfg),
    body: JSON.stringify({ points: points.map((p) => ({ id: p.id, vector: p.vector, ...(p.payload ? { payload: p.payload } : {}) })) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`vector store: upsert failed HTTP ${res.status}: ${await res.text()}`)
}

/** Search nearest points by vector. */
export async function searchPoints(cfg: VectorStoreConfig, vector: number[], topK: number): Promise<ScoredPoint[]> {
  const url = `${base(cfg)}/collections/${collectionName(cfg)}/points/search`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ vector, limit: topK, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`vector store: search failed HTTP ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { result?: Array<{ id: string; score: number; payload?: Record<string, unknown> }> }
  return (body.result ?? []).map((r) => ({ id: r.id, score: r.score, payload: r.payload }))
}

/** Delete points by id. */
export async function deletePoints(cfg: VectorStoreConfig, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const url = `${base(cfg)}/collections/${collectionName(cfg)}/points/delete`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ points: ids }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`vector store: delete failed HTTP ${res.status}: ${await res.text()}`)
}

/** Delete every point (full reindex). Empty filter matches all. */
export async function deleteAllPoints(cfg: VectorStoreConfig): Promise<void> {
  const url = `${base(cfg)}/collections/${collectionName(cfg)}/points/delete`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({ filter: {} }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`vector store: clear failed HTTP ${res.status}: ${await res.text()}`)
}

/** Current point count (free-tier preflight). */
export async function pointCount(cfg: VectorStoreConfig): Promise<number> {
  const url = `${base(cfg)}/collections/${collectionName(cfg)}`
  const res = await fetch(url, { headers: headers(cfg), signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`vector store: stats failed HTTP ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { result?: { points_count?: number } }
  return body.result?.points_count ?? 0
}
