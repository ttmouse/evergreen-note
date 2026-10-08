# 「每日动态」UI 模块走查报告（ux-principles 技能 · 逐条原则走查）

- 走查对象：`screenshot.jpg` + `DailyActivity.tsx` + `prefix.css`（只读材料）
- 走查方法：加载 ux-principles 技能，遍历 `principles/` 全部 17 条原则 + 附录「审核工作台补充原则 11 条」+ 业界参考框架（Nielsen / WCAG），逐条对照截图与代码。
- 结论概览：P0×1，P1×4，P2×5，P3×4。移动端专属原则（安全区/overscroll/弹窗全屏等）大多不适用（本模块为 PC 阅读式卡片网格，无 fixed 元素、无弹窗、无输入框），已逐条排除并在文末列出。

---

## P0 必须修

### 1. [问题] React Hooks 条件调用：早退 return 在 useState 之前，违反 Hooks 规则
- [证据] `DailyActivity.tsx:45` — `if (!groups.size) return null` 位于组件体内，而 `React.useState` 在 `DailyActivity.tsx:62-64` 才调用。一旦同一挂载位置的组件从「有分组」变为「无分组」（如日期切换后数据清空、过滤变化），Hook 调用数量在两次渲染间不一致，React 直接抛错 "Rendered fewer hooks than expected"，整个编辑器视图崩溃。外层 `withActivityReading`（215-216 行）虽然过滤了空列表，使该路径多数时候不可达，但组件自身未设防，属于埋雷。
- [建议] 把两个 `useState` 提到所有条件 return 之前（函数组件开头），或用 `useState` 的惰性初始化；最低成本是把 62-64 行移到 30 行 `const groups = new Map(...)` 之前。

## P1 建议改（高）

### 2. [问题] 摘录换行符不生效：多条摘录被压成一团
- [证据] `DailyActivity.tsx:93` — `excerpts.join('\n')` 以 `\n` 拼接多条摘录；但 `prefix.css:58-68` 的 `.backlink-reading-excerpt` 未设 `white-space: pre-line`，`\n` 按 HTML 规则折叠为空格。多条摘录（且每条内部还有 ` — ` 拼接的上下文，见 56 行）被合并成一个段落再被 `-webkit-line-clamp: 4` 截断，用户看到的是无结构的半句截断文本，无法分辨「这是几条动态」。
- [建议] 给 `.backlink-reading-excerpt` 加 `white-space: pre-line;`；或改为每条摘录渲染独立元素（如 `<span className="excerpt-line">`），从结构上保证分行，同时便于将来对单条摘录加省略。

### 3. [问题] 可折叠标题无键盘可达性，也无可点击线索
- [证据] `DailyActivity.tsx:70-73` — `<h2 onClick=...>` 是整个板块折叠/展开的唯一开关，但 h2 不是可聚焦元素：无 `tabIndex`、无 `role="button"`、无 `onKeyDown`（回车/空格不触发），纯键盘用户无法操作折叠。同时 `prefix.css:9-15` 未给 h2 设 `cursor: pointer` 和 hover 反馈，鼠标用户也看不出标题可点（对照工作台补充原则 4「状态用文字直接表达」与 Nielsen「系统状态可见性」）。
- [建议] 把标题行改为 `<button type="button" aria-expanded={sectionOpen} aria-controls="面板 id">` 包裹（按钮内放 caret + 标题 + 计数），或保留 h2 语义、内部嵌 button；CSS 补 `cursor:pointer` 与 `:hover/:focus-visible` 样式。

### 4. [问题] 卡片与「展开/收起」按钮零交互反馈：无 hover / active / focus-visible 样式
- [证据] `prefix.css:46` 定义了 `transition: background-color 100ms linear`，但全片段没有任何 `:hover`、`:active`、`:focus-visible` 规则去改变 `background`——过渡没有目标态，等于装饰。整卡是 `<button>`（tsx:83-94），点击后跳转来源主题是强操作，却没有可感知的悬停/按下反馈（Nielsen #1 系统状态可见性；工作台补充原则 2「选中态=热区」的反馈面同理）。
- [建议] 补 `.backlink-reading-entry:hover { background: var(--nk-hover-bg, rgba(0,0,0,.04)); }`、`:active` 加深一档、`:focus-visible` 用 `outline: 2px solid ...`；toggle 按钮同样补齐。

