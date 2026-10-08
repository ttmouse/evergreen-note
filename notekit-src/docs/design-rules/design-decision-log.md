# 设计决策日志（只增不改）

> 每条记录一次拍板。改值不改旧条：新实事记新条，旧条保留划掉标注"被 <日期> 条取代"。
> 目的：半年后回看"当初为什么这么定"，以及防止同一争论反复拉扯。

## 模板

- **<日期>（<一句话主题>）**：拍了什么（数值/规则）；为什么（用户目检/工程约束/参考项目）；明确否掉了什么、否掉原因；若取代旧条，写明取代关系。

## 2026-10-04（Evergreen-Note 正本设立）：合并既有规则文档，接通 project-ledger 台账
- **拍了**：notekit-src/docs/design-rules/DESIGN.md 为唯一正本；notes/UI设计禁用规则.md 全文升为 §2（独立节，最高优先）；notes/Andy模式设计语言.md 的交互规则并入 §3、token 语义约束并入 §4、反模式并入 §7、验收场景并入 §8。两份旧文档头部标"已并入"，保留文件不删。
- **为什么**：项目已有强台账传统（project-ledger 21 条、D/E/C/R 分类，只增不改），缺的只是正本载体与规则/证据拆分。接传统，不造平行体系。
- **否掉**：「给 note-evidence/ 造新目录」——豆皮否：notes/ 验收流水继续原位，不加目录只加归属说明；「.bak 备份移 evidence」——直接删，git 有历史。
- 决策台账分工：范围级决策（D/E/C/R）在 project-ledger/records/；纯设计数值拍板在本目录决策日志；两者引用带出处。

## 2026-10-04（token 收敛方案）：以 --nk-* 为唯一语义层，旧通用名降别名过渡
- **拍了**：--primary/--info/--bgrey/--danger 等旧通用名降级为 var(--nk-*) 别名；**别名只做过渡不长期**，每批次迁完顺手删，不造新债；新代码一律只用 --nk-*。
- **规模**：workspace-theme.css 83 个裸 hex、all-styles.css 453 个裸 hex 为清欠对象；先清 workspace-theme（主题语义正本），all-styles 按选择器段分批。
- **为什么**：tools 类产品 token 语义层必须单一；别名零风险承接存量引用。
- **待办**：两份 .bak.20261002* 备份删除（待工程侧执行，git 已有历史）。

## 2026-10-05（清欠启动）：注释改向完成，bak 残留勘误 47 处，workspace-theme 清欠批次 W1–W5 划定
- **已完成**：workspace-theme.css:983 注释改指 `docs/design-rules/DESIGN.md §2`（artifacts/ 快照内旧引用一律不动）。
- **勘误**：bak 残留实为 47 处，非 10-04 条所记「两份」；大头在 notekit-src 源码树（41 处，含 build/ 2 处），.bak/ 目录仅 4 处。已核：notekit-src 内 41 处全部有正本，删除无信息损失；build/ 2 处随构建再生成。
- **拍定**：workspace-theme.css 83 处裸 hex 按「色值→语义」分五批清（W1 线/边框灰→--nk-line/--nk-line-strong；W2 表面底色→--nk-canvas/--nk-surface/--nk-sidebar；W3 文字灰阶→--nk-ink/--nk-muted；W4 强调色→--nk-accent/--nk-accent-soft；W5 杂项色逐个归并或走 §9 例外登记）。每批先出 hex→token 映射表过设计拍板，再由工程执行；批完 grep 归零＋目检验收。all-styles.css（453 处）等 W 完成后按选择器段另划批。
- **归属**：bak 删除属破坏性工程操作，归工程侧执行（一次 rm，git 可回溯），设计侧不直接删。
- **待办**：① bak 47 处删除（工程侧）；② W1–W5 映射表逐批出（设计侧）。

## 2026-10-05（安全假设勘误）：47 处 .bak.20261002* 从未进 git，「零风险」说法撤回
- **勘误**：本日早条「git 已有历史，零风险」不成立。实测：47 个 bak 全部 untracked（git ls-files 零命中）；.gitignore 24–26 行忽略 `/.bak/`、`**/*.bak`、`**/*.bak.*`；仓库仅 2 个提交。抽验 bak 与正本内容 DIFFERENT（SvgIcon.tsx、server.mjs）——bak 的价值正是 10-02 当天的旧版状态，删除不可逆。
- **拍定**：删除改为两步走，先归档后删：①`tar czf ~/Projects/Evergreen-Note-bak-20261002.tar.gz`（47 个打包，存仓库外）；②归档校验通过（tar -tzf 计数=47）后执行 `find -print -delete`。两步都归工程侧，设计不执行删除。
- **来源**：豆皮 2026-10-05 复核指出，实测数据由其提供、设计侧当日复核确认。
- **教训入册**：拍「删除零风险」前必核三点——是否被 git 跟踪、是否被 .gitignore 覆盖、仓库历史深度；任一不满足即按不可逆处理。

