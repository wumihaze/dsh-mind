# dsh-mind 交付清单

> 完整开发路线图，按阶段推进。每项完成后打勾。

## Phase 1：Bundle 打包（核心）

- [x] 1.1 新建仓库 `wumihaze/dsh-mind`，monorepo 结构
- [x] 1.2 合并五个包为单包（`src/memory/`、`src/skill-usage/`、`src/curator/`、`src/tool/`）
- [x] 1.3 `package.json`：`dsh.bundle.patch` → `./cordis.patch.yml`，`files` 含 `lib/` + patch
- [x] 1.4 `cordis.patch.yml`：insert 行（memory、skill-usage、curator、tools）
- [x] 1.5 构建系统：`tsconfig.json`（`rootDir: src`, `outDir: lib`），`pnpm build` 脚本
- [x] 1.6 子路径导出：`exports` 含 7 个子入口（memory、skill-usage、curator、tool、skill-validate）
- [x] 1.7 依赖声明：`@deepseek-ai/cordis`（peer）、`@deepseek-ai/dsh-*`（0.1.1-rc.2）、`yaml`；内联 `skill-validate`
- [ ] 1.8 本地安装验证：`dsh plugin --profile test add ./dsh-mind` → 启动成功
- [ ] 1.9 卸载验证：`dsh plugin --profile test remove dsh-mind` → 服务消失，数据保留
- [ ] 1.10 升级验证：改版本号 → update → 无数据丢失

## Phase 2：CLI 命令

- [x] 2.1 `dsh-mind` 命令组（独立 bin 脚本，`package.json` → `bin.dsh-mind`）
- [x] 2.2 子命令：`status` / `run` / `pause` / `resume` / `archive <name>` / `restore <name>` / `list` / `snapshots` / `rollback <id>` / `prune --days N`
- [x] 2.3 `dsh-mind memory add "内容"` — 手动记一条
- [x] 2.4 `dsh-mind memory search "关键词"` — 手动查
- [x] 2.5 `dsh-mind memory list` — 列出所有记忆条目
- [x] 2.6 Help 文本：`dsh-mind --help` 完整用法说明
- [x] 2.7 退出码规范：0=成功，1=失败，2=参数错

## Phase 3：Preset / Profile 配置

- [x] 3.1 随包附带 preset：`presets/mind-active/agent.cordis.yml`（全开）+ `preset.yml`
- [x] 3.2 轻量 preset：`presets/mind-light/agent.cordis.yml`（只开记忆，不开自动治理）+ `preset.yml`
- [x] 3.3 README 说明：安装 → `dsh-mind install-preset <name>` → 选择 preset 启动
- [x] 3.4 配置参考文档：所有可调参数 + 默认值 + 示例（见 README 配置参考节）
- [x] 3.5 CLI 扩展：`dsh-mind install-preset [name]` / `dsh-mind uninstall-preset <name>`
- [x] 3.6 `cordis.patch.yml` 重构：仅保留 host 层服务（skill-usage + curator-core）

## Phase 4：Web GUI 面板

- [ ] 4.1 DSH Web 插件骨架：`client/` 目录，slot 注册，主题适配
- [ ] 4.2 **记忆面板**：列表（按主题分组）、搜索、新增、编辑、删除
- [ ] 4.3 **技能仪表盘**：使用频率图（最近 30 天）、状态标签（active/stale/archived）
- [ ] 4.4 **治理控制台**：当前状态、暂停/恢复按钮、手动触发、阈值设置（30/90 天可调）
- [ ] 4.5 **快照管理**：列表、时间戳、描述、回滚按钮、清理按钮
- [ ] 4.6 **设置面板**：staleAfterDays、archiveAfterDays、autoRun 开关、pinned 列表
- [ ] 4.7 i18n：EN + ZH 双语
- [ ] 4.8 深色/浅色主题：跟随 DSH 主题
- [ ] 4.9 响应式：宽屏/窄屏都能用
- [ ] 4.10 交互细节：加载态、空态、错误态、确认弹窗（归档/回滚前）

## Phase 5：测试与质量

