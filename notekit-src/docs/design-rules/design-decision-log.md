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

