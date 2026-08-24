# dsh-mind 项目书

> DSH（DeepSeek Harness）插件的完整项目说明：给 agent 装个脑子——记忆、经验库、技能自管理。
> 面向作者本人（功能太多记不住）与潜在协作者/公开用户。

- 仓库：`github.com/wumihaze/dsh-mind`（public）
- npm：`@wumihaze/dsh-mind`（public，最新见 `CHANGELOG.md`）
- 当前版本：0.1.36
- 授权：MIT

---

## 1. 项目概述

一句话：**一个 DSH bundle，装完即给所有 agent 增加跨会话记忆（便签 + 常驻注入 + 经验库）和技能自管理（skill_manage + 治理），附 Web GUI、CLI、自动提取。**

所有数据本地文件存储（`~/.dsh/`），无外部服务、无数据库。安装即用，所有能力 host 层全局生效，不需要装预设。（可选）语义检索用免费云端向量库（SiliconFlow embed + Qdrant），**默认关闭**，需要显式配 key 才启用。

## 2. 核心价值 / 定位

| 价值 | 说明 |
|---|---|
| 开箱即用 | `dsh plugin add @wumihaze/dsh-mind` 完事，所有 agent 默认获得能力 |
| 记忆"三路写入" | agent 主动 `memory` 工具 / GUI / CLI / **自动提取** |
| 记忆"两级在场" | 常驻便签**每轮注入提示词** + 全量便签/经验库**按需检索** |
| 兼容你已有数据 | 自动读你 `~/.dsh/memory/*.md` 主题经验库（`memory-query` 技能同源） |
| 本地/省钱 | 纯文件存储、工具式检索为主、注入按需（钉多少花多少） |
| 完整管理 | Web GUI 面板（中英）+ CLI + agent 工具三端一致 |

## 3. 功能全景

| 能力 | 机制 | 入口 |
|---|---|---|
| **便签记忆**（MEMORY.md，2200 预算） | agent `memory` 工具 / GUI / CLI / 自动提取 | 全部 |
| **常驻便签注入**（pinned） | 📌 钉住 → `memory-inject` 每轮注入提示词 | GUI 钉 |
| **自动提取**（memory-auto） | 会话空闲防抖后 LLM 提取事实 | 自动 |
| **经验库**（主题 md 文件） | GUI 显示 + agent `memory search` 检索 | GUI / agent |
| **语义检索**（可选） | SiliconFlow bge-m3 embed + Qdrant 免费向量库，`memory search` 混合（默认关） | 全端（需配 key） |
| **技能管理**（skill_manage） | agent 创建/修改/归档技能 | agent |
| **技能使用遥测**（skill-usage） | 记录使用次数/来源/钉 | 自动 |
| **技能治理**（curator） | stale(30d)→归档(90d)、快照、回滚 | CLI / GUI |
| **Web GUI** | 记忆管理器/技能仪表盘/治理控制台/快照（中英） | 设置→心智 |
| **CLI** | 13+ 子命令 | 终端 |
| **预设** | mind-active/mind-light（0.1.22 起空壳，能力已 host 层） | 兼容保留 |

## 4. 记忆体系（四层，别搞混）

| 层 | 文件 | 比喻 | 加载方式 | 谁能写 |
|---|---|---|---|---|
| **必背指令** | `AGENTS.md` | 操作手册+索引 | **每会话自动** | 你（静态） |
| **常驻便签** | 便签里钉住的几条 | 贴墙的备忘 | **每轮注入提示词** | 你（📌 钉） |
| **便签** | `memory/MEMORY.md`（2200 预算） | agent 随手记 | agent 按需读 | agent / GUI / CLI / 自动提取 |
| **经验库** | `memory/*.md` | 书架资料 | 关键词搜索 | 你（维护文档） |

一句话：**AGENTS.md = 一直带着的指令；常驻便签 = 贴墙的；便签 = agent 随手记的；经验库 = 要查的详细资料。**

## 5. 架构

```
┌───────────────────────────────────────────────────────────────┐
│  dsh-mind（bundle）                                            │
│                                                               │
│  Host 层（cordis.patch.yml，装完全局生效）                     │
│  ├─ dsh-mind          # 客户端注册锚点（no-op 插件）           │
│  ├─ skill-usage       # 技能使用遥测服务                      │
│  ├─ curator-core      # 治理状态机（快照/回滚/触发）           │
│  ├─ dsh-mind-web      # Web GUI 路由                          │
│  ├─ memory-nudge      # 记忆复习提醒（agent 写入后停止）       │
│  ├─ memory-guidance   # 系统提示词使用引导                     │
│  ├─ memory-auto       # 自动提取（空闲防抖 + LLM）             │
│  ├─ memory-inject     # 常驻便签注入提示词（默认开，无钉零开销）│
│  ├─ tool-memory       # memory 工具（list/search/add/replace/remove）│
│  └─ tool-skill-manage # skill_manage 工具（create/patch/delete）│
│                                                               │
│  CLI（lib/cli/bin.js，独立零依赖）                             │
│  状态/治理/记忆/预设 13+ 子命令                                │
│                                                               │
│  Web GUI（client，设置→心智，中英双语）                        │
│  记忆管理器（便签+经验库）/技能仪表盘/治理控制台/快照          │
│                                                               │
│  数据存储（~/.dsh/）                                          │
│  memory/{MEMORY.md, *.md, pinned.json}                        │
│  skills/ + _archived/ + .system/curator/                      │
└───────────────────────────────────────────────────────────────┘
```

