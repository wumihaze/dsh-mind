# dsh-mind

> Give your DSH agent a mind — persistent memory + self-curating skills.

A DSH bundle that adds **cross-session memory** and **skill lifecycle management** to any DSH agent profile.

## What it does

| Capability | Description |
|---|---|
| **Memory** | Agent records and recalls experiences across sessions (file-based, local-only) |
| **Skill usage tracking** | Tracks which skills the agent uses, when, and how often |
| **Skill curation** | Auto-archives stale skills (30d → stale, 90d → archived), with snapshots & rollback |
| **CLI** | `dsh mind status / run / pause / archive / restore / snapshots / rollback` |
| **Web panel** | Visual dashboard for memory, skill stats, and curation controls (planned) |

## Install

```bash
# From npm (once published)
dsh plugin --profile <your-profile> add @wumihaze/dsh-mind

# From a local checkout
dsh plugin --profile <your-profile> add ./dsh-mind

# From a tarball
dsh plugin --profile <your-profile> add ./dsh-mind-1.0.0.tgz
```

Then start DSH with that profile:

```bash
dsh --profile <your-profile>
```

## How it works

- Pure local: memory and skill records stored as files under `~/.dsh/`
- No extra services, no ports, no databases
- Plugs into DSH via the Cordis plugin protocol (bundle layer)
- Uninstall removes the plugins but preserves your data

## Architecture

```
┌─────────────────────────────────────────────────┐
│  dsh-mind (bundle)                              │
│                                                 │
│  ┌───────────┐  ┌────────────┐  ┌───────────┐  │
│  │  memory   │  │ skill-usage│  │  curator  │  │
│  │  service  │  │  tracking  │  │  engine   │  │
│  └───────────┘  └────────────┘  └───────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  tools (agent-callable)                   │  │
│  │  memory tool · skill-manage tool          │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  CLI (dsh mind ...)                      │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Web panel (planned)                      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Requirements

- DSH ≥ 0.1.1-rc
- Node.js ≥ 20

## License

MIT
