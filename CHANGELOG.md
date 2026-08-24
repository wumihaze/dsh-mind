# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.36] - 2026-08-25

### Changed

- **Docs**: English README is now entirely English — replaced the leftover
  Chinese terms (便签 / 经验库 / 常驻 / 设置→心智 UI path) with their English
  equivalents, keeping only the 「中文文档」 link to the Chinese version.

## [0.1.35] - 2026-08-25

### Changed

- **Docs**: README (en/zh) now document semantic search — a dedicated "Semantic
  search (optional)" section (feature description, enable/disable via
  `.vector-config.json`, `memory reindex`), CLI `memory reindex`, the two hidden
  data files, the `search` config row, and the FAQ no-longer claims "no external
  service" (semantic search is the optional free-tier exception, off by default).

## [0.1.34] - 2026-08-25

### Added

- **Config-file credentials for semantic search**: write
  `~/.dsh/memory/.vector-config.json` (`embedApiKey` / `vectorApiKey` /
  `vectorUrl`) and semantic search works on every launch without managing
  `DSH_MIND_*` env vars. Precedence per field: plugin `search` config → config
  file → env vars. All three entry points (agent tool, Web route, CLI) read it.
  Verified: search works with the env vars unset.

## [0.1.33] - 2026-08-25

### Fixed

- **Semantic search upserts failed on a real Qdrant cluster**: point ids were
  sent as `memo:<hash>` / `topic:<name>:<hash>` strings, but Qdrant only accepts
  unsigned integers or UUIDs as point ids → `400 Format error in JSON body`.
  Logical ids now map to a deterministic UUID (`pointIdOf`), and the content hash
  + kind are carried in the point payload so search results still map back to
  local text. Verified live against a free Qdrant cluster (89 vectors indexed,
  keyword → semantic hits working).

## [0.1.32] - 2026-08-25

### Added

- **Semantic search for memory (便签语义检索, roadmap item)**: `memory search` is
  now augmented by embedding-based retrieval over sticky notes and topic files.
  Text is embedded via SiliconFlow (free tier, `BAAI/bge-m3`) and vectors live in
  a free Qdrant Cloud cluster — full-cloud, zero local infra. Keyword search stays
  primary; semantic adds matches and falls back silently when the cloud is
  unreachable, so offline/agent flows never break.
  - New subpath `@wumihaze/dsh-mind/search`: `embedTexts` (SiliconFlow client), a
    minimal Qdrant REST client (`ensureCollection` / `upsertPoints` /
    `searchPoints` / `deletePoints` / `deleteAllPoints` / `pointCount`), and the
    coordinator `syncIfStale` (content-fingerprint delta sync — works across every
    write path: agent tool / GUI / CLI / memory-auto — no per-writer hooks needed),
    plus `reindex`, `semanticSearch`, `resolveSearchConfig`, `hashOf`, `chunkText`,
    `loadDocs`.
  - **Privacy**: only vectors + a content-hash id leave the machine; note text is
    looked up back locally after a query.
  - **Free-tier safe**: the 1M-vector / 1-collection hard wall is preflighted via
    `pointCount` before writing; a stale local manifest is what drives delta sync.
  - `memory` tool search merges keyword + semantic hits (semantic-only entries
    flagged `semantic`, topic chunks get a `snippet`). **Off by default** — enable
    by setting `DSH_MIND_EMBED_KEY`, `DSH_MIND_VECTOR_URL`, `DSH_MIND_VECTOR_KEY`
    (auto-enables) or via a `search:` config block on the `tool-memory` row.
  - Web GUI: `GET /dsh-mind/memory/search?q=` returns semantic hits.
  - CLI: `dsh-mind memory search` augments with semantic; new `dsh-mind memory
    reindex` rebuilds the vector index.

## [0.1.31] - 2026-08-25

### Added

- **PROJECT.md**: comprehensive project document (overview, features, memory
  tiers, architecture, components, GUI routes, CLI, config, data, version
  history, dev flow, design tradeoffs, roadmap).

## [0.1.30] - 2026-08-25

### Changed

- **Docs**: READMEs describe pinned (常驻) sticky notes + prompt injection in the
  memory-tiers section.

## [0.1.29] - 2026-08-25

### Fixed

- **Pin toggle route**: `POST /dsh-mind/memory/<idx>/pin` had the path logic
  inverted (the `/pin` suffix returned 400). Now `/memory/<idx>/pin` toggles the
  pin correctly.

## [0.1.28] - 2026-08-25

### Added