## 6. 组件清单

| 文件 | 作用 |
|---|---|
| `src/memory/nudge.ts` | 记忆复习提醒：有事发生→每 N 轮提醒，直到 agent 写入便签或技能 |
| `src/memory/guidance.ts` | 系统提示词引导：教 agent 用 memory/skill_manage |
| `src/memory/auto.ts` | 自动提取：会话空闲防抖，调模型抽事实写便签 |
| `src/memory/inject.ts` | 常驻注入：钉住的便签每轮进提示词 |
| `src/memory/pins.ts` | pinned.json 读写/切换/清理 |
| `src/tool/memory.ts` | agent `memory` 工具（5 动作，搜便签+经验库，带预算/敏感过滤/去重） |
| `src/tool/skill-manage.ts` | agent `skill_manage` 工具（create/patch/delete，frontmatter 校验/钉保护） |
| `src/skill-usage/index.ts` | 使用遥测服务 |
| `src/curator/index.ts` | 治理状态机（stale→归档/快照/回滚/触发） |
| `src/web.ts` + `src/routes.ts` | Web 路由（记忆 CRUD + 钉 + 经验库 CRUD + 技能/治理/快照） |
| `src/client/*` | 面板（记忆/技能/治理/快照，中英 i18n） |
| `src/cli/bin.ts` | 独立 CLI |
| `cordis.patch.yml` | host 层组合（所有能力） |

## 7. Web GUI（设置 → 心智）

- **记忆管理器**：便签（添加/编辑/删除/📌钉住）+ 经验库（查看/编辑/删除/新建主题）+ 预算条 + 5s 自动刷新
- **技能仪表盘**：使用统计
- **治理控制台**：状态/暂停/恢复/触发
- **快照**：列表/回滚/清理
- 中英双语，跟随 DSH app 语言
- 所有错误显示服务端具体消息（如预算超限）

**路由一览**：
```
GET  /dsh-mind/status | memory | skills | curator | snapshots
POST /dsh-mind/memory                # 添加便签（2200 预算）
PATCH/DELETE /dsh-mind/memory/:idx   # 编辑/删除便签
POST /dsh-mind/memory/:idx/pin       # 切换常驻
POST /dsh-mind/memory/topic          # 新建经验库主题
GET/PUT/DELETE /dsh-mind/memory/topic/:name   # 查看/编辑/删除主题
POST /dsh-mind/curator/* | /snapshots/*      # 治理/快照
```

## 8. CLI（`dsh-mind`）

```
状态: status | run | pause | resume
技能: list | archive <name> | restore <name> | snapshots | rollback <id> | prune --days N
记忆: memory add <text> | search <kw> | list
预设: install-preset [name] | uninstall-preset <name>
退出码: 0 成功 / 1 失败 / 2 参数错
```

## 9. 配置项（cordis.patch.yml 各行 config）

| 行 | 参数 | 默认 | 说明 |
|---|---|---|---|
| curator-core | staleAfterDays / archiveAfterDays | 30 / 90 | 技能闲置→stale/归档 天数 |
| curator-core | intervalDays / minIdleMinutes | 7 / 120 | 治理检查间隔/触发前空闲 |
| memory-nudge | intervalTurns | 8 | 每 N 轮提醒复习 |
| memory-auto | intervalTurns / debounceMs | 10 / 90000 | 提取触发回合/空闲防抖 |
| memory-auto | provider / model / maxMessages / maxOutputTokens | — / — / 20 / 500 | 提取模型路由/采样 |
| memory-inject | enabled / maxChars | true / 600 | 常驻注入开关/上限 |
| memory 工具 | budget | 2200 | 便签字符预算 |
| tool-skill-manage | skillsRoot | ~/.dsh/skills | 技能根目录 |
| tool-memory | search.{enabled, embedUrl, embedModel, embedApiKey, vectorUrl, vectorApiKey, collection, topK, chunkSize} | 关 | 语义检索；推荐写 `~/.dsh/memory/.vector-config.json`（`embedApiKey`/`vectorUrl`/`vectorApiKey`），或设 env `DSH_MIND_EMBED_KEY`+`DSH_MIND_VECTOR_URL`+`DSH_MIND_VECTOR_KEY`，皆自动启用 |

## 10. 数据存储（全部 `~/.dsh/`，卸载不删）

```
~/.dsh/
├── AGENTS.md                          # 必背指令（不归插件管）
├── memory/
│   ├── MEMORY.md                      # 便签（2200 预算）
│   ├── pinned.json                    # 常驻标记
│   ├── .vector-index.json             # 语义检索索引清单（启用后生成）
│   ├── .vector-config.json            # 语义检索凭据（可选，含 API key）
│   └── *.md                           # 经验库（comfyui/dsh/prefs…）
├── skills/
│   ├── <name>/SKILL.md                # 活动技能
│   ├── _archived/                     # 已归档
│   └── .system/curator/{state.json, snapshots/, usage.json}
```

