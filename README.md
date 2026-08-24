# dsh-mind

> Give your DSH agent a brain — persistent memory, an experience library, and self-curating skills.

A DSH bundle that adds **cross-session memory** and **skill lifecycle management** to any DSH agent profile. All data stays local. No external services required.

**[中文文档](./README.zh.md)**

## Features

| Capability | Description |
|---|---|
| **Global memory** | The agent records and recalls short facts across sessions (file-based, 2200-char budget) via its own `memory` tool |
| **Experience library** | Your per-topic Markdown files (`comfyui.md`, `dsh.md`, …) are surfaced in the GUI and searchable by the agent |
| **Skill usage tracking** | Tracks which skills are used, when, and how often |
| **Skill governance** | Auto-archives stale skills (30d → stale, 90d → archived), with snapshots & rollback |
| **CLI** | `dsh-mind status / run / archive / restore / memory / install-preset ...` |
| **Web GUI** | Full memory manager, skill dashboard, curator console (DSH Web plugin, zh/en) |
| **Presets** | One-command agent preset installation (full or lightweight) |

## Screenshots

| Memory manager | Skills dashboard |
|---|---|
| ![memory](./docs/screenshots/memory-panel.png) | ![skills](./docs/screenshots/skills-panel.png) |
| **Curator console** | **Snapshots** |
| ![curator](./docs/screenshots/curator-panel.png) | ![snapshots](./docs/screenshots/snapshots-panel.png) |

## Quick Start

```bash
dsh plugin --profile web add @wumihaze/dsh-mind
```

Installed and ready to use. Three capabilities available immediately:

**1. Memory** — your agent remembers across sessions

```bash
dsh-mind memory add "User prefers concise replies"
dsh-mind memory search "prefers"
dsh-mind memory list
```

In a session, the agent can also read/write memory itself with the `memory` tool
(`memory list`, `memory search <query>`, `memory add <text>`, `memory replace`, `memory remove`).

**2. Experience library** — your existing per-topic memory files are read automatically

dsh-mind reads every Markdown file in `~/.dsh/memory/` (e.g. `comfyui.md`, `dsh.md`, `prefs.md`)
and lists them in the GUI. The agent's `memory search` searches their contents too —
the same library your `memory-query` skill greps.

**3. Skill governance** — manage your skills (directories under `~/.dsh/skills/`)

```bash
dsh-mind list                    # list all skills
dsh-mind archive code-review     # archive a skill (agent stops loading it)
dsh-mind restore code-review     # restore an archived skill
dsh-mind status                  # view governance status
```

**4. Web GUI** — open **设置 → 心智** in DSH Web. The panel has two clear layers:

- **全局记忆** (global memory) — add/edit/delete short agent-facing notes.
- **经验库** (experience library) — view/edit/delete/new your per-topic files.

## Installation

```bash
# From npm
dsh plugin --profile web add @wumihaze/dsh-mind

# From local checkout
dsh plugin --profile web add ./dsh-mind
```

> **Upgrading**: stop DSH Web **before** running `dsh plugin add` again, then start it —
> pnpm replaces package files while the app runs, which can race the in-app module
> reload. Stop → install/upgrade → start.

### Enabling Agent Capabilities (Preset)

After bundle install, host-plane services (skill-usage, curator) are active automatically.
To give the **agent** memory reminders, the `memory`/`skill_manage` tools and the
memory-review nudge, install a preset:

```bash
# Full mode: memory + skill management tools
dsh-mind install-preset mind-active

# Lightweight: memory + memory tool (no skill management)
dsh-mind install-preset mind-light

# Remove preset
dsh-mind uninstall-preset mind-active
```

> **How it works**: The bundle's `cordis.patch.yml` registers host-plane services
> (skill-usage, curator-core) and the Web client. A preset's `agent.cordis.yml`
> registers agent-plane rows (`memory-nudge`, `memory-guidance`, `tool-memory`,
> `tool-skill-manage`). Together they form the complete capability.
>
> To add dsh-mind to your **default** preset instead of switching presets, copy
> those four agent-plane rows into your preset (e.g. `~/.dsh/.agent-presets/cordis-tuned/agent.cordis.yml`).

## Agent tools

With a preset installed, the agent gets two tools:

| Tool | Actions | Backing store |
|---|---|---|
| `memory` | `list` / `search` / `add` / `replace` / `remove` | `~/.dsh/memory/MEMORY.md` (全局记忆) + searches `~/.dsh/memory/*.md` (经验库) |
| `skill_manage` | `create` / `patch` / `delete` | `~/.dsh/skills/` |

