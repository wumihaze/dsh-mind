# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.15] - 2026-08-25

### Added

- **Memory panel auto-refresh**: the panel now polls every 5s so entries written
  by the agent's `memory` tool (or the CLI) appear without a manual reload.

## [0.1.14] - 2026-08-25

### Added

- **Memory panel edit**: the Web GUI Memory panel now supports editing an entry
  in place (previously only add/remove). Added `PATCH /dsh-mind/memory/:idx`
  (replace) plus an edit/save/cancel control in `MemoryPanel`. GUI writes now
  keep the `# Memory` header, matching the agent `memory` tool.

## [0.1.13] - 2026-08-25

### Added

- **`memory` tool** (agent-plane, `@wumihaze/dsh-mind/tool/memory`): the agent can
  now `list` / `search` / `add` / `replace` / `remove` entries in
  `~/.dsh/memory/MEMORY.md` — the same store the Web GUI panel and the CLI use.
  Previously the memory file was only reachable by GUI/CLI; the nudge reminded
  the agent to update memory it could not access. The tool is added to the
  `mind-active`, `mind-light`, and (user) `cordis-tuned` presets.
- `memory-nudge` now resets its signal on `memory` writes (add/replace/remove)
  as well as `skill_manage` writes (create/patch), and the guidance text teaches
  the `memory` tool.

## [0.1.12] - 2026-08-25

### Fixed

- **DELETE /memory and snapshots rollback never matched (405/404)**: the prefix
  routes were registered with a trailing slash (`/dsh-mind/memory/`), but the
  webserver matches prefixes with `pathname.startsWith(\`${prefix}/\`)`, so a
  trailing slash doubled to `//` and matched nothing. Removed the trailing slash
  from the memory DELETE and snapshots prefix routes.

## [0.1.11] - 2026-08-25

### Fixed

- **Skills / Curator / Snapshots tabs returned HTTP 404**: the memory GET and POST
  handlers both registered `kind: 'exact', path: '/dsh-mind/memory'`. The
  webserver rejects duplicate (kind, path) registrations, so the second
  `/dsh-mind/memory` threw and `mountMindRoutes` aborted before registering
  skills/curator/snapshots. Merged GET+POST into one exact route dispatched on
  method.

## [0.1.10] - 2026-08-25

### Fixed

- **Web panel stayed in English / showed raw keys instead of following the app
  language**: the settings-section registration did not bind the locale
  translator or hand it to the component. `label` was a static `'Mind'` string,
  `locale` was an inline dict, and — critically — there was no
  `inject: () => ({ t })`, so the panel's `t` prop fell back to identity and
  rendered keys instead of translations. The panel now binds `ctx.locale.bind(NS)`,
  uses a dynamic `label: () => t('section.nav')`, passes `locale: NS`, and
  injects `t` into `MindSection` — the same shape the `dshmarket` client uses —
  so zh/en follow the app.

## [0.1.9] - 2026-08-25

### Fixed

- **Web panel slot rejected after 0.1.8**: once the client factory returned
  `module.exports`, the panel's `apply` ran and hit
  `slot "dsh-mind" is not declared`. The `slots.register` call used
  `name: "dsh-mind"` (its own id) as the slot name; `name` must be the parent
  slot the entry registers into — `settings.section` — matching the `dshmarket`
  client shape (`name: "settings.section", id: "market"`). Fixed the slot name.

## [0.1.8] - 2026-08-25

### Fixed

- **Web panel never actually loaded in the browser** — the true root cause of the
  recurring `failed to apply loader entry <id> (@wumihaze/dsh-mind): invalid
  plugin ... received undefined` (the client `__ModuleLoader__` boot rejects the
  bundle). The `build:done` hook that wraps the client bundle in
  `window.__ModuleLoader__.load({ factory })` never added `return
  module.exports`, so the factory returned `undefined` and the client module
  loader could not read `apply`. Added the missing return. The host-side
  manifest/registration was always fine; the failure was purely browser-side.

## [0.1.7] - 2026-08-25

### Fixed

- **Revert 0.1.6's client-registration change**: registering the Web client via
  the `skill-usage` subpath entry made the manifest id `@wumihaze/dsh-mind/skill-usage`,
  but the built client bundle registers itself as `@wumihaze/dsh-mind` — the
  module loader rejected the bundle (`loaded without registering ... via
  __ModuleLoader__.load`). The bare package-name anchor entry is restored so the
  two ids match exactly. The 0.1.4/0.1.5 "invalid plugin ... received undefined"
  failures only occurred while pnpm replaced package files under a running app
  (an HMR import race), not in steady state; upgrade with the app stopped.

## [0.1.6] - 2026-08-25

### Fixed

- **`@wumihaze/dsh-mind` bare-name loader entry intermittently failed to apply**
  (`invalid plugin ... received undefined`) during plugin upgrades: the anchor
  row mounted the package main as a no-op plugin, and re-importing it while pnpm
  replaced the package files could resolve to `undefined`. Dropped the bare-name
  row entirely. Client registration now rides the already-mounted `skill-usage`
  loader entry: `dsh-client-modules` resolves `<entry>/package.json`, so the
  package now exports `./skill-usage/package.json` → `./package.json`. No new
  import surface, so the failure mode is gone. The package main reverts to pure
  re-exports.

## [0.1.5] - 2026-08-25

### Fixed

