# Design Review: 每日动态（DailyActivity）UI 模块

**日期**: 2026-10-08
**对象**: `temp/skill-eval-design/temp/fixtures/` 下 screenshot.jpg + DailyActivity.tsx + prefix.css（走查材料，只读）
**方法**: jezweb design-review 技能（布局/排版/颜色/层级/组件一致性/交互/响应式 七维走查），无浏览器环境，以截图 + 源码静态核对代替。

## Overall Impression

整体是克制的阅读式卡片网格，token 化配色和 line-clamp 摘录做得不错；但存在一个会崩溃的 React Hooks 违规、板块之间零间距贴合、折叠控件无任何状态指示与键盘可达性——「看起来像开发者顺手做的」成分集中在折叠/展开这一条交互链上。

## Findings（按严重度排序）

### 高（High）

**1. [问题] React Hooks 在条件提前返回之后调用，组件会在「空 ↔ 非空」切换时崩溃**
- [证据] `DailyActivity.tsx:45` `if (!groups.size) return null` 早于 `DailyActivity.tsx:62-64` 的两个 `React.useState`。首次渲染条目为空返回 null、出现条目后重渲染时 Hook 数量从 0 变 2，触发「Rendered fewer hooks than expected」并卸载整棵子树。截图里两个板块（219/539 条）正是依赖这个开关路径的组件。
- [建议] 把两个 `useState` 移到函数最顶部（任何 return 之前），或拆成先算数据再早退的小函数 + 外层组件持有状态。

**2. [问题] 两个板块卡片上下贴合、零间距，边框线叠在一起**
- [证据] 截图中「当天创建 219」与「当天更新 539」两张卡片边框直接相接，视觉上融为一个双格块。代码侧：`.backlink-reading`（prefix.css:2-8）之间没有任何 margin/间距规则；板块由 `addMoreComponent` 顺序堆叠，模块级 margin 缺失。这属于技能「Grouping / Consistent spacing」的反例——不相关的两个板块视觉上被强制成一组。
- [建议] 给 `.backlink-reading` 加 `margin-top: 24px`（首个板块用 `:first-of-type` 归零），或在宿主容器统一板块间档位，与项目 DESIGN.md §5.2 的间距档位对齐。

**3. [问题] 板块折叠无状态指示、无键盘可达性：caret 永远是「▸」，标题行不可聚焦**
- [证据] JSX 用 `data-open={String(sectionOpen)}`（DailyActivity.tsx:74-76）标记展开态，但 prefix.css 里没有任何 `.backlink-reading-caret` 或 `[data-open]` 规则——三角永远不会旋转，收起与展开长得一模一样（截图两个板块均为「▸」却无法分辨谁开谁关）。同时 `<h2 onClick>`（:70-73）没有 `tabIndex`、`role="button"`、`aria-expanded`，键盘用户完全无法折叠板块，屏幕阅读器也读不到状态。
- [建议] CSS 补 `.backlink-reading-caret { display:inline-block; transition: transform 150ms ease; } [data-open="true"] { transform: rotate(90deg); }`；h2 改为内含 `<button aria-expanded={sectionOpen}>` 或给 h2 加 `tabIndex={0}` + `onKeyDown` 处理 Enter/Space，caret 加 `aria-hidden`。

### 中（Medium）

**4. [问题] 网格负外边距使卡片左边缘与标题左边缘错位 8px**
- [证据] `.backlink-reading-grid { margin: 0 -8px }`（prefix.css:26）把网格左右各外扩 8px，卡片内容起点在容器 padding 16px - 8px = 8px 处，而 h2 标题在 16px 处——同一板块内标题与卡片左边缘不齐（技能「Alignment」反例）。负 margin 的意图应是抵消卡片自身的 8px padding 让文字对齐标题，但它作用在盒子边缘而非文字上，只对齐了卡片边框以外的空白。
- [建议] 若目的是文字视觉对齐，去掉负 margin，改为让卡片 `padding: 8px` 保持、接受 8px 文字缩进；或把负 margin 与卡片 padding 都改为同值并实测对齐。任选其一，但标题与卡片文字必须有同一条左基线。

**5. [问题] 网格行距 8px 与列距 16px 不一致，且行距完全依赖卡片自身的 margin-top**
- [证据] `.backlink-reading-grid { gap: 0 16px }`（prefix.css:25）行 gap 为 0，垂直节奏全靠 `.backlink-reading-entry { margin-top: 8px }`（:37）。结果是：列间 16px、行间 8px + 卡片自身 padding 8px×2，实际视觉行距被卡片内部空白稀释，紧密程度与列方向不对称；网格语义也被破坏（间距该由 gap 表达）。
- [建议] 改为 `gap: 8px 16px`（或统一 12px），删除 entry 的 `margin-top`。