`memory-nudge` reminds the agent to review its memory after a noteworthy event
until it next writes memory (or a skill) — the signal clears on a real write.

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
dsh-mind memory add <text>        # Add a global memory entry
dsh-mind memory search <keyword>  # Search memories
dsh-mind memory list              # List all memories

# Preset management
dsh-mind install-preset [name]    # Install preset (without name: list available)
dsh-mind uninstall-preset <name>  # Remove preset
```

Exit codes: `0` = success, `1` = failure, `2` = argument error

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  dsh-mind (bundle)                                             │
│                                                               │
│  Host-plane (cordis.patch.yml auto-registers)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐        │
│  │ skill-usage  │  │ curator-core │  │ dsh-mind-web  │        │
│  │ (tracking)   │  │ (governance) │  │ (GUI routes)  │        │
│  └──────────────┘  └──────────────┘  └───────────────┘        │
│                                                               │
│  Agent-plane (preset registers)                               │
│  ┌───────────┐  ┌───────────────┐  ┌───────────┐  ┌────────┐ │
│  │ memory-   │  │ memory-       │  │ memory    │  │ skill- │ │
│  │ nudge     │  │ guidance      │  │ tool      │  │ manage │ │
│  └───────────┘  └───────────────┘  └───────────┘  └────────┘ │
│                                                               │
│  CLI (standalone bin, zero external deps)                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ dsh-mind status / run / archive / memory / preset        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Data storage (~/.dsh/)                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ memory/ (全局记忆 MEMORY.md + 经验库 *.md)  skills/      │  │
│  │ curator/  skill-usage/                                  │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Configuration Reference

| Parameter | Default | Description |
|---|---|---|
| `staleAfterDays` | 30 | Mark skill as stale after N days unused |
| `archiveAfterDays` | 90 | Auto-archive skill after N days unused |
| `intervalDays` | 7 | Curation check interval (days) |
| `minIdleMinutes` | 120 | Trigger curation after N minutes idle |
| `intervalTurns` (nudge) | 8 | Remind memory review every N conversation turns |
| `budget` (memory tool) | 2200 | Global memory character budget |

**Where to configure**: Edit the `config` block in your profile's `cordis.patch.yml`
(for `curator-core`) or the preset's `agent.cordis.yml` (for `memory-nudge`,
`tool-memory`).

## Data Locations

All data lives under `~/.dsh/`:

```
~/.dsh/
├── memory/                    # Memory
│   ├── MEMORY.md              #   全局记忆 (quick bullet notes, 2200-char budget)
│   ├── comfyui.md             #   经验库 (per-topic detailed docs, yours already)
│   ├── dsh.md                 #   …
│   └── prefs.md               #   …
├── skills/                    # Active skills
│   └── <name>/SKILL.md
├── skills/_archived/          # Archived skills
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
All data is local under `~/.dsh/`. No cloud, no external service. Memory is plain Markdown you can read and edit directly.

**What is 全局记忆 vs 经验库?**
- **全局记忆** (`memory/MEMORY.md`): short agent-facing notes the agent reads/writes with its `memory` tool (2200-char budget). Managed in the GUI panel, CLI, and by the agent.
- **经验库** (`memory/*.md`): your per-topic detailed experience documents. Read by the agent's `memory search` and your `memory-query` skill.

**Can I uninstall without losing data?**
Yes. `dsh plugin remove dsh-mind` removes the bundle but all data files remain in `~/.dsh/`. Reinstall to pick up where you left off.

**What's the difference from Letta (MemGPT)?**
Letta is a full agent framework with server-side memory. dsh-mind is a lightweight DSH bundle: no server, no database, file-based storage, and it integrates into your existing DSH agent rather than replacing it. Think of it as "memory as a file" vs "memory as a service".

**Will the agent remember everything?**
The global memory file has a 2200-character budget. The agent is nudged to review and consolidate memories, so it keeps the most important facts. The experience library has no budget — it holds your curated per-topic docs.

**What happens to archived skills?**
Archived skills move to `~/.dsh/skills/_archived/<name>/`. They're no longer loaded into the agent's skill list, but you can restore them anytime with `dsh-mind restore <name>`.

**Does the Web GUI follow my language?**
Yes — the panel is zh/en and follows the DSH app language.

**Does it work on Windows?**
Yes. All paths use `path.join`, writes are atomic (rename), and CRLF is handled. Tested on Windows 11.

## License

[MIT](./LICENSE)