## 11. 版本历史（0.1.3 → 0.1.30）

| 版本 | 内容 |
|---|---|
| 0.1.3 | @deepseek-ai 依赖挪 peer（修模块重复）；client inject 修复 |
| 0.1.4 | 裸包名锚点行 → Web 客户端注册进 manifest |
| 0.1.5 | nudge 监听 skill_manage；guidance config 默认值 |
| 0.1.6 | ~~客户端改子路径注册~~（回退） |
| 0.1.7 | 恢复裸包名注册 |
| 0.1.8 | client factory 漏 `return module.exports`（真根因） |
| 0.1.9 | slot register name 写错父槽名 |
| 0.1.10 | 面板 i18n 绑定（t 注入组件） |
| 0.1.11 | 重复 /memory 路由合并 |
| 0.1.12 | prefix 路由尾斜杠 bug 修复 |
| 0.1.13 | agent `memory` 工具（五动作） |
| 0.1.14 | 面板记忆编辑（PATCH） |
| 0.1.15 | 面板 5s 自动刷新 |
| 0.1.16 | 经验库（主题文件）接入面板+工具 |
| 0.1.17 | 经验库编辑/删除/新建（topic CRUD） |
| 0.1.18 | 编辑器移到顶部+滚动可见 |
| 0.1.19 | 面板重排：添加条目置顶，命名 全局记忆/主题记忆 |
| 0.1.20 | 改名 经验库 |
| 0.1.21 | 面板标题/描述说清两层 |
| 0.1.22 | agent 能力 host 层（装完即用，无预设） |
| 0.1.23 | 预算三端统一；面板错误显示服务端消息 |
| 0.1.24-25 | README 重写；改名 便签 + 记忆体系说明 |
| 0.1.26 | **memory-auto 自动提取** |
| 0.1.27 | 文档同步 |
| 0.1.28 | **常驻便签注入（memory-inject + 📌）** |
| 0.1.29 | pin 路由逻辑修复 |
| 0.1.30 | 文档同步 |
| 0.1.31 | PROJECT.md 项目书 + 文档同步 |
| 0.1.32 | **语义检索**（SiliconFlow bge-m3 embed + Qdrant 免费向量库，`memory search` 混合，默认关） |
| 0.1.33 | 修复：Qdrant point ID 必须为 UUID（真实集群验证通过，89 向量可检索） |
| 0.1.34 | 语义检索凭据支持配置文件 `memory/.vector-config.json`（免环境变量，三入口统一读取） |
| 0.1.35 | README（中英）补语义检索功能说明 + `memory reindex` + 数据文件 |
| 0.1.36 | 英文 README 全部中文化清理（便签/经验库/常驻→英文），仓库已设为 public |

## 12. 开发 / 发布流程

```
改代码/文档 → 升版本 → npm run build && npm test
→ git commit + push（GitHub）
→ npm publish（临时 npmrc 带 token，用完即删）
→ 有代码改动：dsh plugin --profile web add @wumihaze/dsh-mind@<新版本> → 重启 web
→ 有代码改动：跑全量功能测试（路由/工具/CLI）验证
```

> ⚠️ 升级前先停 dsh web（pnpm 替换文件会和 app 热重载竞态）。
> ⚠️ GitHub 与 npm 必须同步发版（用户要求）。

## 13. 设计取舍与边界

| 取舍 | 说明 |
|---|---|
| 工具式检索为主 | 省 token、不膨胀上下文；代价是依赖 agent 主动 |
| 常驻注入按需 | 钉多少花多少；本地模型无 token 顾虑可多钉 |
| 自动提取默认开 | 每 10 回合+空闲 90s 提取；过滤密钥/去重/预算 |
| 便签 2200 预算 | 保持精简；超了拒绝新增（三端一致） |
| 纯文件存储 | 无 DB、可读可改、卸载不删；语义检索为可选云端增强（SiliconFlow + Qdrant 免费档），默认关，正文不出本地 |
| host 层全局 | 所有 agent 默认获得；可按行 disabled 关闭 |

**边界情况已处理**：全新安装（无目录自动建）、Windows 路径、空记忆/空技能、越界索引、非法主题名、重复创建、超预算、密钥过滤、去重。

## 14. 未来方向（roadmap）

- [x] 自动提取（memory-auto）
- [x] 常驻注入（memory-inject）
- [x] 便签语义检索（embedding，全云端免费向量库：SiliconFlow bge-m3 + Qdrant）
- [ ] 治理快照的 Web 可视化增强
- [ ] 便签跨 agent 共享开关
- [ ] 自动提取的整合模式（满预算时 LLM 合并而非跳过）
- [ ] GitHub Actions CI（lint → typecheck → test → build → publish）
- [ ] 插件市场收录

---

*生成于 2026-08-25，随功能演进持续更新。*