## 2026-10-05（W1 映射拍板）：线/边框灰 11 处定映射；桥接行只改值不删行
- **拍了**：W1 批 11 处裸 hex 映射（明细见当日交工程映射表）：浅色 5 处值等价直改 var(--nk-line/--nk-line-strong)；andy 浅色分隔线 #dadada 归并 --nk-line-strong（→#dddddd，同档不可辨）；夜间 3 处值等价直改，--node-child-border #34434a→var(--nk-line)（→#3b4a50 微调）、--popup-menu-input-border #4a5d64→var(--nk-line-strong)（→#4a5b61 微调）。
- **否掉/转出**：夜间 --node-child-border-focus #5b737b 不映射——亮于 --nk-line-strong(#4a5b61)，focus 强调语义 line-strong 不承担，保留原值转 W5 并入 §9 例外登记。
- **规则明确**：:root/night 块的旧同名词行（--common-border/--node-child-border 等）**只改值不删行**——它们是对 all-styles.css 旧层同名词（#ddd 等）的覆盖方，删行会让旧层浅色值在夜间漏出。删行须等 all-styles 清欠批次一并处理。
- **豁免重述**：28 处 --nk-* 定义行是正本值（§4），永久豁免不计债。W1 后裸 hex 83→72，真债余 44（使用行）。
- **验收**：批后 grep 归零口径＋目检三处：搜索节点边线（夜间首次跟随 --nk-line，现状为白线）、andy 头部分隔线（浅色）、弹出菜单输入框边线（浅/夜）。

## 2026-10-05（用户拍板停止）：归档/删除线与 token 清欠线全部挂起
- **拍了**：①bak 47 处保留原位——不再归档、不再删除、不再盘点 .bak/ 目录（豆皮已将 47 个 .bak.20261002* 完整还原回原位，sha256 逐字节校验一致，现场与派单前相同）；②token 清欠 W1–W5 全线挂起，不再派工程，W1 映射表存档于本日志上方 W1 条，待新指令再议。
- **否掉**：本日勘误条中「拍定两步走 tar+delete」方案——用户原话「这个项目没有归档的需求，停止掉，不要做无益的事情」。整条归档/删除方向撤回，非仅改执行方式。
- **取代关系**：本条取代 2026-10-05「安全假设勘误」条的执行方案部分；「2026-10-05（W1 映射拍板）」条中映射结论保留存档（豆皮已逐条核验行号色值全对），但**不执行**。
- **保留价值**：W1 映射与桥接行「只改值不删行」的分析判断不受影响，未来重启 token 清欠时直接复用，不需重查现场。

## 2026-10-05（正本补三节）：排版/圆角/间距档位入册，现状实拍+建议目标待拍板
- **拍了**：§3a 排版（字号 11 档现状实拍、建议收敛 7 档 12/13/14/16/18/24/34、补 tabular-nums 惯例）、§5.1 圆角档表（8 种散值现状、建议 5 档 3/4/6/8/9999，--radius-md 重定义 4→6、--radius-sm 重定义 2→3、100px 胶囊统一 9999）、§5.2 间距档表（建议 4/8/12/16/24/32 六档）。
- **为什么**：豆皮审计出"正本无三节则清欠无判定依据"；先如实现状、建议目标随附依据，拍板权在豆皮/用户，设计师只给判定基准。
- **否掉**：按豆皮拍不盲拍——每个档位附依据（6px 是实际主力档应立 token、100px 胶囊在高容器上失效、rem/百分比层随 all-styles 清欠迁移）。
- **关联**：§5 原布局正文保留；待收敛状态在表内标注，收敛目标值拍板后转正式（走新条不改旧条）。

