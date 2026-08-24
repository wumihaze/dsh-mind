/**
 * Skill curator core types.
 *
 * @module @wumihaze/dsh-mind/curator
 */

/** Lifecycle state of a skill under curation. */
export type SkillState = 'active' | 'stale' | 'archived'

/** Configuration for {@link CuratorCoreService}. */
export interface Config {
  /** Days before a skill is classified as stale. Default 30. */
  staleAfterDays?: number
  /** Days before a skill is classified as archived. Default 90. */
  archiveAfterDays?: number
  /** Minimum days between automatic curation runs. Default 7. */
  intervalDays?: number
  /** Minimum idle minutes before an automatic run is permitted. Default 120. */
  minIdleMinutes?: number
  /** Override the curator state file path. */
  statePath?: string
  /** Override the snapshot directory. */
  snapshotDir?: string
  /** Override the skill root directory. */
  skillsRoot?: string
}

/** Persisted curator state. */
export interface CuratorState {
  /** Monotonic format version. */
  version: 1
  /** ISO timestamp of the last completed curation run. */
  last_run_at?: string
  /** Whether automatic curation is paused. */
  paused: boolean
  /** Timestamp of the last user activity (used for idle detection). */
  last_activity_at?: string
}

/** A decision about whether curation should run. */
export interface TriggerDecision {
  /** Whether the trigger conditions are met. */
  shouldRun: boolean
  /** Human-readable explanation. */
  reason: string
}

/** A plan for one curation run. */
export interface CurationPlan {
  /** Skills that would transition to stale. */
  toStale: Array<{ name: string; lastUsedAt: string | undefined }>
  /** Skills that would transition to archived. */
  toArchive: Array<{ name: string; lastUsedAt: string | undefined }>
  /** Skills skipped because they are pinned. */
  pinned: string[]
  /** Skills with no usage record (untouched). */
  noRecord: string[]
}

/** The result of a curation run. */
export interface CurationResult {
  /** Whether this was a dry run. */
  dryRun: boolean
  /** ISO timestamp when the run completed. */
  completedAt: string
  /** Skills that were marked stale. */
  stale: string[]
  /** Skills that were archived. */
  archived: string[]
  /** The snapshot ID created before the run (if any). */
  snapshotId?: string
  /** Human-readable report. */
  report: string
}

/** Metadata for a curation snapshot. */
export interface SnapshotInfo {
  /** Unique snapshot identifier. */
  id: string
  /** ISO timestamp of creation. */
  createdAt: string
  /** Number of skill directories in the snapshot. */
  skillCount: number
  /** Human-readable description. */
  description?: string
}
