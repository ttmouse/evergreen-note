# 「每日动态」UI 模块走查报告

- 走查方式：echo-ux 技能（`ec rules match` 召回 → 截图/代码/样式三方对照分析 → 结构化输出 → 收工关单）
- 材料：`screenshot.jpg`、`DailyActivity.tsx`、`prefix.css`（均为只读）
- 严重度定义：P0 = 功能损坏或崩溃；P1 = 用户可感知的交互/可达性缺陷；P2 = 体验与视觉一致性；P3 = 健壮性与性能隐患

---

## P0-1 Hooks 条件调用，卡片数量跨越 0↔非 0 时整棵树崩溃

[问题] `ActivityReadingComp` 在 `useState` 之前有提前 `return null`（第 45 行 `if (!groups.size) return null`），Hooks 调用次数随数据变化，违反 React Hooks 规则。
[证据] DailyActivity.tsx:45-64：`if (!groups.size) return null` 位于 `React.useState(false)`（第 62、64 行）之前。当某天从「无动态」变为「有动态」（或反向）引发组件重渲染时，React 抛出 "Rendered fewer hooks than expected" 类错误，整个编辑器视图白屏。这条与内存中已沉淀的教训一致（echo-ux 盲测里 Hooks 条件调用是能被代码审查抓到的真 bug）。
[建议] 把两个 `useState` 提到 `groups` 计算之前、任何 return 之前；或把空态判断移入父组件 `withActivityReading`（它已经做了 `isEmpty(items)` 判断，可直接把 `groups.size` 判断也收进渲染前的数据层），保证组件体 Hooks 顺序恒定。

## P0-2 折叠箭头不随状态旋转，开/合状态无视觉信号（且是「点了没反应」同族缺陷）

[问题] 折叠指示符永远渲染字面字符 `▸`，代码里只设置了 `data-open` 属性，prefix.css 没有任何针对 `.backlink-reading-caret` 或 `[data-open]` 的规则，展开状态（应为 ▾）完全不体现。
[证据] DailyActivity.tsx:74-76 渲染 `<span className="backlink-reading-caret" data-open={String(sectionOpen)}>▸</span>`；prefix.css 全文 79 行无 `.backlink-reading-caret` 选择器。截图里两个板块均为收起态、箭头朝右恰好「碰巧正确」，但展开后箭头依旧朝右，用户点开后得不到任何状态反馈——这正是本项目 2026-10-08 复盘过的「引用面板折叠箭头失效」同族问题（当时根因是 overlay 吞点击，本次是状态样式缺失）。
[建议] 在 CSS 补 `.backlink-reading-caret { display:inline-block; transition: transform 100ms; } .backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }`；或直接换图标库的 chevron 图标按状态切换方向。

## P0-3 板块点击区域横向溢出，右侧卡片被裁切

[问题] 截图可见板块卡片延伸到视口右缘之外，右侧边界与内容被裁掉，板块没有完整落在可视区域内。
[证据] screenshot.jpg：「当天创建 219」「当天更新 539」两张卡片右边框均超出图像右缘、圆角不可见。样式上 `.backlink-reading-grid` 用 `margin: 0 -8px`（prefix.css:26）做负外边距扩展，而 `.backlink-reading` 自身 padding 为 16px——当宿主容器（daily 页）本身已有内边距或板块被挂到别的容器时，负 margin 会造成水平溢出。这正是 UX.LAYOUT.003 的检查项：「板块被单独挂到新容器时是否仍保有间距/是否溢出」。
[建议] 去掉 `margin: 0 -8px` 的负外边距技巧，让网格宽度自然等于容器内容宽；若需要卡片贴边视觉，用 `padding-inline` 与 `gap` 组合而非负 margin。

## P1-1 折叠标题不可键盘操作、无 ARIA 状态，键盘与读屏用户无法折叠板块

[问题] `<h2 onClick>` 是唯一折叠入口：不可聚焦、不响应 Enter/Space、无 `role="button"`、无 `aria-expanded`、无 `cursor:pointer`。
[证据] DailyActivity.tsx:70-78；prefix.css:9-15 的 `h2` 规则没有 cursor/hover/focus 样式。鼠标用户能点，键盘用户完全无法操作板块折叠。
[建议] 给 `h2` 加 `role="button" tabIndex={0} aria-expanded={sectionOpen}` 并 `onKeyDown` 处理 Enter/Space；更简做法是把标题行整体换成 `<button className="backlink-reading-head" aria-expanded={...}>`，再在 CSS 里重置按钮默认样式。

## P1-2 卡片按钮无 hover/focus 反馈，transition 指向不存在的状态

