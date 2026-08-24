/**
 * dsh-mind: a DSH bundle that adds persistent memory and self-curating skills.
 *
 * This is the bundle entry point — re-exports all sub-modules for
 * programmatic access. Plugin activation happens via `cordis.patch.yml`.
 *
 * The Web client bundle is registered through the `skill-usage` loader entry:
 * `dsh-client-modules` keys client registration on an entry name, resolves
 * `<entry>/package.json` (see the `./skill-usage/package.json` export) and reads
 * `dsh.client`. That is why this package exposes the subpath's package.json
 * rather than mounting the bare package name as a plugin.
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
