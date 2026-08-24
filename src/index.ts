/**
 * dsh-mind: a DSH bundle that adds persistent memory and self-curating skills.
 *
 * This is the bundle entry point — re-exports all sub-modules for
 * programmatic access. Plugin activation happens via `cordis.patch.yml`.
 *
 * @module @wumihaze/dsh-mind
 */

export { SkillUsageService } from './skill-usage/index.ts'
export type { SkillProvenance, SkillUsageIndex, SkillUsageRecord } from './skill-usage/types.ts'
export { CuratorCoreService } from './curator/index.ts'
export type {
  Config as CuratorConfig,
  CurationPlan,
  CurationResult,
  CuratorState,
  SnapshotInfo,
  SkillState,
  TriggerDecision,
} from './curator/types.ts'