### 5. [问题] 触控目标远小于 44×44pt（touch-target-44pt）
- [证据] `prefix.css:69-78` — `.backlink-reading-toggle` 为 `padding: 4px 8px; font-size: 12px; line-height` 未设，实际高度约 22-24px；`prefix.css:13` 标题行 `line-height: 20px`，折叠开关点击带高度也只有 20px。均在移动端/触屏下远低于 44×44pt 最小触控标准（Apple HIG / Material）。
- [建议] 触屏场景（`@media (hover:none) and (pointer:coarse)`）下给 toggle 与标题开关补 `min-height: 44px`（或加大 padding 撑热区，视觉不变、热区扩大）。

## P2 建议改（中）

### 6. [问题] 网格行间距为 0 + 负 margin 挤进容器内边距（grid-and-flex-stack / 工作台 density 纪律）
- [证据] `prefix.css:22-27` — `.backlink-reading-grid { gap: 0 16px; margin: 0 -8px; }`：行间距（row-gap）为 0，垂直间隔完全依赖卡片的 `margin-top: 8px`（38 行）；负 margin 把网格两侧各拉进容器 16px 内边距 8px，卡片文字距板块边框仅剩卡片自身 `padding: 8px`。hover 背景块之间垂直仅 8px、水平紧贴容器边，视觉分组弱、误触率高；这也是本仓 DESIGN.md 明令禁止的「相邻容器 0 间距」同款问题。
- [建议] `gap: 8px 16px`（或 12px 16px），去掉负 margin，让卡片 hover 背景与容器边缘保留 ≥8px 呼吸空间。

### 7. [问题] 折叠箭头 `data-open` 无对应旋转样式，状态不随开合变化
- [证据] `DailyActivity.tsx:74-76` — caret 输出 `data-open={String(sectionOpen)}`，但 `prefix.css` 全片段没有 `[data-open]` 相关规则，`▸` 永远指向右。截图也证实两个板块都收起时箭头仍为静态右指（`screenshot.jpg`：「当天创建 219」「当天更新 539」行首）。开合状态只靠箭头这一个视觉信号传达，而它不变（Nielsen #1；工作台补充原则 4）。
- [建议] 若旋转样式在别处已有则忽略；否则补 `.backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }` + `transition: transform 100ms`。

### 8. [问题] 日期/数据切换时折叠状态不重置
- [证据] `DailyActivity.tsx:62-64` — `expanded` / `sectionOpen` 是组件内部 state，组件按位置复用；用户在某天点了「展开全部」（539 条全量渲染）后切到另一天，`expanded` 仍为 true，新的一天直接全量渲染，性能与认知负担都被上一天的操作劫持。
- [建议] 用 `key`（如当前日期）强制重挂载，或在 `items`/日期变化时用 `useEffect` 重置；至少对「展开全部」加条数上限保护。

### 9. [问题] `Math.max(...arr)` 展开大数组 + 计算结果从未使用（性能/健壮性）
- [证据] `DailyActivity.tsx:58` — `last: Math.max(...sorted.map(pickTime))`：`当天更新 539` 条时展开 539 个参数，接近引擎参数上限风险（V8 上限约 6.5 万，当前安全但纯属浪费）；且 `last` 在渲染中从未被读取（全文无引用），每次渲染白算。
- [建议] 删除 `last`；若将来要用，改为 `sorted.length ? pickTime(sorted[0]) : 0`（sorted 已按时间降序）。

### 10. [问题] 计数徽标语义不明：`groups.size` 是「分组数」还是「动态条数」用户无法分辨
- [证据] `DailyActivity.tsx:77` — `{title} <span>{groups.size}</span>`，裸数字无单位、无 `aria-label`。截图里「当天创建 219」「当天更新 539」：539 是分组数（来源主题数）还是条数？二者相差可能很大（groups 是按来源主题分组的，条数是 citations 总和），用户核对预期时会产生误判（Nielsen #2 与现实匹配）。
- [建议] 显示为「N 个主题」或「N 条」，并给徽标加 `aria-label`；屏读用户目前听到的只是裸数字。

## P3 可优化（低）

### 11. [问题] 移动端 tap 高亮未消除（tap-highlight）
- [证据] `prefix.css` 全片段无 `-webkit-tap-highlight-color: transparent`，触屏点击整卡按钮会出现 iOS/Android 默认灰色闪块，与自定义 hover 反馈叠加显得脏。
- [建议] 触屏媒体查询下对 `.backlink-reading-entry, .backlink-reading-toggle` 设 `-webkit-tap-highlight-color: transparent;`，反馈交给 `:active` 背景。

