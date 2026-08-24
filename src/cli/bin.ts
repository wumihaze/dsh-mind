#!/usr/bin/env node
/**
 * dsh-mind — standalone CLI for managing memory and skill curation.
 *
 * Operates directly on data files under ~/.dsh/ without booting a Cordis context.
 * All commands are file-level operations.
 *
 * Usage: dsh-mind <command> [options]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync, statSync, cpSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reindex, resolveSearchConfig, semanticSearch } from '../search/index.ts'

// ─── DSH home resolution ────────────────────────────────────────────────────────

function dshHome(): string {
  const home = process.env['DSH_HOME'] ?? join(homedir(), '.dsh')
  return home
}

function homePath(...segments: string[]): string {
  return join(dshHome(), ...segments)
}

// ─── Data paths ─────────────────────────────────────────────────────────────────

const CURATOR_STATE = () => homePath('curator', 'state.json')
const SNAPSHOTS_DIR = () => homePath('curator', 'snapshots')
const SKILLS_DIR = () => homePath('skills')
const ARCHIVED_DIR = () => homePath('skills', '_archived')
const MEMORY_FILE = () => homePath('memory', 'MEMORY.md')
const USAGE_INDEX = () => homePath('skill-usage', 'index.json')

// ─── Helpers ────────────────────────────────────────────────────────────────────

function readJson<T>(path: string, fallback: T): T {
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJsonAtomic(path: string, data: unknown): void {
  const dir = join(path, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

function now(): string {
  return new Date().toISOString()
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Curator state types ────────────────────────────────────────────────────────

interface CuratorState {
  version: number
  paused: boolean
  lastRunAt: string | null
  skills: Record<string, SkillEntry>
}

interface SkillEntry {
  name: string
  state: 'active' | 'stale' | 'archived'
  lastUsedAt: string | null
  archivedAt: string | null
}

interface SnapshotInfo {
  id: string
  createdAt: string
  description: string
  skills: Record<string, SkillEntry>
}

// ─── Commands ───────────────────────────────────────────────────────────────────

function cmdStatus(): number {
  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })
  const skills = Object.values(state.skills)
  const active = skills.filter(s => s.state === 'active').length
  const stale = skills.filter(s => s.state === 'stale').length
  const archived = skills.filter(s => s.state === 'archived').length

  console.log('═══ dsh-mind status ═══')
  console.log(`  Curator:    ${state.paused ? '⏸ paused' : '● active'}`)
  console.log(`  Last run:   ${state.lastRunAt ? formatAgo(state.lastRunAt) : 'never'}`)
  console.log(`  Skills:     ${skills.length} total (${active} active, ${stale} stale, ${archived} archived)`)

  // Memory
  if (existsSync(MEMORY_FILE())) {
    const content = readFileSync(MEMORY_FILE(), 'utf8')
    const entries = content.split('\n').filter(l => l.trim().startsWith('- '))
    console.log(`  Memory:     ${entries.length} entries`)
  } else {
    console.log(`  Memory:     0 entries (no file)`)
  }

  // Usage
  const usage = readJson<Record<string, { count: number; lastUsed: string }>>(USAGE_INDEX(), {})
  if (Object.keys(usage).length > 0) {
    console.log(`  Usage:      ${Object.keys(usage).length} tracked skills`)
  }

  return 0
}

function cmdRun(): number {
  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })

  if (state.paused) {
    console.log('Curator is paused. Use "dsh-mind resume" to re-enable.')
    return 0
  }

  const usage = readJson<Record<string, { count: number; lastUsed: string }>>(USAGE_INDEX(), {})
  const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

  let changed = 0
  for (const [name, entry] of Object.entries(state.skills)) {
    if (entry.state !== 'active') continue
    const usageEntry = usage[name]
    const lastUsed = usageEntry?.lastUsed ?? entry.lastUsedAt
    if (lastUsed && Date.now() - new Date(lastUsed).getTime() > STALE_THRESHOLD_MS) {
      entry.state = 'stale'
      changed++
    }
  }

  state.lastRunAt = now()
  writeJsonAtomic(CURATOR_STATE(), state)

  console.log(`Curation run complete: ${changed} skill(s) marked stale, ${Object.keys(state.skills).length - changed} active.`)
  return 0
}

function cmdPause(): number {
  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })
  state.paused = true
  writeJsonAtomic(CURATOR_STATE(), state)
  console.log('Curator paused.')
  return 0
}

function cmdResume(): number {
  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })
  state.paused = false
  writeJsonAtomic(CURATOR_STATE(), state)
  console.log('Curator resumed.')
  return 0
}

function cmdArchive(name: string): number {
  const skillsDir = SKILLS_DIR()
  const src = join(skillsDir, name)
  const dest = join(ARCHIVED_DIR(), name)

  if (!existsSync(src)) {
    console.error(`Error: skill "${name}" not found at ${src}`)
    return 2
  }
  if (existsSync(dest)) {
    console.error(`Error: archived skill "${name}" already exists`)
    return 1
  }

  mkdirSync(ARCHIVED_DIR(), { recursive: true })
  renameSync(src, dest)

  // Update state
  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })
  if (!state.skills[name]) {
    state.skills[name] = { name, state: 'active', lastUsedAt: null, archivedAt: null }
  }
  state.skills[name].state = 'archived'
  state.skills[name].archivedAt = now()
  writeJsonAtomic(CURATOR_STATE(), state)

  console.log(`Archived skill "${name}".`)
  return 0
}

function cmdRestore(name: string): number {
  const src = join(ARCHIVED_DIR(), name)
  const dest = join(SKILLS_DIR(), name)

  if (!existsSync(src)) {
    console.error(`Error: archived skill "${name}" not found`)
    return 2
  }
  if (existsSync(dest)) {
    console.error(`Error: skill "${name}" already exists (not archived)`)
    return 1
  }

  renameSync(src, dest)

  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })
  if (state.skills[name]) {
    state.skills[name].state = 'active'
    state.skills[name].archivedAt = null
  }
  writeJsonAtomic(CURATOR_STATE(), state)

  console.log(`Restored skill "${name}".`)
  return 0
}

function cmdList(): number {
  const skillsDir = SKILLS_DIR()
  const archivedDir = ARCHIVED_DIR()
  const state = readJson<CuratorState>(CURATOR_STATE(), { version: 1, paused: false, lastRunAt: null, skills: {} })

  const entries: { name: string; state: string; lastUsed: string | null }[] = []

  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue
      const skillFile = join(skillsDir, entry.name, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      const st = state.skills[entry.name]
      entries.push({
        name: entry.name,
        state: st?.state ?? 'active',
        lastUsed: st?.lastUsedAt ?? null,
      })
    }
  }

  if (existsSync(archivedDir)) {
    for (const entry of readdirSync(archivedDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const st = state.skills[entry.name]
      entries.push({
        name: entry.name,
        state: 'archived',
        lastUsed: st?.lastUsedAt ?? null,
      })
    }
  }

  if (entries.length === 0) {
    console.log('No skills found.')
    return 0
  }

  // Table output
  const nameW = Math.max(4, ...entries.map(e => e.name.length))
  const stateW = 8
  console.log(`  ${'NAME'.padEnd(nameW)}  ${'STATE'.padEnd(stateW)}  LAST USED`)
  console.log('  ' + '─'.repeat(nameW + stateW + 12))
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const lastUsed = e.lastUsed ? formatAgo(e.lastUsed) : '—'
    console.log(`  ${e.name.padEnd(nameW)}  ${e.state.padEnd(stateW)}  ${lastUsed}`)
  }
  console.log(`\n  ${entries.length} skill(s)`)
  return 0
}

function cmdSnapshots(): number {
  const dir = SNAPSHOTS_DIR()
  if (!existsSync(dir)) {
    console.log('No snapshots.')
    return 0
  }
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
  if (files.length === 0) {
    console.log('No snapshots.')
    return 0
  }
  console.log(`  ${'ID'.padEnd(20)}  ${'CREATED'.padEnd(22)}  DESCRIPTION`)
  console.log('  ' + '─'.repeat(60))
  for (const f of files) {
    const id = f.replace('.json', '')
    try {
      const snap = JSON.parse(readFileSync(join(dir, f), 'utf8')) as SnapshotInfo
      const created = snap.createdAt ? new Date(snap.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '—'
      console.log(`  ${id.padEnd(20)}  ${created.padEnd(22)}  ${snap.description ?? ''}`)
    } catch {
      console.log(`  ${id.padEnd(20)}  (unreadable)`)
    }
  }
  return 0
}

function cmdRollback(id: string): number {
  const dir = SNAPSHOTS_DIR()
  const snapFile = join(dir, `${id}.json`)
  if (!existsSync(snapFile)) {
    console.error(`Error: snapshot "${id}" not found`)
    return 2
  }
  const snap = JSON.parse(readFileSync(snapFile, 'utf8')) as SnapshotInfo
  const state: CuratorState = { version: 1, paused: false, lastRunAt: null, skills: snap.skills }
  writeJsonAtomic(CURATOR_STATE(), state)
  console.log(`Rolled back to snapshot "${id}" (${Object.keys(snap.skills).length} skills).`)
  return 0
}

function cmdPrune(days: number): number {
  const dir = SNAPSHOTS_DIR()
  if (!existsSync(dir)) {
    console.log('Nothing to prune.')
    return 0
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let removed = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const filePath = join(dir, f)
    const mtime = statSync(filePath).mtimeMs
    if (mtime < cutoff) {
      rmSync(filePath)
      removed++
    }
  }
  console.log(`Pruned ${removed} snapshot(s) older than ${days} days.`)
  return 0
}

// ─── Memory commands ────────────────────────────────────────────────────────────

function cmdMemoryAdd(text: string): number {
  const file = MEMORY_FILE()
  if (!existsSync(file)) {
    const dir = join(file, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(file, '# Memory\n\n', 'utf8')
  }
  const line = `- ${text}`
  const content = readFileSync(file, 'utf8')
  const entries = content.split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.slice(2))
  const total = [...entries, text].join('\n').length
  if (total > 2200) {
    console.error(`Error: memory budget exceeded: ${total} > 2200 characters; replace or remove an entry first`)
    return 1
  }
  writeFileSync(file, content.trimEnd() + '\n' + line + '\n', 'utf8')
  console.log(`Added memory: ${text}`)
  return 0
}

async function cmdMemorySearch(keyword: string): Promise<number> {
  const file = MEMORY_FILE()
  if (!existsSync(file)) {
    console.log('No memory file found.')
    return 0
  }
  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')
  const lower = keyword.toLowerCase()
  const hits: { line: number; text: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.toLowerCase().includes(lower)) {
      hits.push({ line: i + 1, text: line.trim() })
    }
  }
  if (hits.length > 0) {
    console.log(`${hits.length} match(es) for "${keyword}":\n`)
    for (const h of hits) {
      console.log(`  L${h.line}: ${h.text}`)
    }
  } else {
    console.log(`No matches for "${keyword}".`)
  }
  // Semantic augment (best-effort; skips silently when not configured).
  const cfg = resolveSearchConfig(void 0, dshHome())
  if (cfg) {
    const semantic = await semanticSearch(dshHome(), keyword, cfg)
    if (semantic && semantic.length > 0) {
      const kwText = new Set(hits.map((h) => h.text))
      const memoExtra = semantic.filter((h) => h.kind === 'memo' && !kwText.has(h.text))
      const topicHits = semantic.filter((h) => h.kind === 'topic')
      if (memoExtra.length + topicHits.length > 0) {
        console.log(`\nSemantic matches (${memoExtra.length + topicHits.length}):`)
        for (const m of memoExtra) console.log(`  [semantic] ${m.text}`)
        for (const t of topicHits) console.log(`  [topic ${t.name}.md] ${t.text.length > 140 ? `${t.text.slice(0, 140)}…` : t.text}`)
      }
    }
  }
  return 0
}

async function cmdMemoryReindex(): Promise<number> {
  const cfg = resolveSearchConfig(void 0, dshHome())
  if (!cfg) {
    console.error('Error: semantic search not configured. Set DSH_MIND_EMBED_KEY, DSH_MIND_VECTOR_URL and DSH_MIND_VECTOR_KEY, or write ~/.dsh/memory/.vector-config.json.')
    return 1
  }
  console.log('Reindexing vector store…')
  try {
    await reindex(dshHome(), cfg)
    console.log('Reindex complete.')
    return 0
  } catch (err) {
    console.error(`Error: reindex failed: ${(err as Error).message}`)
    return 1
  }
}

function cmdMemoryList(): number {
  const file = MEMORY_FILE()
  if (!existsSync(file)) {
    console.log('No memory file found.')
    return 0
  }
  const content = readFileSync(file, 'utf8')
  const entries = content.split('\n').filter(l => l.trim().startsWith('- '))
  if (entries.length === 0) {
    console.log('Memory file is empty.')
    return 0
  }
  console.log(`${entries.length} memory entries:\n`)
  for (const e of entries) {
    console.log(`  ${e}`)
  }
  return 0
}

// ─── Argument parsing (no external deps) ────────────────────────────────────────

// ─── Preset management ──────────────────────────────────────────────────────────

/** Resolve the package root (the directory containing package.json). */
function packageRoot(): string {
  // bin.js is at <pkg>/lib/cli/bin.js → package root is ../../
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..')
}

