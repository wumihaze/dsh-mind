/**
 * dsh-mind: a DSH bundle that adds persistent memory and self-curating skills.
 *
 * This is the bundle entry point — re-exports all sub-modules for
 * programmatic access. Plugin activation happens via `cordis.patch.yml`.
 *
 * The package main is also a valid (no-op) Cordis plugin so the bundle patch can
 * carry an entry whose name is the bare package name. `dsh-client-modules` keys
 * Web client-bundle registration on exactly such an entry: it resolves
 * `<entry-name>/package.json` and reads `dsh.client`, and the built client
 * bundle registers itself under that same bare package name — the two ids must
 * match. A subpath entry name (e.g. `@wumihaze/dsh-mind/skill-usage`) would
 * register the client under a mismatched id and the module loader rejects it.
 *
 * @module @wumihaze/dsh-mind
 */

/** Cordis plugin name for the package entry (the client-registration anchor). */
export const name = 'dsh-mind'

/**
 * No-op host plugin. The real services mount through the subpath rows in
 * `cordis.patch.yml`; this row exists solely so the Loader carries an entry
 * named exactly `@wumihaze/dsh-mind`, which is what registers the Web client.
 */
export const apply = (): void => {}

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