## 2026-10-05（暗色双源收敛方案·仅方案不执行）：--dark-* 20 个并入 --nk-*/夜间块
- **现状**（双源实测值）：NightMode.tsx :root 定义 --dark-* 10 个（--dark-bg-primary:#202123 等）；workspace-theme.css body.night-mode 块重定义 7 个同名（--dark-bg-primary:#1c2529 等）+ nk 15 个。**优先级：workspace 侧赢**（body.night-mode 选择器特异性 > :root），NightMode.tsx 的 :root 定义在夜间下**实际不生效**，但它自己的规则还在读（本件疑难：读的是覆盖后的 workspace 值，不是 tsx 里的旧值）。
- **方案**：现已全部收进 workspace-theme.css 夜间块。20 个 --dark-* 并入 --nk-* 语义层：可映射 5 个（--dark-bg-primary→--nk-canvas，--dark-bg-secondary→--nk-sidebar/surface，--dark-text→--nk-ink，--dark-text-less-important→--nk-muted）；无映射 5 个（kanban 组、text-no-important、extremely/very/important 阶梯——这些具体值不通用，建议改名或不立 token），无映射的直接改 NightMode.tsx 内规则为使用现有 --nk-*，无对应语义的走 --nk-ink-soft / --nk-accent-soft 已有语义。
- **工程师执行注意**：**删 NightMode.tsx :root 里的 --dark-* 定义行是安全的**（它在夜间下不生效）；**删 workspace-theme body.night-mode 里的 --dark-* 定义行不是安全和错动作**——NightMode.tsx 的规则目前仍在读这些变量，删了它就裸值回退到未定义。正确顺序：①先改 NightMode.tsx 规则从读 --dark-* 换成读 --nk-*（或保留 --dark-* 作为 workspace 内部一次性别号），②确认全仓 grep 无 --dark-* 引用后再删定义。**别倒序**。
- **否掉**：「NightMode.tsx 里同时保留 --dark-* 定义作为 fallback」——双源就是病根，fallback 会掩盖问题。

## 2026-10-05（三节数据勘误）：豆皮核出手住五处，按实测重写
- **勘误**：①--radius-sm（2px）"用量 0"前提不成立，实测 6 处（workspace 1 + all-styles 5），sm 重定义 2→3 撤回；②radius token 实际近乎死定义（引用仅 1 处 var(--radius-lg)），问题转为"先决定用不用 token，再收档位"——启用 token 作为前提，散值批内渐进迁移；③100px 胶囊"高元素上失效"依据不成立（20 处全在 aspect-ratio:1/1 小按钮上，够用），换依据为"统一减少记忆与误录"；④字号 7 档漏 28px（.srs-no-items ×2 在用），目标改为 8 档含 28；⑤§5.2 间距统计口径不完整（漏简写值 14/20/84px），全部纳入判定。
- **为什么**：先保数据准再收法；上面每条都在会直接影响工程收敛动作。
- **流程教训**："再核一遍"的事必须做成第一遍就做——2px/token 引用数/28px 在当时都顺手可查，漏认导致拍板意见系带着错误前提。
- **修复**：五处已全部写回 DESIGN.md 对应节，数据以本轮实测为准。

## 2026-10-05（档位定案）：三节档位由"建议待拍"转"正式拍定"
- **拍了**（豆皮）：字号 8 档含 28px；圆角先启用 token（--radius-md 4→6、sm 保持 2px、新增 --radius-pill:9999、100px 归 9999、3px 个案归 2 或 4）；间距 6 档（6→8、10→8或12、20→16或24）。
- **口径**：间距/圆角统计一律含简写多值；10px 全项目口径 5 处（workspace 3 + all-styles 1 + addon-center 1），addon 侧样式纳入统计。
- **笔误修复**：§5.2 标题重复（§5.2### §5.2）已改。
- **生效**：W1–W5 映射表按本条基准做；模块内数值见 DESIGN.md §3a/§5 正式档。

## 2026-10-05（统计口径勘误补充）：10px 计数修正
- 上一条沿用表内"10px ×3"是 workspace 单文件口径，全项目实为 5 处（addon-center.css:2 在用，一处 MuiDialog-paper）。DESIGN.md §5.1 表已同步改口径。沿用教训：跨文件统计必须全部来源入数，不能以单文件代替全项目。

## 2026-10-05（蒙层误伤 Popover 勘误）：MuiBackdrop 深色规则收窄到 MuiDialog
- **事故**：统一蒙层批次把 `html body .MuiBackdrop-root { background-color: … !important }` 写成全局，命中了 MUI Popover 的 backdrop（`invisible: true`，本应透明、只负责点外关闭）。后果：顶部“更多”菜单、各类下拉/Select 一打开全屏变灰，轻量菜单被当成 modal。用户原话：“像这种菜单打开的时候就不应该有浮层了。这是属于低级错误。”
- **修复**：规则选择器收窄为 `html body .MuiDialog-root .MuiBackdrop-root`——真 modal（MUI Dialog）才上深色蒙层，Popover（含菜单/Select）保持透明。`.nui-mask` 只由自研 Dialog 的 `mask` 开关渲染，不受影响。
- **教训**：给共享组件类名（如 MuiBackdrop-root）加 `!important` 全局样式前，必须先枚举该类的全部使用方（Dialog、Popover、Select 都用 backdrop）；“不可见”也是样式，会被 `!important` 覆盖。


