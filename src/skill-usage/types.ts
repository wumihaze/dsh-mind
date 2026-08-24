/**
 * Skill usage telemetry types.
 *
 * @module @wumihaze/dsh-mind/skill-usage
 */

/** How a skill entered the user's skill set. */
export type SkillProvenance = 'agent-created' | 'user' | 'hub'

/** Telemetry record for one skill. */
export interface SkillUsageRecord {
  /** Skill name (kebab-case). */
  name: string
  /** Number of times the skill was loaded into a model context. */
  views: number
  /** Number of times the skill was acted upon via `skill_manage`. */
  uses: number
  /** Number of patch operations applied to the skill. */
  patches: number
  /** ISO timestamp of the most recent view or use. */
  last_used_at?: string
  /** ISO timestamp of the most recent patch. */
  last_patched_at?: string
  /** ISO timestamp when this record was first created. */
  created_at: string
  /** How the skill entered the skill set. */
  provenance?: SkillProvenance
  /** Whether the skill is pinned (deletion-protected). */
  pinned?: boolean
  /** Human-readable reason for pinning. */
  pin_reason?: string
}

/** On-disk format of the usage index. */
export interface SkillUsageIndex {
  /** Monotonic format version; backends reject unknown major versions. */
  version: 1
  /** Per-skill telemetry records, keyed by skill name. */
  skills: Record<string, SkillUsageRecord>
}