**6. [问题] 卡片没有 hover 反馈，可点击性不可感知**
- [证据] `.backlink-reading-entry` 定义了 `transition: background-color 100ms linear`（prefix.css:46）和 `cursor: pointer`，但整个 CSS 片段没有任何 `:hover` / `:focus-visible` 规则——transition 过渡的是永远不变的背景色。整张卡片是 `<button>`，却只有鼠标指针变化这一个可点击线索（技能「Hover states / Focus states」双反例）。
- [建议] 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,.04)) }` 和 `:focus-visible { outline: 2px solid var(--nk-accent); outline-offset: 2px }`；`.backlink-reading-toggle` 同样缺 hover/focus，一并补。

**7. [问题] 多条摘录用 `\n` 拼接但 CSS 未开启 `white-space: pre-line`，换行全部丢失**
- [证据] `DailyActivity.tsx:93` `excerpts.join('\n')` 把一天内多条动态塞进同一个 `<span>`，而 `.backlink-reading-excerpt`（prefix.css:58-68）是普通 `-webkit-box` 截断容器，`white-space` 默认 normal——换行符被折叠成空格，4 行摘录实际是 4 行连成一气的长文再被硬截断，信息边界消失。
- [建议] CSS 加 `white-space: pre-line;`；或 JSX 改为 `excerpts.slice(0,4).map(...)` 渲染独立 `<span className="...-excerpt-line">`（每条各自 clamp 一行），语义更干净。

**8. [问题] 标题计数语义含混：219/539 既是「分组卡片数」又像「动态条数」，与「默认只显示 12 张」叠加造成认知落差**
- [证据] h2 里的数字是 `groups.size`（分组后的来源主题数，DailyActivity.tsx:77），而「展开全部」按钮的 N 是 `entries.length - 12`。用户看到「当天创建 219」点开，预期看到 219 条当天创建的笔记，实际得到 219 张按主题聚合的卡片且首屏只有 12 张；卡片内的摘录又是「上下文 — 摘录」拼接的多条内容。三个数量（原始条目数、分组数、可见卡片数）在 UI 上互相矛盾。
- [建议] 计数旁注明单位（如「219 个主题」），或改为显示原始条目数；「展开全部」按钮已带 count 是对的，保持与标题单位一致。

**9. [问题] 「展开全部」一次渲染全部条目，500+ 卡片无虚拟化也无分页**
- [证据] `expanded` 后 `visible = entries`（DailyActivity.tsx:65）全量渲染；截图板块计数 219/539，展开当天更新即一次性挂载 539 张卡片 × 若干 DOM 节点，含每条的 `plainText(parent)` 计算（:51-55），滚动和交互会明显掉帧。
- [建议] 展开改为「加载更多」增量追加（每次 +24），或对超出首屏的部分做虚拟列表。

### 低（Low）

**10. [问题] 折叠按钮 hover 过渡 100ms，低于 150–200ms 的常规手感区间**
- [证据] prefix.css:46 `transition: background-color 100ms linear`。
- [建议] 统一为 `150ms ease`。

**11. [问题] toggle 按钮颜色兜底值硬编码 `#666`，绕过 token 体系**
- [证据] prefix.css:75 `color: var(--nk-muted, #666)`。同文件其余处兜底用的是语义 token（如 `var(--nk-backlink-bg, var(--nk-canvas))`）。若 `--nk-muted` 在暗色主题下定义缺失，#666 在深底上对比不足。
- [建议] 兜底改成 `var(--nk-ink-dim, #888)` 一类的语义层，或确认 `--nk-muted` 全主题必有后删掉兜底。

**12. [问题] 字号层级梯度过弱：板块标题 14px / 卡片标题 13px / 摘录 12px，每级只差 1px**
- [证据] prefix.css:12、:54、:66。squint test 下三层文字几乎同一视觉重量，板块标题仅靠 600 字重撑住。
- [建议] 保持克制的前提下把板块标题提到 15–16px（或卡片标题降为 13px 但摘录用更弱的颜色/行高拉开），让三层在眯眼测试下可分辨。

**13. [问题] 卡片按钮无 `title`/`aria-label`，标题与摘录被 line-clamp 截断后全文不可获知**
- [证据] `-webkit-line-clamp: 2/4`（prefix.css:52、:62）会静默裁切；`<button>`（DailyActivity.tsx:83-94）未把完整标题放进 `title` 属性或 `aria-label`，鼠标悬停与读屏用户都拿不到全文。
- [建议] 按钮 `title={source.topic || plainText(source)}`，读屏再加 `aria-label` 同值。

**14. [问题] caret 字符「▸」是纯文本装饰，未对读屏隐藏**
- [证据] DailyActivity.tsx:74-76，与第 3 条同源；读屏会把它读成多余字符。
- [建议] `aria-hidden`（随第 3 条改造一并处理）。

## What Looks Good

- 卡片用语义 token（`--nk-backlink-*`、`--nk-ink`、`--nk-muted`）而非裸色值，暗色主题可随 token 切换。
- `-webkit-line-clamp` 让长标题/摘录优雅截断，网格 `repeat(auto-fill, minmax(220px, 1fr))` 响应式合理。
- 无内容返回 null 不渲染空板块；卡片本体是 `<button>`，点击目标语义正确。
- 板块级折叠 + 量大默认折叠（COLLAPSED_COUNT）的产品方向是对的——问题只在指示与可达性，不在方案。

## Top 3 Fixes

1. 修 Hooks 条件调用（发现 1）——这是功能性崩溃，不是观感问题。
2. 板块间补 24px 间距 + caret 旋转指示 + h2 键盘化（发现 2、3）——一组改动同时解决「贴合」与「折叠不可感知/不可达」。
3. 网格 `gap: 8px 16px` 去掉负 margin 与卡片 margin-top，补卡片 hover/focus（发现 4、5、6）——对齐与可点击性一次到位。