## 2026-10-05（T3：颜色分层与组件逐态入正本）：DESIGN.md §4 扩写 + 新增 §4.5
- **拍了**：①§4 补「颜色来源分层与归属」五层定界——1 --nk-*（契约层）/ 2 旧通用名（桥接别名，只改值不删行）/ 3 NightMode --dark-*（待收编过渡层，禁止新增，映射建议五条标待拍板）/ 4 all-styles 裸 hex（旧遗留层，随挂起的清欠批）/ 5 theme.ts --cl-* 色板（项目自治层，正本只登记边界不约束值：工作区 chrome 不引 --cl-*，--cl-* 不上工作区界面语义，交叉类随清欠批归类）。②新增 §4.5 组件逐态：逐态基线实测入正本——hover 已 token 化（--nk-hover/--nk-tab-hover）、focus 环三源待统一、active 单点无 token 不立新、disabled 零覆盖暂不立规则、选中态维持 .is-active 单信号。
- **为什么**：T4 清 !important 193 处需要判定依据；颜色五层中 3/5 层游离正本之外是 audit 第一节最严重项。现状如实记录，收敛值一律标【待拍板】——延续上轮口径。
- **否掉**：①--dark-* 立即收编/改代码——token 清欠挂起中，本单边界「只写正本不改代码」；②disabled 立即立规则——现状浏览器默认降灰无可用性事故，无事实支撑不预立法；③focus 环色直接定值——三源并存是现状描述，选 accent 还是立新 token 影响后续多批，留待 T4 前拍板。
- **待拍板清单**（下次拍板时一次过）：--dark-* 五条映射、focus 环色归属（--nk-accent 或新 --nk-focus-ring）、active pressed 表达（hover 加深档或个案保留）。

## 2026-10-06（浮层预览窗样式对齐）：backlink-reading 卡片与 float-viewer 窗口 chrome 归档位
- **拍了**：①「链接到这篇笔记」卡片去 16px 大圆角与硬编码灰底（#f5f5f8/#222d32 三条 !important 规则删除），改 `--nk-backlink-bg` + 1px `--nk-line` + 8px 圆角（§5.1 lg 档）；标题 17px→14px（§3a 分组标题档，17px 本就是待并档）；计数徽标 13→12px；条目圆角 8→6（Control 档）；hover/active 裸 rgba 归 `--nk-hover`/`--nk-tab-hover`（§4.5 点名残留清零）；focus 环色归 `--nk-accent`；两列网格改 `auto-fill/minmax(220px,1fr)`——浮窗 500px 宽下两列过挤。②浮层预览窗（.dialog-float-viewer）补窗口 chrome：头部 44px + 1px 底线 + 标题 13px muted 单行省略（窗口条层级须低于正文标题，§8.3）；头部按钮 28px hover token 化；正文底色 `--nk-surface`；浮窗内引用区 padding-bottom 100px→24px（浮窗高度跟内容，大留白被读成空）；底部引用工具条文字归 `--nk-muted`。
- **为什么**：用户目检反馈“浮层模式面板和整体设计风格不搭”；卡片旧样式是 token 化之前的散值层（越档字号 + 硬编码 + 多信号叠加），窗口头部则从未入主题体系。
- **否掉**：给浮窗加投影提层级——§1 浮层不用投影既有拍板（边线表达层级），不翻案；backlink-reading 立独立新 token——`--nk-backlink-*` 三枚已存在，够用。
- **验收**：浅色/夜间各目检 Cmd+点击浮窗：头部弱于正文 h1、卡片无双重边线、hover 态与全站一致；grep 确认 backlink-reading 段零裸 hex、零 !important。

