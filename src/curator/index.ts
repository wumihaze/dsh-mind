/**
 * Skill curation core service.
 *
 * Provides the state machine (active → stale → archived), trigger evaluation,
 * backup/rollback via directory snapshots, and report generation.
 *
 * @module @wumihaze/dsh-mind/curator
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, readdirSync, statSync, cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { SkillUsageRecord } from '../skill-usage/index.ts'
import type {
  Config,
  CurationPlan,
  CurationResult,
  CuratorState,
  SnapshotInfo,
  SkillState,
  TriggerDecision,
} from './types.ts'

export type { Config, CurationPlan, CurationResult, CuratorState, SnapshotInfo, SkillState, TriggerDecision } from './types.ts'

const DEFAULTS = {
  staleAfterDays: 30,
  archiveAfterDays: 90,
  intervalDays: 7,
  minIdleMinutes: 120,
} as const

/**
 * Host-plane curation service for the skill library.
 *
 * Exposes `ctx.curator` with state-machine classification, trigger
 * evaluation, snapshot backup/rollback, and report generation.
 *
 * The service reads skill usage records from the `skillUsage` service
 * (optional; when absent, all skills are classified as `noRecord`).
 * It never modifies skill files directly — archival is a directory
 * rename into a `.system/archive/` subdirectory.
 */
