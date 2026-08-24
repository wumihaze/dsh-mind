# dsh-mind

> Give your DSH agent a brain — persistent memory + self-curating skills.

A DSH bundle that adds **cross-session memory** and **skill lifecycle management** to any DSH agent profile. All data stays local. No external services required.

**[中文文档](./README.zh.md)**

## Features

| Capability | Description |
|---|---|
| **Memory** | Agent records and recalls experiences across sessions (file-based, pure local) |
| **Skill Usage Tracking** | Tracks which skills are used, when, and how often |
| **Skill Governance** | Auto-archives stale skills (30d → stale, 90d → archived), with snapshots & rollback |
| **CLI** | `dsh-mind status / run / archive / restore / memory / install-preset ...` |
| **Web GUI** | Memory panel, skill dashboard, curator console (DSH Web plugin) |
| **Presets** | One-command agent preset installation (full or lightweight) |

## Quick Start

```bash
dsh plugin --profile <your-profile> add @wumihaze/dsh-mind
```

装完即生效，三个能力立即可用：

1. **跨会话记忆** — `dsh-mind memory add "内容"` / `dsh-mind memory search "关键词"`
2. **技能治理** — `dsh-mind status` / `dsh-mind archive <name>` / `dsh-mind restore <name>`
3. **Web GUI** — DSH Web 中打开 Mind 面板（记忆管理、技能仪表盘、治理控制台）

## Installation

```bash
# From npm (after publishing)
dsh plugin --profile <your-profile> add @wumihaze/dsh-mind

# From local checkout
dsh plugin --profile <your-profile> add ./dsh-mind
```

### Enabling Agent Capabilities (Preset)

After bundle install, host-plane services (skill-usage, curator) are active automatically.
To give the **agent** memory reminders and skill management tools, install a preset:

```bash
# Full mode: memory + skill management tools
dsh-mind install-preset mind-active

# Lightweight: memory only (no skill management tools)
dsh-mind install-preset mind-light

# Remove preset
dsh-mind uninstall-preset mind-active
```

> **How it works**: The bundle's `cordis.patch.yml` registers host-plane services (skill-usage,
> curator-core). Preset `agent.cordis.yml` registers agent-plane plugins (memory-nudge,
> memory-guidance, skill-manage tool). Together they form the complete capability.

## CLI Reference

```bash
# Curator management
dsh-mind status              # View governance status and skill summary
dsh-mind run                 # Execute one curation cycle (heuristic)
dsh-mind pause               # Pause auto-curation
dsh-mind resume              # Resume auto-curation
dsh-mind archive <name>      # Archive a skill
dsh-mind restore <name>      # Restore an archived skill
dsh-mind list                # List all skills
dsh-mind snapshots           # View snapshot list
dsh-mind rollback <id>       # Rollback to a specific snapshot
dsh-mind prune --days 30     # Prune snapshots older than N days

# Memory management
dsh-mind memory add <text>        # Add a memory entry
dsh-mind memory search <keyword>  # Search memories
dsh-mind memory list              # List all memories

# Preset management
dsh-mind install-preset [name]    # Install preset (without name: list available)
dsh-mind uninstall-preset <name>  # Remove preset
```

Exit codes: `0` = success, `1` = failure, `2` = argument error

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  dsh-mind (bundle)                                       │
│                                                         │
│  Host-plane (cordis.patch.yml auto-registers)           │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │  skill-usage   │  │  curator-core  │  ← services     │
│  │  (tracking)    │  │  (governance)  │                 │
│  └────────────────┘  └────────────────┘                 │
│                                                         │
│  Agent-plane (preset registers)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────┐  │
│  │ memory-nudge   │  │memory-guidance │  │ skill-    │  │
│  │ (prompt)       │  │(prompt)        │  │ manage    │  │
│  └────────────────┘  └────────────────┘  │ (tool)    │  │
│                                         └───────────┘  │
│                                                         │
│  CLI (standalone bin, zero external deps)               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ dsh-mind status / run / archive / memory / preset   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  Web GUI (DSH Web plugin)                                │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Memory panel │ Skill dashboard │ Curator console    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  Data storage (~/.dsh/)                                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ memory/MEMORY.md  skills/  curator/  skill-usage/   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Configuration Reference

| Parameter | Default | Description |
|---|---|---|
| `staleAfterDays` | 30 | Mark skill as stale after N days unused |
| `archiveAfterDays` | 90 | Auto-archive skill after N days unused |
| `intervalDays` | 7 | Curation check interval (days) |
| `minIdleMinutes` | 120 | Trigger curation after N minutes idle |
| `intervalTurns` (nudge) | 8 | Remind memory review every N conversation turns |

**Where to configure**: Edit the `config` block in your profile's `cordis.patch.yml`
(for `curator-core`) or the preset's `agent.cordis.yml` (for `memory-nudge`).

## Data Locations

All data lives under `~/.dsh/`:

```
~/.dsh/
├── memory/MEMORY.md          # Memory entries (bullet list, 2200 char budget)
├── skills/                   # Active skills
│   └── <name>/SKILL.md
├── skills/_archived/         # Archived skills
├── skills/.system/curator/state.json      # Governance state
├── skills/.system/curator/snapshots/      # Governance snapshots
└── skills/.system/curator/usage.json      # Skill usage records
```

Uninstalling the bundle does **not** delete data.

## Requirements

- DSH ≥ 0.1.1-rc
- Node.js ≥ 20

## FAQ

**Where is my data stored?**
All data is local under `~/.dsh/`. No cloud, no external service. Memory is a plain Markdown file you can read and edit directly.

**Can I uninstall without losing data?**
Yes. `dsh plugin remove dsh-mind` removes the bundle but all data files remain in `~/.dsh/`. Reinstall to pick up where you left off.

**What's the difference from Letta (MemGPT)?**
Letta is a full agent framework with server-side memory. dsh-mind is a lightweight DSH bundle: no server, no database, file-based storage, and it integrates into your existing DSH agent rather than replacing it. Think of it as "memory as a file" vs "memory as a service".

**Will the agent remember everything?**
The memory file has a 2200-character budget. The agent is nudged to review and consolidate memories, so it learns to keep the most important facts. It's not infinite storage — it's designed for high-value, curated knowledge.

**What happens to archived skills?**
Archived skills move to `~/.dsh/skills/_archived/<name>/`. They're no longer loaded into the agent's skill list, but you can restore them anytime with `dsh-mind restore <name>`.

**Does it work on Windows?**
Yes. All paths use `path.join`, writes are atomic (rename), and CRLF is handled. Tested on Windows 11.

## License

[MIT](./LICENSE)
