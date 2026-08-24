# dsh-mind

> Give your DSH agent a brain — persistent memory, an experience library, and self-curating skills.

A DSH bundle that adds **cross-session memory** and **skill lifecycle management** to any DSH agent profile. All data stays local; the only optional external service is a **free-tier cloud vector store for semantic search** (SiliconFlow + Qdrant), which is **off by default**.

**[中文文档](./README.zh.md)**

## Features

| Capability | Description |
|---|---|
| **Sticky notes** | Agent-facing quick memos (`MEMORY.md`, 2200-char budget), read/written by the agent's `memory` tool, the GUI, and the CLI |
| **Experience library** | Your per-topic Markdown files (`comfyui.md`, `dsh.md`, …) are surfaced in the GUI and searchable by the agent |
| **Semantic search** *(optional)* | Hybrid `memory search`: SiliconFlow bge-m3 embeds notes + experience library into a free Qdrant vector store. Off by default — enable by writing `~/.dsh/memory/.vector-config.json` (`embedApiKey` / `vectorUrl` / `vectorApiKey`), or via the `DSH_MIND_*` env vars |
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

## Memory tiers (why AGENTS.md ≠ sticky notes ≠ experience library)

The agent has three kinds of knowledge — don't confuse them:

| Tier | File | Analogy | Loaded | Who writes |
|---|---|---|---|---|
| **Standing instructions** | `~/.dsh/AGENTS.md` | manual + notebook index | **every session, automatically** | you (static) |
| **Sticky notes** | `~/.dsh/memory/MEMORY.md` | agent's quick memos (2200-char budget) | agent reads on demand; **pinned ones are injected every turn** | agent / panel / CLI / auto-extraction |
| **Experience library** | `~/.dsh/memory/*.md` | your curated topic docs | keyword search | you |

One line: **AGENTS.md = always-carried instructions; sticky notes = the agent's own quick
memos; experience library = docs you look up when needed.** AGENTS.md lives outside this
plugin's panel — it is loaded into every session automatically.

**Pinned (常驻) sticky notes**: pin a note with 📌 in the panel and it is injected
into the prompt every turn — key facts (your language, signing identity, hard
conventions) are always present without a tool call. Nothing pinned → nothing
injected. Pins live in `~/.dsh/memory/pinned.json`.


## Quick Start

```bash
dsh plugin --profile web add @wumihaze/dsh-mind
```

Installed and ready to use. Four capabilities available immediately:

**1. Sticky notes** — your agent's quick memos across sessions

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

- **便签** (sticky notes) — the agent's quick memos, add/edit/delete.
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

### Agent capabilities are enabled by default

Since **0.1.22** every capability is host-plane and applies to **every agent** the
moment you install the bundle — no preset step needed:

- `memory` tool (sticky notes + experience-library search)
- `skill_manage` tool
- `memory-nudge` (review reminders), `memory-guidance` (usage guidance), `memory-auto` (automatic fact extraction), and `memory-inject` (pinned notes injected into every prompt)
- skill-usage telemetry, curator-core governance, and the Web GUI panel

The older `mind-active` / `mind-light` presets are kept only for backward
compatibility and add nothing extra.

> **Upgrading from ≤ 0.1.21**: if you had previously installed `mind-active` /
> `mind-light` (or merged the agent rows into a custom preset), remove those rows
> from your preset now — the capabilities are already host-plane, so keeping them
> would double-register the nudge. Empty the preset rows or delete the preset.
>
> To keep dsh-mind off specific presets, disable the rows in your profile's
> `cordis.patch.yml` (e.g. set `disabled: true` on `memory-nudge` or `tool-memory`).

## Agent tools

Every agent gets these two tools by default:

| Tool | Actions | Backing store |
|---|---|---|
| `memory` | `list` / `search` / `add` / `replace` / `remove` | `~/.dsh/memory/MEMORY.md` (sticky notes) + searches `~/.dsh/memory/*.md` (experience library) |
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
dsh-mind memory add <text>        # Add a sticky note
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
│  Agent capabilities (host-plane, enabled by default)                               │
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
│  │ memory/ (便签 MEMORY.md + 经验库 *.md)  skills/      │  │
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
│   ├── MEMORY.md              #   便签 (sticky notes, 2200-char budget)
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

**What are sticky notes vs the experience library?**
- **便签** (`memory/MEMORY.md`): short agent-facing memos the agent reads/writes with its `memory` tool (2200-char budget). Managed in the GUI panel, CLI, and by the agent.
- **经验库** (`memory/*.md`): your per-topic detailed experience documents. Read by the agent's `memory search` and your `memory-query` skill.

**Can I uninstall without losing data?**
Yes. `dsh plugin remove dsh-mind` removes the bundle but all data files remain in `~/.dsh/`. Reinstall to pick up where you left off.

**What's the difference from Letta (MemGPT)?**
Letta is a full agent framework with server-side memory. dsh-mind is a lightweight DSH bundle: no server, no database, file-based storage, and it integrates into your existing DSH agent rather than replacing it. Think of it as "memory as a file" vs "memory as a service".

**Will the agent remember everything?**
The sticky-notes file has a 2200-character budget. The agent is nudged to review and consolidate memories, so it keeps the most important facts. The experience library has no budget — it holds your curated per-topic docs.

**What happens to archived skills?**
Archived skills move to `~/.dsh/skills/_archived/<name>/`. They're no longer loaded into the agent's skill list, but you can restore them anytime with `dsh-mind restore <name>`.

**Why doesn't it auto-extract memory or inject memories into the prompt?**
dsh-mind's memory is **tool-based and agent-initiated**: the agent reads/writes its
sticky notes with the `memory` tool, and `memory-nudge` reminds it to review after
a noteworthy event. This is deliberate — it keeps the context budget small (2200
chars) and adds no extra LLM calls or prompt bloat. Some DSH memory plugins
instead auto-extract facts after each conversation or inject memories directly
into the prompt every turn (always-available recall). That is more automatic but
costs tokens and context. dsh-mind favors the lightweight, budget-conscious path.

**Does the Web GUI follow my language?**
Yes — the panel is zh/en and follows the DSH app language.

**Does it work on Windows?**
Yes. All paths use `path.join`, writes are atomic (rename), and CRLF is handled. Tested on Windows 11.

## License

[MIT](./LICENSE)
