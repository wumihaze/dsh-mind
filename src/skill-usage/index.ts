/**
 * Skill usage telemetry service.
 *
 * Tracks per-skill view, use, and patch counts, provenance, and pin
 * status. Persists to a JSON index under the skill root's `.system`
 * directory so it is invisible to the skill registry's discovery.
 *
 * @module @wumihaze/dsh-mind/skill-usage
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { SkillProvenance, SkillUsageIndex, SkillUsageRecord } from './types.ts'

export type { SkillProvenance, SkillUsageIndex, SkillUsageRecord } from './types.ts'

/** Config for {@link SkillUsageService}. */
export interface Config {
  /** Override the default index file path. */
  indexPath?: string
}

/**
 * Host-plane telemetry service for skill usage.
 *
 * Exposes `ctx.skillUsage` with methods to record views, uses, and
 * patches; query records; manage pins; and set provenance.
 *
 * The in-memory state is the source of truth after `load()`; call
 * `save()` to persist. The service flushes pending writes on dispose.
 */
export class SkillUsageService extends Service {
  private records: Map<string, SkillUsageRecord> = new Map()
  private dirty = false
  private loaded = false
  private readonly indexPath: string

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'skillUsage')
    this.indexPath = config.indexPath ?? dshHomePath('skills', '.system', 'curator', 'usage.json')
    ctx.effect(() => () => {
      if (this.dirty) {
        this.flushSync()
        this.dirty = false
      }
    })
  }

  /**
   * Load the usage index from disk into memory.
   *
   * Safe to call multiple times: subsequent calls are no-ops when
   * already loaded. Creates the record if the file does not exist.
   */
  load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = readFileSync(this.indexPath, 'utf8')
      const parsed = JSON.parse(raw) as SkillUsageIndex
      if (parsed.version !== 1) throw new Error(`unsupported usage index version: ${parsed.version}`)
      for (const [name, record] of Object.entries(parsed.skills)) {
        this.records.set(name, record)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  /**
   * Persist the in-memory state to disk.
   *
   * Writes atomically: content is written to a sibling temp file and
   * renamed over the target.
   */
  save(): void {
    this.flushSync()
    this.dirty = false
  }

  private flushSync(): void {
    const index: SkillUsageIndex = {
      version: 1,
      skills: Object.fromEntries(this.records),
    }
    const dir = dirname(this.indexPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${this.indexPath}.tmp`
    writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf8')
    renameSync(tmp, this.indexPath)
  }

  /**
   * Record that a skill was loaded into a model context.
   * @param name - skill name (kebab-case).
   */
  recordView(name: string): void {
    const record = this.ensure(name)
    record.views++
    record.last_used_at = new Date().toISOString()
    this.dirty = true
  }

  /**
   * Record that a skill was acted upon via `skill_manage`.
   * @param name - skill name (kebab-case).
   */
  recordUse(name: string): void {
    const record = this.ensure(name)
    record.uses++
    record.last_used_at = new Date().toISOString()
    this.dirty = true
  }

  /**
   * Record a patch operation on a skill.
   * @param name - skill name (kebab-case).
   */
  recordPatch(name: string): void {
    const record = this.ensure(name)
    record.patches++
    record.last_patched_at = new Date().toISOString()
    this.dirty = true
  }

  /**
   * Get the usage record for a skill.
   * @param name - skill name.
   * @returns the record, or `undefined` if the skill has no telemetry yet.
   */
  get(name: string): SkillUsageRecord | undefined {
    return this.records.get(name)
  }

  /**
   * List all usage records, ordered by most recently used first.
   * @returns an array of records sorted by `last_used_at` descending.
   */
  list(): SkillUsageRecord[] {
    return [...this.records.values()].sort((a, b) => {
      const ta = a.last_used_at ?? ''
      const tb = b.last_used_at ?? ''
      return tb.localeCompare(ta)
    })
  }

  /**
   * Check whether a skill is pinned.
   * @param name - skill name.
   * @returns `true` if the skill is pinned.
   */
  isPinned(name: string): boolean {
    return this.records.get(name)?.pinned === true
  }

  /**
   * Pin a skill (deletion-protected).
   * @param name - skill name.
   * @param reason - optional human-readable pin reason.
   */
  pin(name: string, reason?: string): void {
    const record = this.ensure(name)
    record.pinned = true
    if (reason !== undefined) record.pin_reason = reason
    this.dirty = true
  }

  /**
   * Unpin a skill.
   * @param name - skill name.
   */
  unpin(name: string): void {
    const record = this.records.get(name)
    if (record) {
      record.pinned = false
      delete record.pin_reason
      this.dirty = true
    }
  }

  /**
   * Set the provenance of a skill.
   * @param name - skill name.
   * @param provenance - how the skill entered the skill set.
   */
  setProvenance(name: string, provenance: SkillProvenance): void {
    const record = this.ensure(name)
    record.provenance = provenance
    this.dirty = true
  }

  /**
   * Ensure a record exists for the given skill, creating one if absent.
   * @param name - skill name.
   * @returns the existing or newly created record.
   */
  ensure(name: string): SkillUsageRecord {
    let record = this.records.get(name)
    if (record === undefined) {
      record = { name, views: 0, uses: 0, patches: 0, created_at: new Date().toISOString() }
      this.records.set(name, record)
      this.dirty = true
    }
    return record
  }

  /** Whether the in-memory state has unsaved changes. */
  get isDirty(): boolean {
    return this.dirty
  }

  /** Whether the index has been loaded from disk. */
  get isLoaded(): boolean {
    return this.loaded
  }

  /** The resolved index file path. */
  get path(): string {
    return this.indexPath
  }
}

export default SkillUsageService