## 2026-10-06（浮层窗口感勘误）：头部常驻 + 边界加浅投影，登记 §9 例外
- **事故**：浮层预览窗头部沿用旧规则——绝对定位悬浮 + `:not(.node-head-visible)` 时 opacity:0（滚动>40px 或悬停才显现）。该行为为整页阅读列设计（滚动能看到大标题），独立小窗上结果是「不悬停就看不到钉住/关闭按钮，窗口像浮在纸上的白块」。用户原话：“顶部的那些关闭按钮这些东西也看不到……整个浮层也没有边界。”
- **拍了**：①浮层预览窗（.dialog-float-viewer）头部改 `position: relative` 常驻文档流、`opacity:1 !important`（压过滚动手势的行内 opacity），13px muted 窗口条 + 1px 底线；②窗口边界在 1px 边线外加 `box-shadow: var(--nk-shadow)`——**§9 例外登记**：偏离「浮层不用投影」既有拍板，依据是用户拍板「浮层必须有可分辨边界」，纯 1px 边线在浅色白纸面上不可辨；投影用既有 token，浅/夜双主题各自取值，不立新值。
- **边界**：例外范围仅限 .dialog-float-viewer（浮层预览窗）；Andy Mode 阅读列、对话框、菜单不适用，仍守「浮层不用投影」。
- **验收**：Cmd+点击浮窗不悬停即见头部三按钮与标题；窗口在浅色画布上有可分辨轮廓；浅/夜各目检一次。

## 2026-10-06（Andy 页面级导航语义）：侧栏页面点击原位替换当前列，登记 §3.6
- **事故**：Andy 多栏模式下点侧栏「主题」，Topic list 在活动列右侧新开一列并新增页签，而非替换当前笔记区域。根因：Router.to 的 Andy 分支把所有导航都当笔记链接走 `$.andy.navigate`（右侧子列语义），注册页面（diaries/topics/graphs 等）没有独立的页面级语义。
- **拍了**：注册页面导航 = 原位替换当前活动列（Router.to 识别 `path in routes` 走新增的 `$.andy.navigatePage`：已开则展开定位，否则关活动列同位开新列）；笔记链接仍守 §3.1–3.3 阅读路径语义。依据：用户 2026-10-06 原话“点击主题的时候，是应该替代当前笔记区域的”。
- **边界**：仅注册页面路由；星标（`item/<ky>`，是笔记）不适用，仍走链接语义；Alt+点击（最左开列）、Cmd+点击（弹窗）不变。
- **验收**：多列状态下点侧栏主题/图谱/每日 → 活动列原位变成目标页面，页签数不增；页面已是列时仅定位不重复开列；笔记内链接点击行为与改造前一致。
- **复测修正（同日）**：v1 的「目标已是列→仅聚焦」在已开场景下视觉上与原 bug 无异（用户复测即命中此态）。改为让位语义：目标已开 → 当前活动列关闭、聚焦已有页（不重建不新增）；目标未开 → 关活动列、同位开页。真实点击链路验收 14/14（tools/andy-page-nav-verify.mjs，隔离实例，含 §3.1 条目链接右侧开列回归项），证据 test-runs/andy-page-nav-verify/result.json。

## 2026-10-06（浮层 Esc 与宽度默认值勘误）：refines 当日浮层条
- **拍了**：①浮层打开时按 Esc 关闭最上层可见浮层（新命令 closeActiveNoteByEsc；closeActiveNote 在 fixed 模式关工作区标签、不关浮层，不复用）；②浮层默认 625px 的强制点移到 FloatViewer.show() 合并层（字面量 DialogProps 被 ...rest 覆盖为第三处「展开顺序吃默认值」缺陷；调用方显式 width 可覆盖）；③浮窗右下角 resize 手柄恢复显示（MobileEditBar 全局隐藏规则在浮窗内豁免），支持拖拽调宽、高度仍随内容。
- **验证**：隔离实例 + CDP 真实按键（tools/float-esc-width-verify.mjs，台账 E-010）。
- **过程教训**：dev:live 死亡后基于 .live-update 时间戳误判「已发布」两次；交付判断必须核对构建产物含目标改动。