- **`memory-nudge` never reset and would nag forever**: it watched a `memory`
  tool (add/replace/remove) that this bundle does not ship, so its "memory
  write" signal never cleared and the review reminder fired every
  `intervalTurns` steps indefinitely. It now watches `skill_manage`
  create/patch — the skill library is this bundle's persistent memory — so a
  real write clears the signal. Nudge text updated to point at `skill_manage`.
- **`memory-guidance` crashed with no config**: `apply(ctx, config)` read
  `config.enabled` but had no runtime Config schema and no default, so mounting
  the row without a `config:` block threw `Cannot read properties of undefined
  (reading 'enabled')`. Defaulted `config = {}`.

## [0.1.4] - 2026-08-25

### Fixed

- **Web GUI panel never loaded**: `dsh-client-modules` registers a plugin's
  client bundle by keying on a Loader entry whose name is the **bare package
  name** (it resolves `<entry>/package.json` and reads `dsh.client`). The bundle
  patch only mounted subpath rows (`@wumihaze/dsh-mind/skill-usage` etc.), so
  `@wumihaze/dsh-mind` was never a Loader entry and the client was never in the
  `__DSH_BOOT__` manifest (dshmarket works because its patch mounts the bare
  `dshmarket`). Added a `@wumihaze/dsh-mind` anchor row and made the package
  main a valid no-op plugin, so the Web panel registers and loads.

### Changed

- Version bumped to 0.1.4.

## [0.1.3] - 2026-08-25

### Fixed

- **Module duplication breaking agent presets**: `@deepseek-ai/*` harness packages were declared as
  `dependencies`, so `dsh plugin add` installed real copies into the profile's `node_modules`. Two
  instances of `@deepseek-ai/dsh-scope` meant two different `Symbol("dsh.scope")` keys, so a preset's
  `persona` row could no longer shadow the deployment persona and every session failed to mount with
  `prompt section "deployment:persona" is already registered`. All `@deepseek-ai/*` packages moved to
  `peerDependencies` (consumed from the DSH runtime; with `autoInstallPeers: false` they are no longer
  copied into the profile), matching the `dshmarket` pattern. Kept only third-party utilities
  (`clsx`, `yaml`) as dependencies.
- **Broken web client inject**: `dsh.client.inject` referenced `@deepseek-ai/dsh-client-ui-primitives`,
  a package the DSH runtime does not provide (it is a dev-time package only), so the Web GUI module
  injection would fail to load dsh-mind's panel. Replaced with `@deepseek-ai/dsh-client-ui-theme`
  (matches the runtime-inject pattern used by `dshmarket` and provides the `theme` service the client
  declares).
- Dev `prepublishOnly` switched to `npm run build` (portable without pnpm).

### Changed

- Version bumped to 0.1.3.

## [0.1.0] - 2026-08-01

### Added

- **Memory layer**: Cross-session memory for DSH agents (file-based, 2200 char budget)
  - `memory-nudge` plugin: reminds agent to review memories every N turns
  - `memory-guidance` plugin: teaches agent how to use the memory tool
  - CLI: `dsh-mind memory add / search / list`
- **Skill usage tracking** (`SkillUsageService`):
  - Record skill view/use/patch events
  - Pin/unpin skills
  - Provenance tracking
  - Sorted usage history
- **Skill governance** (`CuratorCoreService`):
  - State machine: active → stale (30d) → archived (90d)
  - Snapshot creation and listing
  - Rollback to any snapshot (restores skill directory contents)
  - Snapshot pruning by age
  - Auto-trigger: idle-time + interval based
  - CLI: `dsh-mind status / run / pause / resume / archive / restore / list / snapshots / rollback / prune`
- **Agent preset system**:
  - `mind-active`: full mode (memory + skill management tools)
  - `mind-light`: lightweight (memory only)
  - CLI: `dsh-mind install-preset / uninstall-preset`
- **Web GUI** (DSH Web plugin):
  - Memory panel: list, add, delete, budget visualization
  - Skill dashboard: usage frequency table, provenance tags
  - Curator console: status, pause/resume, manual trigger, threshold display
  - Snapshot management: list, rollback, prune
  - Settings panel
  - i18n: English + Chinese
  - Dark/light theme (DSH semantic tokens)
  - Responsive: 480px breakpoint
- **HTTP REST routes** for Web GUI (`dsh-mind-web` plugin)
- **CLI** (`dsh-mind` bin): standalone, zero external dependencies
- **Testing**: 31 integration tests (all passing)
  - Service lifecycle (create, provide, dispose)
  - Full E2E flow: memory CRUD → curation → archive → restore → rollback
  - Data persistence (restart simulation)
  - Edge cases: empty files, no skills, concurrent writes
  - Performance: 1000-entry search < 1ms
- **Build system**: TypeScript + tsdown (rolldown), CSS Modules, dual output (host ESM + client CJS bundle)
- **Package**: `@wumihaze/dsh-mind` npm bundle with `dsh.bundle.patch` + `dsh.client` manifests

### Technical Details

- Host-plane services: `skill-usage`, `curator-core` (registered via `cordis.patch.yml`)
- Agent-plane plugins: `memory-nudge`, `memory-guidance`, `skill-manage` tool (via presets)
- Client: React 18 + CSS Modules, bundled as DSH Web third-party plugin
- Data: `~/.dsh/memory/MEMORY.md`, `~/.dsh/skills/`, `~/.dsh/skills/.system/curator/`
- Requirements: DSH ≥ 0.1.1-rc, Node.js ≥ 20