### 12. [问题] 空状态直接 return null，无占位引导（state-full-container 变体）
- [证据] `DailyActivity.tsx:45` 与 216 行 — 无内容时组件整体消失。对「当天动态」场景可接受（无动态≠异常），但当某天创建为 0、更新很多时，两个板块一隐一现，页面高度跳变；且用户无法区分「没动态」和「模块被关掉了」。
- [建议] 保持 null 即可，但可考虑给 daily 页级容器一个统一的「今日暂无动态」空态文案，避免静默空白。

### 13. [问题] 12px 灰色小字对比度未兜底
- [证据] `prefix.css:66,75` — 摘录与 toggle 均为 12px + `var(--nk-muted)`（fallback `#666`）。若主题变量在深色模式下解析为更浅的灰，12px 小字对比度可能低于 WCAG AA 的 4.5:1。
- [建议] 为 `--nk-muted` 在深浅两套主题下各核对一次对比度；12px 文本建议不低于 4.5:1。

### 14. [问题] 分组逻辑对「既是主题又有 topic 字段」的条目自分组，可能与卡片点击目标不一致
- [证据] `DailyActivity.tsx:36-39` — `citation.isTopic || citation.topic ? citation : 父主题`，卡片标题渲染 `source.topic || plainText(source)`（91 行），点击路由 `source.topic || plainText(source)`（87 行）。当 source 是条目自身（isTopic）但 `topic` 为空时，标题退化为 `plainText(source)` 整段摘录文字充当标题、并把它当路由关键词，长摘录做标题会撑爆 2 行截断且路由可能失配。
- [建议] 对 `!source.topic` 的分组考虑跳过或回退到父主题链，避免「整段文字当标题」。

---

## 已逐条检查、不适用的原则（附排除理由）

| 原则 | 结论 |
|---|---|
| content-no-overlap | 无 position:fixed/absolute 元素，无硬编码 padding-bottom 让路，通过 |
| panel-hidden-by-default | 无侧滑面板，通过 |
| sticky-header-topmost | 无固定头部（h2 为普通流），不适用 |
| input-focus-keyboard-avoid | 无输入框，不适用 |
| modal-fullscreen | 无弹窗，不适用 |
| safe-area-adaptation | 桌面阅读视图，无固定底栏/全屏层，不适用（若日后进移动端需补） |
| overscroll-behavior | 本片段无独立滚动容器，不适用 |
| hover-not-control-visibility | 片段内 :hover 不控制可见性（目前连 hover 都没有，见问题 4），通过 |
| pc-api-mobile-equivalent | 无 drag/drop 等 PC 专属 API，通过 |
| tooltip-tap-trigger | 无 tooltip/mouseenter 浮层，通过 |
| self-contained-interface-layer | 非独立全屏层，不适用 |
| sidebar-fixed-content-scroll | 走查范围仅模块片段，双栏骨架不在材料内，无法判定 |
| mobile-first-css | 该原则针对独立 HTML 页内联样式，本模块为应用内组件样式，部分适用（grid 的 minmax(220px,1fr) 在极窄容器下仍能降为单列，行为可接受） |
| grid-and-flex-stack | 多列网格会自然降列（auto-fill），通过；行距问题归入问题 6 |
| state-full-container | 见问题 12 |
| touch-target-44pt | 见问题 5 |
| tap-highlight | 见问题 11 |

补充原则（工作台 11 条）中适用并已核对的：4（状态文字化→问题 7、10）、7（内容左对齐/操作右对齐：卡片布局符合）、8（密度：标题+摘录同行堆叠符合）、2（选中态=热区：hover 反馈缺失归问题 4）；1、3、5、6、9、10、11 不适用于本片段。

## 严重度汇总

- **P0（1 条）**：#1 Hooks 条件调用
- **P1（4 条）**：#2 摘录换行失效、#3 折叠开关键盘不可达、#4 零交互反馈、#5 触控目标过小
- **P2（5 条）**：#6 网格 0 行距+负 margin、#7 箭头状态不变、#8 折叠态跨日期残留、#9 无用大数组展开、#10 计数语义不明
- **P3（4 条）**：#11 tap 高亮、#12 空态静默、#13 小字对比度、#14 无 topic 分组的标题退化