- [ ] 5.1 集成测试：安装 → 启动 → 所有服务可用 → 工具可调用
- [ ] 5.2 E2E 流程测试：记记忆 → 查记忆 → 触发治理 → 归档 → 恢复 → 回滚
- [ ] 5.3 数据持久化测试：重启 DSH 后数据不丢
- [ ] 5.4 Windows 兼容：路径、换行符、权限
- [ ] 5.5 边界情况：记忆文件为空、技能列表为空、并发写入
- [ ] 5.6 性能：1000 条记忆搜索 < 500ms

## Phase 6：文档

- [ ] 6.1 README.md（EN）：功能、安装、使用、配置、FAQ
- [ ] 6.2 README.zh.md：中文完整版
- [ ] 6.3 架构图：一张图说清记忆层 + 技能层 + 治理层
- [ ] 6.4 快速开始：3 步（装 → 用 → 看效果）
- [ ] 6.5 配置参考：所有参数表格
- [ ] 6.6 FAQ："数据存哪？""能卸载吗？""和 Letta 有什么区别？"
- [ ] 6.7 CHANGELOG.md：版本记录

## Phase 7：发布与 CI

- [ ] 7.1 npm 账号：`@wumihaze` scope 创建
- [ ] 7.2 `pnpm publish`：首次发布 v1.0.0
- [ ] 7.3 `pnpm pack`：同时出 `.tgz` 供不想用 npm 的人
- [ ] 7.4 GitHub Actions：CI（lint → typecheck → test → build）
- [ ] 7.5 Release 工作流：tag → 自动 build → publish → GitHub Release
- [ ] 7.6 徽章：npm version、CI status、license

## Phase 8：后续迭代（v1.1+）

- [ ] 8.1 向量检索：记忆从关键词搜索升级为 embedding 语义搜索
- [ ] 8.2 多 agent 共享：多个 agent 实例共享同一记忆库
- [ ] 8.3 记忆衰减：长期未访问的记忆自动降权/归档
- [ ] 8.4 技能推荐：根据当前任务推荐相关 skill
- [ ] 8.5 导出/导入：记忆和技能状态可序列化迁移
- [ ] 8.6 插件市场：上架 DSH 插件市场（如果有的话）

---

## 仓库结构（目标）

```
dsh-mind/
├── package.json              # bundle 声明 + 子入口
├── cordis.patch.yml          # 配置层
├── src/
│   ├── index.ts              # bundle 入口
│   ├── invariant.ts          # 运行时不变量
│   ├── memory/
│   │   ├── index.ts          # 记忆服务
│   │   ├── nudge.ts          # 提醒机制
│   │   ├── guidance.ts       # 引导机制
│   │   └── types.ts
│   ├── skill-usage/
│   │   ├── index.ts          # 使用追踪
│   │   └── types.ts
│   ├── curator/
│   │   ├── index.ts          # 治理核心
│   │   ├── state-machine.ts  # 状态机
│   │   ├── snapshot.ts       # 快照
│   │   └── types.ts
│   ├── tool/
│   │   ├── memory-tool.ts    # agent 记忆工具
│   │   └── skill-tool.ts     # agent 技能管理工具
│   └── cli/
│       ├── bin.ts            # CLI 入口
│       ├── args.ts           # 命令解析
│       └── commands/         # 各子命令
├── client/                   # Web GUI 面板（Phase 4）
│   ├── index.ts
│   ├── panels/
│   │   ├── memory-panel.ts
│   │   ├── skill-dashboard.ts
│   │   ├── curator-console.ts
│   │   └── settings-panel.ts
│   └── styles/
├── presets/
│   ├── mind-active/
│   │   └── agent.cordis.yml
│   └── mind-light/
│       └── agent.cordis.yml
├── tests/
│   ├── integration.spec.ts
│   ├── e2e.spec.ts
│   └── unit/
├── docs/
│   ├── architecture.md
│   └── faq.md
├── .github/workflows/
│   └── ci.yml
├── README.md
├── README.zh.md
├── LICENSE
├── CHANGELOG.md
└── ROADMAP.md
```

---

## 总工期估算

| 阶段 | 时间 | 产出 |
|---|---|---|
| Phase 1-3（打包+CLI+preset） | 2-3 天 | 可 `dsh plugin add` 安装使用 |
| Phase 4（Web GUI） | 3-5 天 | 可视化面板 |
| Phase 5-7（测试+文档+发布） | 2-3 天 | npm 上可安装 |
| **合计** | **7-11 天** | 完整产品 |
