/**
 * `embed` — text → vector via SiliconFlow (free tier, BAAI/bge-m3).
 *
 * OpenAI-compatible `/v1/embeddings`. bge-m3 is symmetric (no query/document
 * instruction template needed) and outputs 1024-dim vectors. Retries once on
 * transient failures; throws on anything else so callers can fall back.
 */

import type { ResolvedSearchConfig } from './config.ts'

const DEFAULT_URL = 'https://api.siliconflow.cn/v1/embeddings'
const DEFAULT_MODEL = 'BAAI/bge-m3'
const BATCH = 16
const TIMEOUT_MS = 30_000

/** Embed a batch of texts into 1024-dim vectors. Throws on failure. */
export async function embedTexts(cfg: ResolvedSearchConfig, texts: string[]): Promise<number[][]> {
  const key = cfg.embedApiKey
  if (!key) throw new Error('embedding API key missing')
  const url = cfg.embedUrl ?? DEFAULT_URL
  const model = cfg.embedModel ?? DEFAULT_MODEL
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const body = await postJson<{ data?: Array<{ embedding?: number[] }> }>(url, { model, input: slice }, key)
    if (!body.data) throw new Error('embedding API error: missing data')
    for (const item of body.data) {
      if (Array.isArray(item.embedding)) out.push(item.embedding)
    }
  }
  return out
}

async function postJson<T>(url: string, payload: unknown, key: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`embedding API HTTP ${res.status}: ${await res.text()}`)
      return (await res.json()) as T
    } catch (err) {
      const retriable = attempt === 0 && err instanceof Error && /HTTP (429|5\d\d)|ECONNRESET|ETIMEDOUT|fetch failed/i.test(err.message)
      if (retriable) {
        await sleep(300)
        continue
      }
      throw err
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