export class CuratorCoreService extends Service {
  private state: CuratorState = { version: 1, paused: false }
  private readonly statePath: string
  private readonly snapshotDir: string
  private readonly skillsRoot: string
  private readonly thresholds: { staleAfterDays: number; archiveAfterDays: number; intervalDays: number; minIdleMinutes: number }

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'curator')
    this.thresholds = {
      staleAfterDays: config.staleAfterDays ?? DEFAULTS.staleAfterDays,
      archiveAfterDays: config.archiveAfterDays ?? DEFAULTS.archiveAfterDays,
      intervalDays: config.intervalDays ?? DEFAULTS.intervalDays,
      minIdleMinutes: config.minIdleMinutes ?? DEFAULTS.minIdleMinutes,
    }
    this.skillsRoot = config.skillsRoot ?? dshHomePath('skills')
    this.statePath = config.statePath ?? dshHomePath('skills', '.system', 'curator', 'state.json')
    this.snapshotDir = config.snapshotDir ?? dshHomePath('skills', '.system', 'curator', 'snapshots')
    this.loadState()
    ctx.effect(() => () => {
      this.saveState()
    })
  }

  // ── State management ─────────────────────────────────────────────

  private loadState(): void {
    try {
      const raw = readFileSync(this.statePath, 'utf8')
      const parsed = JSON.parse(raw) as CuratorState
      if (parsed.version !== 1) throw new Error(`unsupported curator state version: ${parsed.version}`)
      this.state = parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private saveState(): void {
    const dir = dirname(this.statePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.statePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf8')
    renameSync(tmp, this.statePath)
  }

  /** Record user activity (resets the idle timer). */
  recordActivity(): void {
    this.state.last_activity_at = new Date().toISOString()
    this.saveState()
  }

  /** Whether automatic curation is paused. */
  get isPaused(): boolean {
    return this.state.paused
  }

  /** Pause automatic curation. */
  pause(): void {
    this.state.paused = true
    this.saveState()
  }

  /** Resume automatic curation. */
  resume(): void {
    this.state.paused = false
    this.saveState()
  }

  // ── State machine ────────────────────────────────────────────────

  /**
   * Classify a skill's lifecycle state based on its last usage timestamp.
   * @param lastUsedAt - ISO timestamp of the most recent use, or undefined.
   * @param now - reference time (defaults to current time).
   * @returns the skill's state.
   */
  classify(lastUsedAt: string | undefined, now: Date = new Date()): SkillState {
    if (lastUsedAt === undefined) return 'active'
    const days = (now.getTime() - new Date(lastUsedAt).getTime()) / 86_400_000
    if (days >= this.thresholds.archiveAfterDays) return 'archived'
    if (days >= this.thresholds.staleAfterDays) return 'stale'
    return 'active'
  }

  /**
   * Build a curation plan from the current usage records.
   * @param records - usage records to evaluate.
   * @param now - reference time.
   * @returns the plan describing what would change.
   */
  buildPlan(records: ReadonlyArray<SkillUsageRecord>, now: Date = new Date()): CurationPlan {
    const plan: CurationPlan = { toStale: [], toArchive: [], pinned: [], noRecord: [] }
    for (const record of records) {
      if (record.pinned === true) {
        plan.pinned.push(record.name)
        continue
      }
      const state = this.classify(record.last_used_at, now)
      if (state === 'stale') plan.toStale.push({ name: record.name, lastUsedAt: record.last_used_at })
      else if (state === 'archived') plan.toArchive.push({ name: record.name, lastUsedAt: record.last_used_at })
    }
    return plan
  }

  // ── Trigger evaluation ───────────────────────────────────────────

  /**
   * Evaluate whether the automatic curation trigger conditions are met.
   * @param now - reference time.
   * @returns the trigger decision with a human-readable reason.
   */
  evaluateTrigger(now: Date = new Date()): TriggerDecision {
    if (this.state.paused) return { shouldRun: false, reason: 'curation is paused' }
    if (this.state.last_run_at === undefined) return { shouldRun: true, reason: 'no previous run' }
    const lastRun = new Date(this.state.last_run_at).getTime()
    const elapsedDays = (now.getTime() - lastRun) / 86_400_000
    if (elapsedDays < this.thresholds.intervalDays) {
      return { shouldRun: false, reason: `last run ${elapsedDays.toFixed(1)} days ago (interval: ${this.thresholds.intervalDays} days)` }
    }
    if (this.state.last_activity_at !== undefined) {
      const idleMinutes = (now.getTime() - new Date(this.state.last_activity_at).getTime()) / 60_000
      if (idleMinutes < this.thresholds.minIdleMinutes) {
        return { shouldRun: false, reason: `only idle ${idleMinutes.toFixed(0)} minutes (minimum: ${this.thresholds.minIdleMinutes} minutes)` }
      }
    }
    return { shouldRun: true, reason: `idle for sufficient time, last run ${elapsedDays.toFixed(1)} days ago` }
  }

  // ── Execute ──────────────────────────────────────────────────────

  /**
   * Execute a curation plan: archive the listed skills into
   * `.system/archive/` and record the run.
   *
   * @param plan - the plan to execute.
   * @param options - execution options.
   * @returns the result report.
   */
  execute(plan: CurationPlan, options: { dryRun?: boolean } = {}): CurationResult {
    const dryRun = options.dryRun === true
    const now = new Date()
    const archived = plan.toArchive.map(e => e.name)
    const stale = plan.toStale.map(e => e.name)

    if (!dryRun) {
      this.createSnapshot('pre-curation')
      for (const name of archived) {
        this.archiveSkill(name)
      }
      this.state.last_run_at = now.toISOString()
      this.saveState()
    }

    const lines: string[] = []
    lines.push(`Curation ${dryRun ? 'plan (dry-run)' : 'completed'}: ${now.toISOString()}`)
    lines.push(`  Stale: ${stale.length > 0 ? stale.join(', ') : 'none'}`)
    lines.push(`  Archived: ${archived.length > 0 ? archived.join(', ') : 'none'}`)
    lines.push(`  Pinned (skipped): ${plan.pinned.length > 0 ? plan.pinned.join(', ') : 'none'}`)

    const snapshotId = dryRun ? undefined : this.lastSnapshotId
    const result: CurationResult = {
      dryRun,
      completedAt: now.toISOString(),
      stale,
      archived,
      report: lines.join('\n'),
    }
    if (snapshotId !== undefined) result.snapshotId = snapshotId
    return result
  }

  private lastSnapshotId?: string

  // ── Archive / Restore ────────────────────────────────────────────

  /**
   * Archive a skill by moving its directory into `.system/archive/`.
   * @param name - skill name (directory name under skillsRoot).
   */
  archiveSkill(name: string): void {
    const src = join(this.skillsRoot, name)
    if (!existsSync(src)) throw new Error(`skill not found: ${name}`)
    const archiveDir = join(this.skillsRoot, '.system', 'archive')
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true })
    const dest = join(archiveDir, name)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(src, dest)
  }

  /**
   * Restore an archived skill back to the skills root.
   * @param name - skill name (directory name in archive).
   */
  restoreSkill(name: string): void {
    const src = join(this.skillsRoot, '.system', 'archive', name)
    if (!existsSync(src)) throw new Error(`archived skill not found: ${name}`)
    const dest = join(this.skillsRoot, name)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(src, dest)
  }

  /**
   * List archived skill names.
   * @returns array of skill names currently in the archive.
   */
  listArchived(): string[] {
    const archiveDir = join(this.skillsRoot, '.system', 'archive')
    if (!existsSync(archiveDir)) return []
    return readdirSync(archiveDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  }

  // ── Snapshots ────────────────────────────────────────────────────

  /**
   * Create a snapshot of the current skills directory.
   * @param description - optional label for the snapshot.
   * @returns the snapshot ID.
   */
  createSnapshot(description?: string): string {
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`
    const dest = join(this.snapshotDir, id)
    mkdirSync(dest, { recursive: true })

    let skillCount = 0
    if (existsSync(this.skillsRoot)) {
      for (const entry of readdirSync(this.skillsRoot)) {
        if (entry === '.system') continue
        const src = join(this.skillsRoot, entry)
        try {
          if (statSync(src).isDirectory()) {
            cpSync(src, join(dest, entry), { recursive: true })
            skillCount++
          }
        } catch {
          // Skip non-directory entries.
        }
      }
    }

    const meta: SnapshotInfo = { id, createdAt: new Date().toISOString(), skillCount }
    if (description !== undefined) meta.description = description
    writeFileSync(join(this.snapshotDir, `${id}.json`), JSON.stringify(meta, null, 2) + '\n', 'utf8')
    this.lastSnapshotId = id
    return id
  }

  /**
   * List all available snapshots, most recent first.
   * @returns array of snapshot metadata.
   */
  listSnapshots(): SnapshotInfo[] {
    if (!existsSync(this.snapshotDir)) return []
    const results: SnapshotInfo[] = []
    for (const entry of readdirSync(this.snapshotDir)) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = readFileSync(join(this.snapshotDir, entry), 'utf8')
        results.push(JSON.parse(raw) as SnapshotInfo)
      } catch {
        // Skip malformed entries.
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Rollback the skills directory to a previous snapshot.
   * @param id - the snapshot ID to restore.
   */
  rollback(id: string): void {
    const src = join(this.snapshotDir, id)
    if (!existsSync(src)) throw new Error(`snapshot not found: ${id}`)
    if (existsSync(this.skillsRoot)) {
      for (const entry of readdirSync(this.skillsRoot)) {
        if (entry === '.system') continue
        const p = join(this.skillsRoot, entry)
        if (statSync(p).isDirectory()) rmSync(p, { recursive: true, force: true })
      }
    }
    for (const entry of readdirSync(src)) {
      if (entry === '.system') continue
      cpSync(join(src, entry), join(this.skillsRoot, entry), { recursive: true })
    }
  }

  /**
   * Prune snapshots older than the given number of days.
   * @param days - retain snapshots from this many days ago onward.
   * @returns number of snapshots removed.
   */
  pruneSnapshots(days: number): number {
    const cutoff = Date.now() - days * 86_400_000
    let removed = 0
    for (const snap of this.listSnapshots()) {
      if (new Date(snap.createdAt).getTime() < cutoff) {
        rmSync(join(this.snapshotDir, snap.id), { recursive: true, force: true })
        rmSync(join(this.snapshotDir, `${snap.id}.json`), { force: true })
        removed++
      }
    }
    return removed
  }

  // ── Status ───────────────────────────────────────────────────────

  /**
   * Get the current curator status for display.
   * @returns a human-readable status object.
   */
  status(): { lastRunAt: string | undefined; paused: boolean; snapshotCount: number; archivedCount: number } {
    return {
      lastRunAt: this.state.last_run_at,
      paused: this.state.paused,
      snapshotCount: this.listSnapshots().length,
      archivedCount: this.listArchived().length,
    }
  }

  // ── Accessors ────────────────────────────────────────────────────

  /** The resolved state file path. */
  get stateFilePath(): string {
    return this.statePath
  }

  /** The resolved snapshot directory. */
  get snapshotsDir(): string {
    return this.snapshotDir
  }

  /** The resolved skills root. */
  get root(): string {
    return this.skillsRoot
  }

  /** The configured thresholds. */
  get config(): { staleAfterDays: number; archiveAfterDays: number; intervalDays: number; minIdleMinutes: number } {
    return { ...this.thresholds }
  }
}

export default CuratorCoreService