## 2026-10-06（`!important` 计数勘误）：原「193 处」口径错误，全项目实为 488 处
- **事故**：audit-2026-10-05 第三节表把 `all-styles.css` 的 `!important` 记为 **1** 处。该文件是压缩成一整行的（`wc -l` = 1），当时用「行数」口径（`grep -c`）去数，恒得 1；改用「出现次数」（`grep -o | wc -l`）实为 **160** 处。据此推出的「三文件合计 193 处」和 DESIGN.md §5.3 的「全项目 191 处」都不可靠。
- **实测（2026-10-06）**：三文件口径 workspace-theme 106 + NightMode 92 + all-styles 160 = **358**（审计当日 20:24 commit 0dbd564 时点为 101+92+160 = 353，此后 workspace-theme 因浮窗/蒙层两批改动 +5）；全项目口径（`src/` 递归、排除 `.bak`）= **488**。
- **口径声明（防再错）**：逐文件出现次数 ≠ 全项目递归数，两者不同分母，不可互相加减；正本引用一律写明是哪种口径。
- **改了**：audit 第三节表 `all-styles.css` 1 → 160 并加勘误块、第七节 193 → 353；DESIGN.md §4.5 起因行 193 → 全项目 488、§5.3 全项目 191 → 488。
- **防线**：心跳探针 `number_drift` 已上线（2026-10-06），每轮把正本里的「全项目 N 处」与代码实测比对，偏差超 15% 就上报——本勘误正是它逮出来的第一条。
- **教训**：统计一条数字前先问「口径是什么」——行数还是出现次数、单文件还是全项目、含不含压缩单行与 `.bak`。这条与 10-05 的「10px 计数口径」是同一类错，第二次犯，故这次写进口径声明。

## 2026-10-08（夜间皮肤定案）：强调色回归日间蓝系 + 紫红泄漏修复 + 墨色去绿
- **拍了**（豆爸，会话内对「深色主题皮肤优化」直接授权，方案为本条）：①夜间 `--nk-accent` #9bc4ce → **#69adff**，`--primary`/`--info`/`--node-btn-hover` 同步归一（日间四者同为 #0a84ff = accent；夜间此前 accent 系青绿、链接 #69adff 系蓝，同屏两族，违反 §4 一语义一色）；②`--nk-accent-soft` #2e4148 → `rgba(105,173,255,.16)`（跟 accent 同族的选择底）；③墨色去绿保冷调：`--nk-ink`/`--dark-text` #e3ebed → **#e8ecef**（H192→H206），`--nk-muted`/`--dark-text-less-important`/`--bgrey`/`--nk-backlink-heading` #a4b4b9 系 → **#a9b5bd**；④紫红泄漏修复：`body.night-mode` 内补 `--bg-color`/`--body-bg-color` → `var(--nk-surface)` 别名（NightMode 在 `:root` 注入紫红 #342828，FloatBar/StatusBar/TagsEl 等 7 处组件层在读，夜间选中弹条/状态栏一直泛紫红）；⑤Andy 纸面对齐 D-006 两色制：夜间 `--andy-paper` canvas → `var(--nk-surface)`（与日间 #fff 纸面/#fafafc 画布同构，夜间此前纸面=画布）；⑥侧栏压制规则的裸 hex（#222d32/#e3ebed ×4 条）改 token 引用防漂移。
- **为什么**：实测证据（tools/theme-parity-probe.mjs，test-runs/night-skin-probe/parity.json）——日间 accent/链接/主按钮全蓝（H210），夜间 accent 系青绿（H191-192）而链接仍蓝，双主题强调色换色系且夜间双族并存；文字对比度全线过 AA（墨 12.9+、次级 5.89+），问题在色系统一性而非层级。青绿系 chrome（focus 环/选区/滚动条）双主题一致，属有意设计，不动。
- **否掉**：①抬高画布/侧栏/表面灰阶差距制造层级——日间本就是「近连续纸面 + 细线分隔」（侧栏与画布同色，1px 线分隔），夜间 1.11/1.24 的灰阶差已比日间强，改灰阶反而破坏既有语言；②收编 NightMode.tsx 注入层（删 :root 定义）——属 audit 第七节暗色双源收敛批，挂起中，本批只在定义侧压值，不动文件；③focus 环 #8fb9c4 跟随 accent 变蓝——焦点环归属是 §4.5 待拍板项（日间环 #6c99a5 也非 accent 蓝），不趁批私定。
- **影响面**：仅 `workspace-theme.css` 夜间块 + andy 基规则 + 夜间压制规则；浅色主题零改动。新值对比度：accent/画布 6.70、accent/表面 5.42、墨/画布 13.1、次级/侧栏 6.74，全过 AA。
- **验收**：隔离实例双主题实测（parity 探针夜间 floatbar=表面色、accent=#69adff、andy 纸面=表面色）；热更发布后用户目检。
echo done
## 2026-10-08（夜间皮肤整体重调）：青灰板换中性深炭板，用户拍板「整体颜色、细节都要调」
- **拍了**（豆爸，看过首批修复后明确「整体观感没变化」，给出主题列表页截图，指示整体颜色与细节重调）：夜间中性板从**青灰系整体换到中性深炭系**——画布 #1c2529→**#171a1e**、侧栏/卡片底 #222d32→**#1d2126**、表面 #29353a→**#24282e**、hover #304148→**#2a2f36**；细线整体减淡：线 #3b4a50→**#2c3238**（对画布 1.90→1.35，日间基准 1.07）、强线 #4a5b61→**#3a4149**、表格边 rgba(177,204,211,.2)→rgba(230,232,235,.14)；文字提亮增脆：墨 →**#e6e8eb**（对画布 13.1→14.2）、次级 →**#9ba4ad**（6.9）；遗留层全套同步（--dark-important 三档、--dark-kanban-secondary 首次入正本压值 #1f2429、--bgrey、--common-border、--search-node-bg、--suggest-item-hover-bg、--popup-menu-input-border、滚动条 #333a41/#3d444c）；NightMode 注入的 meta theme-color #202123→#171a1e（标题栏色调跟随）。强调色维持上批的蓝 #69adff 不动；青绿 chrome 家族（焦点环/选区/子节点焦点边）维持与日间的平行不重镀。
- **为什么**：首批只修色系缺陷、灰阶架构未动，用户实测后拍板要整体换观感；旧板的青绿灰在截图里读为「浑浊发闷」，行线过重造成「网格感」。深炭中性板是暗色模式的常规质感解：画布更深更沉浸、层次靠表面提亮而非线框、文字对比反而更大。
- **边界**：仅夜间 token 取值层 + 两条硬编码细节规则（滚动条）+ meta 色；组件结构、日间主题、蓝强调、青绿 chrome 家族全部不动。NightMode.tsx 的 :root 旧值定义仍全部被正本压住，收编照旧挂账。
- **验收**：隔离实例双主题实测（夜间全套新值、日间零变化、正常字号对比度 0 不达标）；前后截图存 test-runs/night-skin-probe/（*-before-replate.png 为旧板）；发布 .live-update 21:25 用户目检。

