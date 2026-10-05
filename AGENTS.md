# AGENTS.md — Evergreen-Note 规则正本

应用是打包在 `notekit-src/build/` 下的 `Evergreen note.app` 里的，**用户日常以 `cd notekit-src && pnpm dev:live`（热更新）方式体验改动**。Agent 的任何产品改动，只有到达这个正在运行的 App 并让窗口自动刷新，才算交付给用户可体验。

## 全局不变量

1. **验证构建用 `pnpm build`（vite）**。`tsc --noEmit` 在本仓库有大量存量报错，不得作为改动前后的门禁，也不得因它「报错」判定改动失败。
2. **「测试全绿」≠ 无回归**（2026-10-04 夜间复盘教训）。语义类改动（存储读写、SQL 下推等）必须写等价性对照或人工复核差异点，不能仅凭既有测试通过就收工。
3. **发现的优化点只入 backlog（inbox），实施前须用户在当前会话明确要求**。入库格式见 [backlog/README.md](backlog/README.md) 的每日生成协议——这是本仓 backlog 流水线的硬约束（AI 只能入库，选择权在人），不是通用客套。
4. **测试用隔离实例，不碰用户数据**。仓库工具（hotkey-audit、探针等）已内置隔离启动，不要为省事连上正式库测试。

## 路由表：当你要做 X → 先读 Y / 必须做 Z

| 触发条件（任务里能识别） | 必须动作 |
| --- | --- |
| 让用户体验任何前端/产品改动（默认场景） | 改动必须经热更新到达正式 App：用户已跑 `pnpm dev:live` 时，源码保存即自动发布（确认终端出现「已发布」日志且窗口自动刷新）；未在跑时，先启动 `pnpm dev:live` 或做一次性发布——`pnpm build` 后把 `notekit-src/dist` 拷入 App 包内 Resources/app/dist，并写 `.live-update` 标记触发自动刷新。**只跑 `pnpm build` 不算交付**——打包 App 读的是包内副本，不读源码树 dist |
| 改 UI 视觉、布局、交互样式（`notekit-src/src` 下样式与组件外观） | 必读 [notekit-src/docs/design-rules/DESIGN.md](notekit-src/docs/design-rules/DESIGN.md)；其中「UI 禁用清单」一节最高优先，偏离须登记 |
| 改快捷键、按键处理（hotkey / keydown / is-hotkey 相关） | 改后跑 `node notekit-src/tools/hotkey-audit.mjs` 实测派发矩阵（需先 `pnpm build`，全程约 8 分钟）；新增 Alt+字母/数字组合快捷键必须依赖 `notekit-src/src/slate-item/addons/Hotkey/helper.ts` 中 `isMyHotkey` 的 `event.code` 兜底（macOS Option 会把 `event.key` 改写成 `ñ`/`Dead`，byKey 匹配必失效） |
| 改 `notekit-src/server/`（存储、API、读写路径） | 改后跑 `pnpm test:storage`；涉及更新/查询语义的改动补等价性对照（见全局不变量 2） |
| 涉及优化点、需求、验收状态流转 | 必读 [backlog/README.md](backlog/README.md)；状态机 `done` 必须挂验收证据，`rejected` 必须写原因，AI 不得替人做 accepted 选择 |
| 改 Electron 外壳、打包、发布链路（`notekit-src/desktop/`、`notekit-src/tools/live-app.mjs`） | 注意 `main.cjs` 的 live-update 机制依赖包内 dist 目录下的 `.live-update` 标记文件；改动后按「让用户体验改动」一行做端到端发布验证 |

## 明确不要做

- 不要把「已提交到 Git」「构建通过」当作用户可体验的交付；用户体验入口只有一个：正在运行的 Evergreen note.app。
- 不要另立设计或流程正本：视觉规则只在 [notekit-src/docs/design-rules/DESIGN.md](notekit-src/docs/design-rules/DESIGN.md)，优化点流转只在 [backlog/README.md](backlog/README.md)。发现规则冲突时提请用户裁决，不静默改正本。

## 边界声明（本文件不写什么）

不写视觉细节（在 DESIGN.md）、不写优化点字段与状态机（在 backlog/README.md）、不写宿主 AI 通用操作规范（最小改动、如实汇报等由系统提示词保证）、不记一次性事故经过（在 backlog/evidence/，这里只留长期不变量）。