/** List bundled presets available in this package. */
function bundledPresets(): string[] {
  const dir = join(packageRoot(), 'presets')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
}

function cmdInstallPreset(name?: string): number {
  const presets = bundledPresets()
  if (presets.length === 0) {
    console.error('Error: no bundled presets found in this package.')
    return 1
  }

  if (!name) {
    console.log(`Available presets: ${presets.join(', ')}`)
    console.error('Usage: dsh-mind install-preset <name>')
    return 2
  }

  if (!presets.includes(name)) {
    console.error(`Error: unknown preset "${name}". Available: ${presets.join(', ')}`)
    return 2
  }

  const src = join(packageRoot(), 'presets', name)
  const dst = join(dshHome(), '.agent-presets', name)

  try {
    // Create target directory
    const dstParent = join(dshHome(), '.agent-presets')
    if (!existsSync(dstParent)) mkdirSync(dstParent, { recursive: true })
    // Remove existing preset if present
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true })
    // Copy
    cpSync(src, dst, { recursive: true })
  } catch (err) {
    console.error(`Error: failed to install preset: ${(err as Error).message}`)
    return 1
  }

  console.log(`✓ Preset "${name}" installed to ${dst}`)
  console.log('  Select it when starting a DSH session to activate dsh-mind capabilities.')
  return 0
}

