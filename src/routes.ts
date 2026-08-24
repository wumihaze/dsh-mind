/**
 * dsh-mind HTTP routes: REST API for the Web GUI panel.
 *
 * Endpoints (all under /dsh-mind/):
 *   GET  /dsh-mind/status          — overall plugin status
 *   GET  /dsh-mind/memory          — list memory entries
 *   POST /dsh-mind/memory          — add a memory entry
 *   DELETE /dsh-mind/memory/:idx   — remove a memory entry
 *   GET  /dsh-mind/skills          — skill usage stats
 *   GET  /dsh-mind/curator        — curator state + plan
 *   POST /dsh-mind/curator/run    — trigger curation
 *   POST /dsh-mind/curator/pause  — pause curator
 *   POST /dsh-mind/curator/resume — resume curator
 *   GET  /dsh-mind/snapshots      — list snapshots
 *   POST /dsh-mind/snapshots/:id/rollback — rollback to snapshot
 *   POST /dsh-mind/snapshots/prune         — prune old snapshots
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Minimal structural types for the host context. */
interface WebServerService {
  register(opts: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
}

export interface MindHost {
  readonly webServer: WebServerService
  readonly logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
}

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const MEMORY_FILE = join(DSH_HOME, 'memory', 'MEMORY.md')
const SKILL_USAGE_FILE = join(DSH_HOME, 'skill-usage', 'index.json')
const CURATOR_STATE_FILE = join(DSH_HOME, 'curator', 'state.json')
const SNAPSHOTS_DIR = join(DSH_HOME, 'curator', 'snapshots')
const SKILLS_DIR = join(DSH_HOME, 'skills')

/** Parse MEMORY.md bullet lines into an array. */
async function readMemory(): Promise<string[]> {
  if (!existsSync(MEMORY_FILE)) return []
  const content = await readFile(MEMORY_FILE, 'utf-8')
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
}

/** Write memory entries back to MEMORY.md. */
async function writeMemory(entries: string[]): Promise<void> {
  const dir = join(DSH_HOME, 'memory')
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  const content = entries.map((e) => `- ${e}`).join('\n') + (entries.length > 0 ? '\n' : '')
  await writeFile(MEMORY_FILE, content, 'utf-8')
}

/** Read skill usage index. */
async function readSkillUsage(): Promise<Record<string, unknown>> {
  if (!existsSync(SKILL_USAGE_FILE)) return {}
  return JSON.parse(await readFile(SKILL_USAGE_FILE, 'utf-8'))
}

/** Read curator state. */
async function readCuratorState(): Promise<Record<string, unknown>> {
  if (!existsSync(CURATOR_STATE_FILE)) return { status: 'idle', lastRun: null, runs: 0 }
  return JSON.parse(await readFile(CURATOR_STATE_FILE, 'utf-8'))
}

/** List available skills. */
async function listSkills(): Promise<string[]> {
  if (!existsSync(SKILLS_DIR)) return []
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

/** List snapshots. */
async function listSnapshots(): Promise<Array<{ id: string; time: string }>> {
  if (!existsSync(SNAPSHOTS_DIR)) return []
  const entries = await readdir(SNAPSHOTS_DIR, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => ({ id: e.name.replace('.json', ''), time: e.name.replace('.json', '') }))
    .sort((a, b) => b.time.localeCompare(a.time))
}

/** Read JSON body from an IncomingMessage. */
function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

/** Send JSON response via ServerResponse. */
function json(res: ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/** Send error response via ServerResponse. */
function err(res: ServerResponse, message: string, status = 400): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: message }))
}

/**
 * Mount all dsh-mind HTTP routes.
 * @param host - Host context with webServer service.
 * @returns Disposal function.
 */
