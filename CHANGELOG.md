# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