## 2026-10-08（夜间横线复测修正）：表格行线与搜索下划线入细线系统
- **事故**：重调板发布后用户实测（主题列表页截图）指出「横线太强化」。根因有二：①MUI TableCell 默认分隔线是浅色主题的 `rgba(224,224,224,1)`，夜间从未被覆盖（NightMode 遗留层只改了表格文字色，没改边线）；②NightMode 遗留规则把 `.MuiInput-underline::before` 直接染成 `--dark-text` 近白。
- **拍了**：夜间块补三条压制规则——正文行单元格边线归 `--nk-line`（#2c3238）、表头单元格归 `--nk-line-strong`（#3a4149）、下划线输入框静态态归 `--nk-line-strong`（聚焦态 ::after 仍走 accent 不动）。
- **验证**：隔离实例真实主题态渲染实测（/topics 路由，102 个正文行单元格）：cellBorder=rgb(44,50,56)、headBorder=rgb(58,65,73)、inputBefore=rgb(58,65,73)，全部命中期望值。
- **教训**：NightMode 92 条遗留规则当初只收编了「背景与文字」，边线类漏网；后续若立收编批，需按「背景/文字/边线」三类完整盘点，不能只扫显式写出 border 的规则——MUI 组件默认值本身就是一条隐形来源。

## 2026-10-09（夜间分页栏修复）：TablePagination 墨色与翻页箭头入夜间板
- **事故**：用户截图（主题列表页脚注）指出「每页条数下拉和翻页图标看不到」。根因：MUI v5 TablePagination 继承浅色主题墨色——下拉选中值「25」是近黑（对夜底不可见），翻页 IconButton 更是 `rgba(0,0,0,0.26)` 的禁用态黑；NightMode 遗留层与夜间块此前都只覆盖了表格主体，没覆盖分页栏。可见的「Rows per page:」和「1–7 of 7」是 TopicList 自己用 `--nk-muted` 写过的，恰好说明这不是没人遇到，是只有没被组件样式盖到的部分漏了。
- **拍了**：夜间块补四条——`.MuiTablePagination-root` 归 `--nk-ink`（下拉值/内部原生 select 继承变亮）；toolbar 作用域 IconButton 归 `--nk-muted`、hover 归 `--nk-ink`、`.Mui-disabled` 归 `--nk-line-strong`。标签两条既有 muted 规则不动（组件层直接设色，优先级独立）。
- **验证**：隔离实例 /topics 渲染实测——root/select 色 rgb(230,232,235)、标签 rgb(155,164,173)、四枚按钮（禁用态）rgb(58,65,73)，全中。踩坑一处：首版选择器用 `.MuiTablePagination-actions` 未命中，DOM 转储发现本仓库 MUI v5 的动作按钮容器是普通 MuiBox，改按 toolbar 作用域（与 TopicList 既有脚注样式同法）后命中。
- **教训**：写组件级夜间规则前先在真实 DOM 上确认类名结构（MUI 版本间 actions 容器类名不稳定），不能凭文档记忆写选择器；验证探针从「测选择器」改成「先转储再测」一次过。