function cmdUninstallPreset(name?: string): number {
  if (!name) {
    console.error('Usage: dsh-mind uninstall-preset <name>')
    return 2
  }

  const dst = join(dshHome(), '.agent-presets', name)
  if (!existsSync(dst)) {
    console.error(`Error: preset "${name}" not found at ${dst}`)
    return 1
  }

  try {
    rmSync(dst, { recursive: true, force: true })
  } catch (err) {
    console.error(`Error: failed to uninstall preset: ${(err as Error).message}`)
    return 1
  }

  console.log(`✓ Preset "${name}" removed from ${dst}`)
  return 0
}

function printHelp(): void {
  console.log(`dsh-mind — manage memory and skill curation

Usage: dsh-mind <command> [options]

Curator commands:
  status                    Show curator status and skill summary
  run                       Execute a curation pass (heuristic)
  pause                     Pause auto-curation
  resume                    Resume auto-curation
  archive <name>            Archive a skill (move to _archived/)
  restore <name>            Restore an archived skill
  list                      List all skills with their status
  snapshots                 List available snapshots
  rollback <id>             Restore state from a snapshot
  prune --days <N>          Delete snapshots older than N days (default: 30)

Memory commands:
  memory add <text>         Add a memory entry
  memory search <keyword>   Search memory entries (keyword + semantic when configured)
  memory list               List all memory entries
  memory reindex            Rebuild the semantic vector index

Preset commands:
  install-preset [name]     Install a bundled agent preset to ~/.dsh/.agent-presets/
  uninstall-preset <name>   Remove an installed dsh-mind preset

Options:
  -h, --help                Show this help
  -V, --version             Show version

Exit codes: 0=success, 1=failure, 2=parameter error
`)
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help' || args[0] === 'help') {
    printHelp()
    return 0
  }

  if (args[0] === '-V' || args[0] === '--version') {
    console.log('dsh-mind 0.1.0')
    return 0
  }

  const cmd = args[0]

  switch (cmd) {
    case 'status':
      return cmdStatus()
    case 'run':
      return cmdRun()
    case 'pause':
      return cmdPause()
    case 'resume':
      return cmdResume()
    case 'archive': {
      const name = args[1]
      if (!name) {
        console.error('Error: "archive" requires a skill name.')
        console.error('Usage: dsh-mind archive <name>')
        return 2
      }
      return cmdArchive(name)
    }
    case 'restore': {
      const name = args[1]
      if (!name) {
        console.error('Error: "restore" requires a skill name.')
        console.error('Usage: dsh-mind restore <name>')
        return 2
      }
      return cmdRestore(name)
    }
    case 'list':
      return cmdList()
    case 'snapshots':
      return cmdSnapshots()
    case 'rollback': {
      const id = args[1]
      if (!id) {
        console.error('Error: "rollback" requires a snapshot id.')
        console.error('Usage: dsh-mind rollback <id>')
        return 2
      }
      return cmdRollback(id)
    }
    case 'prune': {
      let days = 30
      const daysIdx = args.indexOf('--days')
      if (daysIdx !== -1) {
        const val = args[daysIdx + 1]
        if (!val) {
          console.error('Error: --days requires a value.')
          return 2
        }
        days = parseInt(val, 10)
        if (isNaN(days) || days < 1) {
          console.error('Error: --days requires a positive integer.')
          return 2
        }
      }
      return cmdPrune(days)
    }
    case 'memory': {
      const sub = args[1]
      if (sub === 'add') {
        const text = args.slice(2).join(' ')
        if (!text) {
          console.error('Error: "memory add" requires text.')
          console.error('Usage: dsh-mind memory add <text>')
          return 2
        }
        return cmdMemoryAdd(text)
      }
      if (sub === 'search') {
        const keyword = args[2]
        if (!keyword) {
          console.error('Error: "memory search" requires a keyword.')
          console.error('Usage: dsh-mind memory search <keyword>')
          return 2
        }
        return cmdMemorySearch(keyword)
      }
      if (sub === 'list') {
        return cmdMemoryList()
      }
      if (sub === 'reindex') {
        return cmdMemoryReindex()
      }
      console.error('Error: unknown memory subcommand.')
      console.error('Usage: dsh-mind memory <add|search|list|reindex> ...')
      return 2
    }
    case 'install-preset':
      return cmdInstallPreset(args[1])
    case 'uninstall-preset': {
      const name = args[1]
      if (!name) {
        console.error('Error: "uninstall-preset" requires a preset name.')
        console.error('Usage: dsh-mind uninstall-preset <name>')
        return 2
      }
      return cmdUninstallPreset(name)
    }
    default:
      console.error(`Error: unknown command "${cmd}".`)
      console.error('Run "dsh-mind --help" for usage.')
      return 2
  }
}

main().then(
  (exitCode) => process.exit(exitCode),
  (err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
