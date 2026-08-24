# dsh-mind

> 给你的 DSH agent 一颗大脑 — 跨会话记忆 + 技能自治理。

为任意 DSH agent profile 添加**跨会话记忆**与**技能生命周期管理**的 DSH bundle。

## 功能

| 能力 | 说明 |
|---|---|
| **记忆** | Agent 跨会话记录和召回经验（文件存储，纯本地） |
| **技能使用追踪** | 追踪 agent 使用哪些技能、何时、频率 |
| **技能治理** | 自动归档过期技能（30d → stale, 90d → archived），支持快照与回滚 |
| **CLI** | `dsh-mind status / run / archive / restore / memory / install-preset ...` |
| **Preset** | 随包附带 agent preset，一键启用记忆 + 技能管理 |

## 安装

```bash
# 方式 1：从 npm（发布后）
dsh plugin --profile <your-profile> add @wumihaze/dsh-mind

# 方式 2：从本地 checkout
dsh plugin --profile <your-profile> add ./dsh-mind
```

## 启用 Agent 能力（Preset）

Bundle 安装后，host 层服务（skill-usage、curator）自动生效。
要让 agent 获得**记忆提醒**和**技能管理工具**，需要安装一个 agent preset：

```bash
# 全开模式：记忆 + 技能管理工具
dsh-mind install-preset mind-active

# 轻量模式：仅记忆（无技能管理工具）
dsh-mind install-preset mind-light
```

安装后，启动 DSH 会话时选择对应的 preset 即可：

- **Mind（全开）** — 记忆审查提醒 + 记忆使用指导 + 技能管理工具
- **Mind（轻量）** — 仅记忆审查提醒 + 记忆使用指导

```bash
# 移除 preset
dsh-mind uninstall-preset mind-active
```

> **原理**：Bundle 的 `cordis.patch.yml` 注册 host 层服务（skill-usage、curator-core），
> preset 的 `agent.cordis.yml` 注册 agent 层插件（memory-nudge、memory-guidance、skill-manage tool）。
> 两者配合工作：agent 层工具调用 host 层服务完成治理操作。

## CLI

```bash
# Curator 管理
dsh-mind status              # 查看治理状态和技能摘要
dsh-mind run                 # 执行一次治理（启发式）
dsh-mind pause               # 暂停自动治理
dsh-mind resume              # 恢复自动治理
dsh-mind archive <name>      # 归档技能
dsh-mind restore <name>      # 恢复已归档技能
dsh-mind list                # 列出所有技能
dsh-mind snapshots           # 查看快照列表
dsh-mind rollback <id>       # 回滚到指定快照
dsh-mind prune --days 30     # 清理 N 天前的快照

# 记忆管理
dsh-mind memory add <text>        # 添加记忆
dsh-mind memory search <keyword>  # 搜索记忆
dsh-mind memory list              # 列出所有记忆

# Preset 管理
dsh-mind install-preset [name]    # 安装 preset（不带 name 列出可用）
dsh-mind uninstall-preset <name>  # 移除 preset
```

退出码：`0`=成功，`1`=失败，`2`=参数错误

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  dsh-mind (bundle)                                       │
│                                                         │
│  Host 层（cordis.patch.yml 自动注册）                    │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │  skill-usage   │  │  curator-core  │  ← 服务         │
│  │  (tracking)    │  │  (governance)  │                 │
│  └────────────────┘  └────────────────┘                 │
│                                                         │
│  Agent 层（preset 注册）                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────┐  │
│  │ memory-nudge   │  │memory-guidance │  │ skill-    │  │
│  │ (prompt)       │  │(prompt)        │  │ manage    │  │
│  └────────────────┘  └────────────────┘  │ (tool)    │  │
│                                         └───────────┘  │
│                                                         │
│  CLI（独立 bin，零外部依赖）                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ dsh-mind status / run / archive / memory / preset   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  数据存储（~/.dsh/）                                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ memory/MEMORY.md  skills/  curator/  skill-usage/   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 配置参考

| 参数 | 默认值 | 说明 |
|---|---|---|
| `staleAfterDays` | 30 | 技能未使用 N 天后标记为 stale |
| `archiveAfterDays` | 90 | 技能未使用 N 天后自动归档 |
| `intervalDays` | 7 | 治理检查间隔（天） |
| `minIdleMinutes` | 120 | 会话空闲 N 分钟后触发治理 |
| `intervalTurns` (nudge) | 8 | 每 N 轮对话后提醒审查记忆 |

配置方式：编辑 profile 的 `cordis.patch.yml` 中 `curator-core` 行的 `config` 块，
或编辑 preset 的 `agent.cordis.yml` 中 `memory-nudge` 行的 `config` 块。

## 数据位置

所有数据存储在 `~/.dsh/` 下：

```
~/.dsh/
├── memory/MEMORY.md          # 记忆条目（bullet list）
├── skills/                   # 活跃技能
│   └── <name>/SKILL.md
├── skills/_archived/         # 已归档技能
├── curator/state.json        # 治理状态
├── curator/snapshots/        # 治理快照
└── skill-usage/index.json    # 技能使用记录
```

卸载 bundle 不会删除数据。

## 要求

- DSH ≥ 0.1.1-rc
- Node.js ≥ 20

## License

MIT