## 2026-10-09（夜间图标清扫，举一反三批）：全应用 SVG 对比度清扫归零
- **起因**：用户反馈「还有其他图标有类似问题」，按 fanhua 协议把分页栏修复泛化：新增 `tools/night-icon-sweep.mjs`——隔离实例真实夜间态下遍历 default//topics//diaries 三路由，量每个可见 SVG 的 fill/stroke 对有效背景的 WCAG 对比度，<3 上报。
- **首轮 4 处命中，分诊**：①主题列表搜索框放大镜 `.MuiInputAdornment-root`（纯黑 1.2）→ 归 `--nk-muted`；②笔记头 node-icon（1.38）→ 定位到 emotion 运行时规则 `.css-*-defaults-defaults svg { fill: rgb(51,51,51) }`（日间墨色，不随主题切换，源码 grep 不可见）→ `html body.night-mode .node-icon svg.svg-icon { fill: currentColor }` 恢复跟随（连带恢复 NightMode 的白色 hover）；③④禁用态翻页箭头 1.69 为上批有意禁用色，WCAG 豁免，保留。
- **验证**：修复后复扫三路由真实低对比图标 0 个；产物已热更发布（03:01）。
- **为什么 fill 用 currentColor 而非直接上墨色**：显式 fill 会把 node-icon 内未来可能出现的彩色图标一并压平；currentColor 只恢复「跟随所在上下文颜色」的默认语义，hover 白由 NightMode 既有 color 规则继续供给。
- **泛化规则已入 echo**（2 条）：夜间覆盖齐全性以渲染实测为准；写组件选择器先转储真实 DOM。

## 2026-10-09（双主题图标穷尽排查，用户拍板「找出所有 SVG 排查两种模式」）：清扫矩阵全绿
- **拍了**：①清扫探针升级 v2（tools/night-icon-sweep.mjs）——双主题 × 三路由（default、/topics、/diaries），图标侧量每个可见 SVG（含 hover 前隐形的行动按钮）fill/stroke 对有效背景对比度（<3 上报），线条侧量 border/outline ≥1px 实线对背景对比度（>9 判过亮，>9 阈值依据：日间最重的分隔线约 1.9，夜间细线系统 1.35，>9 必然是日间残留）；②当日页补灌勾选/普通条目覆盖 svg_dot 内容图标；③修复三处——`.previous-diary-wrap` 上边线（--cl-slate-300 日间残留，对夜底 11.76，即用户截图 8 的刺眼白线）归 `--nk-line`；NightMode 分组描边 `.node-layout-item-group-1`（次级灰全亮 6.4）压到 `--nk-line-strong`；`--dark-text-no-important` 首次入正本（紫红半透明 #9e6a6a55 → 中性 muted rgba(155,164,173,.28)）；④svg-icon 的 fill=currentColor 修复从 node-icon 扩大到全类（defaults 包裹规则作用范围不可静态界定，类级修复覆盖全部 Phosphor 图标；currentColor 不压平彩色图标）。
- **图标通道盘点（双模式处理矩阵）**：Phosphor svg-icon（主图标集）= 日间 defaults #333 扁平策略 / 夜间 currentColor 跟随 + NightMode stroke 兜底；MuiSvgIcon = 日间主题板 / 夜间 --dark-text 全局兜底；内联无类 svg（分页箭头、放大镜）= 夜间块逐个已补；svg_dot 内容图标走 svg-icon 通道。
- **验证**：终扫 2×3 矩阵全绿——夜间 0 图标 0 过亮线（/topics 仅剩有意禁用色 1.69，WCAG 豁免），日间 0/0。已热更发布（03:10）。
- **过程教训**：线条检测器首版把「border-width:3px + style:none」的幽灵轮廓全部误报（所有元素都带 3px 幽灵 outline），补 style!=='none' 判据后归零——computed width 不为 0 不代表画了线，检测器必须查完整样式三元组；日间曾出现一次未复现的近白图标命中（#e2e8f0，1.18），两轮诊断均未再现身，疑为滚动位置相关的浮动按钮，清扫工具在库可随时复查。