[问题] `.backlink-reading-entry` 声明了 `transition: background-color 100ms linear`，但样式表里没有任何 `:hover`/`:focus-visible` 规则改变背景色——过渡动画没有目标态，悬停和键盘聚焦均无任何视觉反馈。
[证据] prefix.css:28-47（transition 声明）与全文缺失的 `:hover`/`:focus-visible` 规则对照；操作反馈是 echo-ux 流程的必查维度。
[建议] 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,0.04)); }` 和 `.backlink-reading-entry:focus-visible { outline: 2px solid var(--nk-accent); outline-offset: -2px; }`；`.backlink-reading-toggle`（prefix.css:69-79）同样补 hover/focus。

## P1-2b 「当天创建/更新」分类不互斥，同一笔记重复计入两榜

[问题] 当天创建的笔记同时带有当天的 `updated` 时间戳，会同时出现在「当天创建」和「当天更新」两个板块里，计数（截图 219/539）含重复，用户对不上账。
[证据] DailyActivity.tsx:176-193：`created` 与 `updated` 两个索引各自独立按日期收项，无互斥处理。UX.DATA.001 要求「分类之间互斥、无重叠」。
[建议] 明确产品语义后二选一：更新板块过滤掉「今天创建」的项（`updated` 板块只展示老笔记的改动），或在 UI 上标注口径（如「更新含今日新建」）。

## P2-1 「展开全部」一次性渲染最多 539 张卡片，无渐进加载

[问题] `expanded` 为布尔值，点击「展开全部 N」后把全部 entries（截图显示当天更新 539 组）一次性全部渲染，无分页/虚拟化；`entries` 每次渲染都重新分组、排序、拼接摘录，无 memo。
[证据] DailyActivity.tsx:65（`entries.slice`）、97-105（expand 按钮）、48-59（每次渲染全量重算）；UX.LOADING.001 要求渐进呈现而非一次性整块刷新。
[建议] `useMemo` 包住分组/排序计算；「展开全部」改为「加载更多」按批（如每次 48 张）追加，或对网格做虚拟化。

## P2-2 折叠箭头用文本字符 `▸` 充当图标

[问题] 状态指示用的是 Unicode 字符而非图标库图标，跨平台字形不一致，也违反本仓「使用开源图标库而非 emoji/装饰字符」的约束。
[证据] DailyActivity.tsx:75；UX.VISUAL.004 / WORKFLOW.DOCS.003。
[建议] 换项目图标库的 chevron-right/chevron-down，随 `sectionOpen` 切换。

## P2-3 折叠/展开引发下方内容整体跳动，切换不丝滑

[问题] `sectionOpen` 切换采用条件卸载（`{sectionOpen && ...}`），板块高度从「标题行」到「标题+网格+按钮」瞬变，页面下方内容瞬间位移；展开全部时同样整块插入推走邻居。状态前后视线落点不保持。
[证据] DailyActivity.tsx:79-116；UX.SMOOTH.001「状态变了，视线落点不变」「内容更新是原地变化，还是插入新行把邻居推走」。
[建议] 折叠用 grid-template-rows / max-height 过渡而不是卸载；展开批加载保持「加载更多」按钮位置稳定，新增行出现在按钮上方、按钮不下跳。

## P2-4 计数徽标语义不明

[问题] 标题旁的数字（截图 219/539）没有单位与语义，用户无法区分是「219 张卡片」「219 条动态」还是「219 个主题」——实际它是分组后的来源主题数（`groups.size`），与列表实际条目数不一致。
[证据] DailyActivity.tsx:77（`{groups.size}`）；截图数字巨大但折叠后仅显示 12 张卡，感知对不上。
[建议] 给计数补语义（如「219 个主题」），或同时展示「主题数 / 动态条数」。

## P3-1 大数组上用 `Math.max(...spread)`，有栈溢出风险

[问题] 第 58 行 `Math.max(...sorted.map(pickTime))` 在条目极多时可能超出参数个数上限（约 65k），且该行在每次渲染都执行。
[证据] DailyActivity.tsx:58。
[建议] 改 `sorted[0]`（已按 pickTime 降序排序，首元素即最大值），顺带省一次 map。

## P3-2 `getCreatedItems` 对每条记录做递归 `getItem`，O(n) 深拷贝放大

[问题] 第 135-137 行对当天每个创建项调 `$.dbMemory.getItem(item.ky, { isRecur: true })`，`withActivityReading` 里又 `filter(notEmpty)` 后全量进入组件，量大时拖慢首帧。
[证据] DailyActivity.tsx:132-139、214-216；UX.LOADING.001 首屏耗时视角。
[建议] 摘录渲染只需要节点的文本，可延迟到卡片可见时再取（懒加载/分批），避免为 539 组全量递归取子树。

## P3-3 折叠状态与展开状态不持久化

[问题] `sectionOpen`、`expanded` 都是组件内存态，切换日期或重挂载后复位；对「每天默认全折叠」这类偏好无法记忆。
[证据] DailyActivity.tsx:62-64。
[建议] 如产品需要，把板块折叠态持久化到 addon config 或 localStorage；至少在走查后由用户拍板默认值。

## P3-4 空动态日无占位（依赖父级兜底）

[问题] 板块无内容时返回 `null`（DailyActivity.tsx:45、216），页面上两个板块直接消失，用户无法区分「今天没有动态」和「模块坏了」。
[证据] DailyActivity.tsx:45、205-216 注释「无内容时返回 null（不渲染空卡片）」；UX.DATA.001 是否遗漏关键状态（空态）。
[建议] 空态显示一行灰字「今天暂无创建/更新」比整块消失更可解释；若刻意保持消失，应在项目 UI 规范中登记该决定。

---

## 规则召回与应用记录

- 召回 16 条，实际影响判断：UX.LAYOUT.003（P0-3 溢出/间距归属）、UX.DATA.001（P1-2b 分类不互斥、P3-4 空态）、UX.SMOOTH.001（P2-3 跳动）、UX.LOADING.001（P2-1 渐进、P3-2 首帧）、UX.VISUAL.004 / WORKFLOW.DOCS.003（P2-2 图标字符）。
- 召回未采用：UX.DECISION.005（本模块无选项面板/弹窗）、UX.SEARCH.001 与 PRD.SEARCH.001（无搜索结果列表场景）、UX.CONTEXT.001（未涉及历史快照展示）、UX.DECISION.001（无复杂选择）、UX.VISUAL.001/005/006（未发现装饰性动画/擅自添加元素/强调色滥用，反而 CSS 全走变量，符合规则）、ENG.EXTEND.001、ENG.PEER.001、PRD.BOUNDARY.001、UX.SEARCH.001（同前）。
