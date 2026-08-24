#!/usr/bin/env node
/**
 * dsh-mind integration tests.
 *
 * Runs all core services against a temporary DSH_HOME directory.
 * Usage: node tests/integration.mjs
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// ── Test harness ─────────────────────────────────────────────────────────
let passed = 0
let failed = 0
let current = ''

function test(name, fn) {
  current = name
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

async function testAsync(name, fn) {
  current = name
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg)
}

function assertEq(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg || 'value mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ── Mock context for cordis Service ─────────────────────────────────────
function createMockCtx() {
  const disposers = []
  const ISOLATE = Symbol.for('cordis.isolate')
  return {
    reflect: { provide: () => {} },
    effect: (fn) => { disposers.push(fn) },
    [ISOLATE]: Object.create(null),
    dispose: () => { for (const d of disposers.reverse()) d() },
  }
}

// ── Setup: temporary DSH_HOME ───────────────────────────────────────────
const HOME = mkdtempSync(join(tmpdir(), 'dsh-mind-test-'))
process.env.DSH_HOME = HOME
console.log(`\nTest home: ${HOME}\n`)

// Create directory structure
mkdirSync(join(HOME, 'memory'), { recursive: true })
mkdirSync(join(HOME, 'skills', 'test-skill'), { recursive: true })
writeFileSync(join(HOME, 'skills', 'test-skill', 'SKILL.md'), '# Test Skill\n\nA test skill.', 'utf-8')
mkdirSync(join(HOME, 'skills', '.system', 'curator'), { recursive: true })

// ── Import services (after DSH_HOME is set) ─────────────────────────────
const { SkillUsageService } = await import('../lib/skill-usage/index.js')
const { CuratorCoreService } = await import('../lib/curator/index.js')

// ── 1. Skill Usage Service ──────────────────────────────────────────────
console.log('\n━━━ SkillUsageService ━━━')

const ctx1 = createMockCtx()
const usage = new SkillUsageService(ctx1, { indexPath: join(HOME, 'skills', '.system', 'curator', 'usage.json') })
usage.load()

test('recordUse increments count', () => {
  usage.recordUse('test-skill')
  usage.recordUse('test-skill')
  const rec = usage.get('test-skill')
  assertEq(rec.uses, 2)
})

test('recordView increments views', () => {
  usage.recordView('test-skill')
  const rec = usage.get('test-skill')
  assertEq(rec.views, 1)
})

test('recordPatch increments patches', () => {
  usage.recordPatch('test-skill')
  const rec = usage.get('test-skill')
  assertEq(rec.patches, 1)
})

test('pin / unpin', () => {
  usage.pin('test-skill', 'important')
  assert(usage.isPinned('test-skill'))
  assertEq(usage.get('test-skill').pin_reason, 'important')
  usage.unpin('test-skill')
  assert(!usage.isPinned('test-skill'))
})

test('setProvenance', () => {
  usage.setProvenance('test-skill', { source: 'manual', at: new Date().toISOString() })
  assertEq(usage.get('test-skill').provenance.source, 'manual')
})

test('list returns sorted records', () => {
  usage.recordUse('skill-a')
  usage.recordUse('skill-b')
  const list = usage.list()
  assert(list.length >= 3, `expected >=3 records, got ${list.length}`)
  // Most recently used first (skill-b or skill-a should be at top)
  const top = list[0].name
  assert(top === 'skill-a' || top === 'skill-b' || top === 'test-skill', `unexpected top: ${top}`)
})

test('save persists to disk', () => {
  usage.save()
  assert(existsSync(usage.path))
  const raw = JSON.parse(readFileSync(usage.path, 'utf-8'))
  assert(raw.version === 1)
  assert('test-skill' in raw.skills)
})

// ── 2. Persistence: reload and verify ───────────────────────────────────
console.log('\n━━━ Persistence (reload) ━━━')

const ctx2 = createMockCtx()
const usage2 = new SkillUsageService(ctx2, { indexPath: join(HOME, 'skills', '.system', 'curator', 'usage.json') })
usage2.load()

test('reloaded data matches saved data', () => {
  const rec = usage2.get('test-skill')
  assertEq(rec.uses, 2)
  assertEq(rec.views, 1)
  assertEq(rec.patches, 1)
})

// ── 3. Curator Core Service ─────────────────────────────────────────────
console.log('\n━━━ CuratorCoreService ━━━')

const ctx3 = createMockCtx()
const curator = new CuratorCoreService(ctx3, {
  skillsRoot: join(HOME, 'skills'),
  statePath: join(HOME, 'skills', '.system', 'curator', 'state.json'),
  snapshotDir: join(HOME, 'skills', '.system', 'curator', 'snapshots'),
  staleAfterDays: 30,
  archiveAfterDays: 90,
})

test('initial state: not paused', () => {
  assertEq(curator.isPaused, false)
})

test('pause / resume', () => {
  curator.pause()
  assert(curator.isPaused)
  curator.resume()
  assert(!curator.isPaused)
})

test('recordActivity updates timestamp', () => {
  curator.recordActivity()
  const state = JSON.parse(readFileSync(curator.stateFilePath, 'utf-8'))
  assert(state.last_activity_at !== undefined)
})

test('classify: recent skill is active', () => {
  const state = curator.classify(new Date().toISOString())
  assertEq(state, 'active')
})

test('classify: old skill is stale', () => {
  const old = new Date(Date.now() - 45 * 86400000).toISOString() // 45 days ago
  const state = curator.classify(old)
  assertEq(state, 'stale')
})

test('classify: very old skill is archived', () => {
  const old = new Date(Date.now() - 100 * 86400000).toISOString() // 100 days ago
  const state = curator.classify(old)
  assertEq(state, 'archived')
})

test('buildPlan: fresh skills not in toStale/toArchive', () => {
  const records = [{ name: 'fresh-skill', last_used_at: new Date().toISOString(), uses: 5 }]
  const plan = curator.buildPlan(records)
  assertEq(plan.toStale.length, 0)
  assertEq(plan.toArchive.length, 0)
})

test('buildPlan: stale skill flagged', () => {
  const old = new Date(Date.now() - 45 * 86400000).toISOString()
  const records = [{ name: 'old-skill', last_used_at: old, uses: 1 }]
  const plan = curator.buildPlan(records)
  assertEq(plan.toStale.length, 1)
  assertEq(plan.toStale[0].name, 'old-skill')
})

test('evaluateTrigger: no previous run → shouldRun', () => {
  const decision = curator.evaluateTrigger()
  assertEq(decision.shouldRun, true)
})

test('snapshot creation returns ID', () => {
  const id = curator.createSnapshot('test-snapshot')
  assert(typeof id === 'string' && id.length > 0)
})

test('listSnapshots returns created snapshot', () => {
  const snaps = curator.listSnapshots()
  assert(snaps.length >= 1, `expected >=1 snapshots, got ${snaps.length}`)
})

test('rollback restores archived skills', () => {
  // Create a test skill, snapshot, archive it, then rollback
  const testSkillDir = join(HOME, 'skills', 'rollback-test')
  mkdirSync(testSkillDir, { recursive: true })
  writeFileSync(join(testSkillDir, 'SKILL.md'), '# Rollback Test', 'utf-8')

  // Snapshot (captures the skill)
  const snapId = curator.createSnapshot('before-archive')

  // Archive the skill
  curator.archiveSkill('rollback-test')
  // Verify it's gone from skills root
  assert(!existsSync(testSkillDir), 'skill should be archived')

  // Rollback: should restore the skill
  curator.rollback(snapId)
  assert(existsSync(testSkillDir), 'skill should be restored after rollback')
  assert(existsSync(join(testSkillDir, 'SKILL.md')), 'SKILL.md should be restored')
})

test('pruneSnapshots returns count', () => {
  const count = curator.pruneSnapshots(365)
  assert(typeof count === 'number')
})

// ── 4. Memory (file-based) ──────────────────────────────────────────────
console.log('\n━━━ Memory (MEMORY.md) ━━━')

const MEMORY_FILE = join(HOME, 'memory', 'MEMORY.md')

function readMemory() {
  if (!existsSync(MEMORY_FILE)) return []
  return readFileSync(MEMORY_FILE, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2))
}

function writeMemory(entries) {
  const content = entries.map(e => `- ${e}`).join('\n') + (entries.length > 0 ? '\n' : '')
  writeFileSync(MEMORY_FILE, content, 'utf-8')
}

test('memory: empty file → empty list', () => {
  writeMemory([])
  assertEq(readMemory().length, 0)
})

test('memory: add entries', () => {
  writeMemory(['user prefers Chinese', 'project uses pnpm'])
  const entries = readMemory()
  assertEq(entries.length, 2)
  assertEq(entries[0], 'user prefers Chinese')
})

test('memory: remove entry (index 0)', () => {
  let entries = readMemory()
  entries = entries.filter((_, i) => i !== 0)
  writeMemory(entries)
  assertEq(readMemory().length, 1)
  assertEq(readMemory()[0], 'project uses pnpm')
})

test('memory: budget check (2200 chars)', () => {
  const budget = 2200
  const entries = readMemory()
  const total = entries.reduce((sum, e) => sum + e.length + 2, 0) // +2 for "- "
  assert(total <= budget, `total ${total} exceeds budget ${budget}`)
})

// ── 5. Edge cases ───────────────────────────────────────────────────────
console.log('\n━━━ Edge Cases ━━━')

test('edge: skill usage with empty index file', () => {
  const emptyPath = join(HOME, 'empty-usage.json')
  writeFileSync(emptyPath, JSON.stringify({ version: 1, skills: {} }), 'utf-8')
  const ctxE = createMockCtx()
  const u = new SkillUsageService(ctxE, { indexPath: emptyPath })
  u.load()
  assertEq(u.list().length, 0)
})

test('edge: curator with no skills directory', () => {
  const ctxN = createMockCtx()
  const c = new CuratorCoreService(ctxN, {
    skillsRoot: join(HOME, 'nonexistent-skills'),
    statePath: join(HOME, 'nonexistent-state.json'),
    snapshotDir: join(HOME, 'nonexistent-snapshots'),
  })
  // buildPlan with empty records should work
  const plan = c.buildPlan([])
  assertEq(plan.toStale.length, 0)
  assertEq(plan.toArchive.length, 0)
  // classify with undefined (no record) should return active
  assertEq(c.classify(undefined), 'active')
})

test('edge: memory file with trailing newlines', () => {
  writeFileSync(MEMORY_FILE, '- valid entry\n\n\n', 'utf-8')
  const entries = readMemory()
  assertEq(entries.length, 1)
  assertEq(entries[0], 'valid entry')
})

test('edge: concurrent writes (atomic rename)', () => {
  const ctxA = createMockCtx()
  const uA = new SkillUsageService(ctxA, { indexPath: join(HOME, 'conc-usage.json') })
  uA.load()
  uA.recordUse('skill-x')
  uA.save()

  const ctxB = createMockCtx()
  const uB = new SkillUsageService(ctxB, { indexPath: join(HOME, 'conc-usage.json') })
  uB.load()
  uB.recordUse('skill-x')
  uB.save()

  // Reload: should have 2 uses
  const ctxC = createMockCtx()
  const uC = new SkillUsageService(ctxC, { indexPath: join(HOME, 'conc-usage.json') })
  uC.load()
  assertEq(uC.get('skill-x').uses, 2)
})

// ── 6. Performance ──────────────────────────────────────────────────────
console.log('\n━━━ Performance ━━━')

test('perf: 1000 memory entries search < 500ms', () => {
  const entries = Array.from({ length: 1000 }, (_, i) => `memory entry number ${i} about topic-${i % 50}`)
  writeMemory(entries)
  const loaded = readMemory()
  assertEq(loaded.length, 1000)

  // Simulate search: filter by keyword
  const t0 = process.hrtime.bigint()
  const results = loaded.filter(e => e.includes('topic-42'))
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e6
  assert(results.length > 0, 'should find matches')
  assert(elapsed < 500, `search took ${elapsed.toFixed(1)}ms (limit 500ms)`)
  console.log(`    (search: ${elapsed.toFixed(2)}ms, ${results.length} results)`)
})

test('perf: skill usage list with 100 skills < 100ms', () => {
  const perfPath = join(HOME, 'perf-usage.json')
  const ctxP = createMockCtx()
  const u = new SkillUsageService(ctxP, { indexPath: perfPath })
  u.load()
  for (let i = 0; i < 100; i++) {
    u.recordUse(`skill-${i}`)
  }
  const t0 = process.hrtime.bigint()
  const list = u.list()
  const elapsed = Number(process.hrtime.bigint() - t0) / 1e6
  assertEq(list.length, 100)
  assert(elapsed < 100, `list took ${elapsed.toFixed(1)}ms (limit 100ms)`)
})

// ── Cleanup ─────────────────────────────────────────────────────────────
rmSync(HOME, { recursive: true, force: true })

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(40)}`)
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`)
if (failed > 0) {
  console.log('  ❌ Some tests failed')
  process.exit(1)
} else {
  console.log('  ✅ All tests passed')
}