- **Pinned (常驻) sticky notes + prompt injection** (`memory-inject`, host-plane,
  enabled by default): pin a sticky note in the panel (📌) and it is injected
  into the prompt every turn — key facts are always present without a tool call.
  Nothing pinned → nothing injected → zero overhead. Pins live in
  `~/.dsh/memory/pinned.json`; pinned state is also exposed by the `memory` tool
  (`list`/`search`) and pruned when an entry is edited/removed.
- Pin toggle route: `POST /dsh-mind/memory/<idx>/pin`.

## [0.1.27] - 2026-08-25

### Changed

- **Docs only**: READMEs now mention `memory-auto` (automatic fact extraction) in
  the features table and the enabled-by-default capability list.

## [0.1.26] - 2026-08-25

### Added

- **`memory-auto`**: automatic fact extraction. When a session goes idle after
  `intervalTurns` assistant steps, the model (the session's own route) pulls
  short bullets from the recent transcript and appends them to the sticky-note
  memory — no need for the agent to remember to call `memory add`. Output is
  filtered for secrets, deduplicated against existing entries, and skipped when
  it would exceed the budget. Host-plane, enabled by default
  (`intervalTurns: 10`, `debounceMs: 90s`), disable via `memory-auto` config.

## [0.1.25] - 2026-08-25

### Changed

- **Rename 全局记忆 → 便签** (sticky notes): "全局" read like AGENTS.md's global
  instructions, which misled users. The panel, tool descriptions, and READMEs now
  call the quick-memo layer 便签, and the README gained a "memory tiers" section
  (AGENTS.md = standing instructions / 便签 = agent memos / 经验库 = topic docs).

## [0.1.24] - 2026-08-25

### Changed

- **Docs only**: ship the corrected READMEs (four capabilities, host-plane
  architecture diagram, deduplicated sections) to the npm package page.

## [0.1.23] - 2026-08-25

### Fixed

- **Budget enforcement everywhere**: the 2200-char global-memory budget was only
  enforced by the agent `memory` tool — the Web GUI add and `dsh-mind memory add`
  could exceed it. All three entry points now reject over-budget adds.
- **Clear GUI errors**: the panel now surfaces the server's `{ error }` message
  instead of a bare `HTTP 400`.
- **README**: deduplicated the "enabled by default" section and added an
  upgrade-from-≤0.1.21 migration note (remove preset rows to avoid a doubled nudge).

## [0.1.22] - 2026-08-25

### Changed

- **Agent capabilities are now host-plane (enabled by default)**: the `memory`
  tool, `skill_manage`, `memory-nudge`, and `memory-guidance` moved from the
  mind-active/mind-light presets into `cordis.patch.yml`, so every agent gets
  them as soon as the bundle is installed — no preset install step. The presets
  are kept as empty shells for backward compatibility.

## [0.1.21] - 2026-08-25

### Changed

- **Panel title & description**: "持久记忆 / 长期记忆条目（2200 预算）" read as if
  the whole panel were one budgeted store. Now **记忆管理** with a description
  naming both layers: 全局记忆 (quick agent notes, 2200-char budget) + 经验库
  (detailed per-topic docs).

## [0.1.20] - 2026-08-25

### Changed

- **Rename the topic section to 经验库** (Experience library): the per-topic
  files are detailed experience docs, so the label no longer reads as "all
  memory". 全局记忆 (quick entries) and 经验库 (topic files) are now distinct.

## [0.1.19] - 2026-08-25

### Changed

- **Memory panel layout & naming**: the quick memory add form moved to the top
  (was at the bottom, easy to miss) and the two stores are now clearly labelled —
  **全局记忆** (global memory: agent-facing quick entries, `MEMORY.md`) and
  **主题记忆** (topic memory: per-topic files). Add button = 添加条目, New topic
  = 新建主题.

## [0.1.18] - 2026-08-25

### Fixed

- **Topic editor appeared to "do nothing"**: the markdown editor rendered below
  the (long) topic list, off-screen, so clicking Edit seemed unresponsive. It
  now renders at the top of the panel and scrolls into view. The "New topic"
  button was also enlarged (was a tiny `btnSmall`).

## [0.1.17] - 2026-08-25

### Added

- **Full topic editing in the Memory panel**: per-topic files are no longer
  read-only — each has Edit (markdown textarea) and Delete, plus a "New topic"
  form. Backed by new routes `GET/PUT/DELETE /dsh-mind/memory/topic/<name>` and
  `POST /dsh-mind/memory/topic`.

## [0.1.16] - 2026-08-25

### Added

- **Per-topic memory files now surfaced**: dsh-mind previously only read the
  bullet-style `MEMORY.md`, so the agent's real per-topic memory library
  (`~/.dsh/memory/comfyui.md`, `dsh.md`, `prefs.md`, …) was invisible. The Web
  panel now lists those topic files (read-only, with title + preview) and the
  `memory` tool's `list`/`search` also search them.

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