export function mountMindRoutes(host: MindHost): () => void {
  const disposes: Array<() => void> = []

  // GET /dsh-mind/status
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/status',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const memory = await readMemory()
        const skills = await listSkills()
        const curator = await readCuratorState()
        json(res, {
          memory: { count: memory.length, budget: 2200 },
          skills: { count: skills.length },
          curator: { status: curator.status ?? 'idle', lastRun: curator.lastRun ?? null, runs: curator.runs ?? 0 },
        })
      },
    }),
  )

  // GET|POST /dsh-mind/memory — one exact route, dispatched on method. The
  // webserver rejects duplicate (kind, path) registrations, and a second exact
  // `/dsh-mind/memory` would abort the whole mount before the skills/curator/
  // snapshots routes register (they'd 404).
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/memory',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'POST') {
          const body = await readBody(req)
          const text = typeof body.text === 'string' ? body.text.trim() : ''
          if (!text) return err(res, 'text is required')
          const entries = await readMemory()
          entries.push(text)
          await writeMemory(entries)
          json(res, { entries, totalChars: entries.join('\n').length }, 201)
          return
        }
        if (req.method !== 'GET') return err(res, 'method not allowed', 405)
        const entries = await readMemory()
        const totalChars = entries.join('\n').length
        json(res, { entries, totalChars, budget: 2200 })
      },
    }),
  )

  // DELETE /dsh-mind/memory/:idx — using prefix matching
  disposes.push(
    host.webServer.register({
      kind: 'prefix',
      path: '/dsh-mind/memory/',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'DELETE') return err(res, 'method not allowed', 405)
        const url = new URL(req.url ?? '', 'http://localhost')
        const parts = url.pathname.split('/')
        const idxStr = parts[parts.length - 1]
        const idx = Number(idxStr)
        if (!Number.isInteger(idx) || idx < 0) return err(res, 'invalid index')
        const entries = await readMemory()
        if (idx >= entries.length) return err(res, 'index out of range', 404)
        entries.splice(idx, 1)
        await writeMemory(entries)
        json(res, { entries, totalChars: entries.join('\n').length })
      },
    }),
  )

  // GET /dsh-mind/skills
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/skills',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const usage = await readSkillUsage()
        const skills = await listSkills()
        json(res, { skills, usage })
      },
    }),
  )

  // GET /dsh-mind/curator
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/curator',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const state = await readCuratorState()
        json(res, state)
      },
    }),
  )

  // POST /dsh-mind/curator/run
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/curator/run',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
      if (_req.method !== 'POST') return err(res, 'method not allowed', 405)
        const state = await readCuratorState()
        state.lastTriggered = new Date().toISOString()
        state.pendingRun = true
        const dir = join(DSH_HOME, 'curator')
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
        await writeFile(CURATOR_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
        json(res, { triggered: true, state })
      },
    }),
  )

  // POST /dsh-mind/curator/pause
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/curator/pause',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return err(res, 'method not allowed', 405)
        const state = await readCuratorState()
        state.status = 'paused'
        const dir = join(DSH_HOME, 'curator')
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
        await writeFile(CURATOR_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
        json(res, state)
      },
    }),
  )

  // POST /dsh-mind/curator/resume
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/curator/resume',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return err(res, 'method not allowed', 405)
        const state = await readCuratorState()
        state.status = 'active'
        const dir = join(DSH_HOME, 'curator')
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
        await writeFile(CURATOR_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
        json(res, state)
      },
    }),
  )

  // GET /dsh-mind/snapshots
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/snapshots',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const snapshots = await listSnapshots()
        json(res, { snapshots })
      },
    }),
  )

  // POST /dsh-mind/snapshots/prune
  disposes.push(
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-mind/snapshots/prune',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return err(res, 'method not allowed', 405)
        const body = await readBody(req)
        const keep = typeof body.keep === 'number' ? body.keep : 10
        const snapshots = await listSnapshots()
        const toPrune = snapshots.slice(keep)
        const { unlink } = await import('node:fs/promises')
        for (const s of toPrune) {
          const f = join(SNAPSHOTS_DIR, `${s.id}.json`)
          if (existsSync(f)) await unlink(f)
        }
        json(res, { pruned: toPrune.length, remaining: Math.max(0, snapshots.length - toPrune.length) })
      },
    }),
  )

  // POST /dsh-mind/snapshots/:id/rollback — using prefix
  disposes.push(
    host.webServer.register({
      kind: 'prefix',
      path: '/dsh-mind/snapshots/',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return err(res, 'method not allowed', 405)
        const url = new URL(req.url ?? '', 'http://localhost')
        const parts = url.pathname.split('/').filter(Boolean)
        // Expected: dsh-mind/snapshots/<id>/rollback
        const id = parts[2]
        const action = parts[3]
        if (action !== 'rollback') return err(res, 'unknown action', 404)
        if (!id) return err(res, 'snapshot id required')
        const snapshotFile = join(SNAPSHOTS_DIR, `${id}.json`)
        if (!existsSync(snapshotFile)) return err(res, 'snapshot not found', 404)
        const snapshot = JSON.parse(await readFile(snapshotFile, 'utf-8'))
        // Restore: write snapshot skills back
        const dir = join(DSH_HOME, 'curator')
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
        const state = await readCuratorState()
        state.lastRollback = { id, time: new Date().toISOString() }
        await writeFile(CURATOR_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
        json(res, { rolledBack: id, snapshot })
      },
    }),
  )

  return () => {
    for (const d of disposes) d()
  }
}
