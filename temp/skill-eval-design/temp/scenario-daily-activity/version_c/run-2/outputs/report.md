# 「每日动态」UI 模块走查报告（ux-principles 全流程）

- 走查对象：`screenshot.jpg` + `DailyActivity.tsx` + `prefix.css`
- 走查方式：ux-principles 技能 16 条原则 + 工作台补充 10 条 + Nielsen/WCAG 附录逐条对照
- 日期：2026-10-08
- 严重度定义：**P0 必须修**（崩溃/功能失效）｜**P1 建议改**（明显体验缺陷）｜**P2 可优化**

---

## P0 必须修

### 1. React Hooks 在条件 return 之后调用（违反 Rules of Hooks）
**[问题]** `ActivityReadingComp` 在 line 45 `if (!groups.size) return null` 早退之后才调用两个 `React.useState`（line 62、64）。当同一位挂载点上的组件在「空 → 非空」间切换（例如切换日期、当天数据异步到位）时，Hook 调用次数在两次渲染间不一致，React 会直接抛错 "Rendered fewer hooks than expected"，整个编辑器视图崩溃。
**[证据]** `DailyActivity.tsx:45`（早退）先于 `DailyActivity.tsx:62-64`（`useState` × 2）；`withActivityReading` 里 line 216 还有第二个早退 `if (isEmpty(items)) return null`，同样发生在子组件挂载判定之前，会放大挂载/卸载抖动。
**[建议]** 把两个 `useState` 提到所有早退之前（函数顶部），或在早退前保证 Hook 顺序恒定；`withActivityReading` 的空判定保留即可（它在子组件外，不影响 Hook 链）。

### 2. 摘录换行符不生效，多段摘录挤成一行
**[问题]** 卡片摘录用 `excerpts.join('\n')` 拼接多段摘录，但 `.backlink-reading-excerpt` 未设 `white-space: pre-line`，HTML 渲染时 `\n` 被折叠为空格。多条摘录连成一长串，`-webkit-line-clamp: 4` 名义上"四行摘录"实际可能只显示一条主题的前四行，其余摘录信息完全丢失且无任何提示。
**[证据]** `DailyActivity.tsx:93` `excerpts.join('\n')`；`prefix.css:58-68` 的 `.backlink-reading-excerpt` 无 `white-space` 声明。
**[建议]** 给 `.backlink-reading-excerpt` 加 `white-space: pre-line`；或将摘录改为 `<span>` 列表逐条渲染，展示条数上限独立于行数上限。

### 3. 折叠箭头无旋转样式，展开/收起无视觉反馈
**[问题]** caret 的开合状态只写进了 `data-open` 属性，但 `prefix.css` 里根本没有 `.backlink-reading-caret` 任何规则——属性无人消费，`▸` 永远朝右。截图里板块默认展开（能看到 219/539 的计数与卡片区域），箭头却仍指右（收起语义），用户无法从箭头判断当前是开是合，点标题后界面也无变化反馈。
**[证据]** `DailyActivity.tsx:74-76` `<span className="backlink-reading-caret" data-open={...}>▸</span>`；`prefix.css` 全文无 `caret` 选择器；截图两板块箭头均为右向。
**[建议]** 补 CSS：`.backlink-reading-caret { display:inline-block; transition: transform 120ms; } .backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }`。

---

## P1 建议改

### 4. 板块标题不可键盘操作、无 ARIA 状态
**[问题]** 收起/展开整个模块的交互绑在 `<h2 onClick>` 上：不是按钮、无 `tabindex`、无 `role`，键盘用户（Tab + Enter/Space）完全无法折叠板块；屏幕阅读器也读不到当前开合状态。WCAG「可操作」原则直接违反。
**[证据]** `DailyActivity.tsx:70-78`：`<h2 className="backlink-reading-head" onClick={...}>`，无 `aria-expanded`、无 `aria-controls`。
**[建议]** 在 h2 内放一个真正的 `<button aria-expanded={sectionOpen} aria-controls={面板id}>` 包住箭头+标题，或给 h2 加 `role="button"` + `tabIndex={0}` + onKeyDown 处理 Enter/Space（前者更标准）。

### 5. 点击/悬停目标过小，触控热区不足 44pt
**[问题]** 标题行高仅 20px（`h2` line-height: 20px、无额外 padding），"当天创建/当天更新"整行可点但实际热区高度约 20-24px；「展开全部/收起」按钮 padding 仅 `4px 8px`，高度约 24px。移动端原则 `touch-target-44pt`（≥44×44pt）双违反。
**[证据]** `prefix.css:9-15`（h2 行高 20px 无 padding）、`prefix.css:69-79`（toggle 按钮 padding: 4px 8px）。
**[建议]** 标题行加 `padding: 12px 0`（或用负 margin 补偿保持视觉）；toggle 按钮 `padding` 提到 `8px 12px` 并保证 `min-height: 44px`（桌面可放宽到 32px，但当前 24px 偏小）。

### 6. 卡片无 hover / focus-visible 反馈，transition 是死代码
**[问题]** `.backlink-reading-entry` 定义了 `transition: background-color 100ms`，但样式表没有任何 `:hover`、`:active`、`:focus-visible` 规则改变背景——鼠标悬停和键盘聚焦时卡片毫无反馈，用户无法确认"这个可以点、焦点在哪"。整套卡片实际是 `<button>`，浏览器默认 focus 轮廓也可能因样式重置背景被弱化。
**[证据]** `prefix.css:28-47`：`transition: background-color 100ms linear;` 存在，全文无 `.backlink-reading-entry:hover` / `:focus-visible`。
**[建议]** 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,.04)); }` 与同值的 `:focus-visible`（外加 `outline: 2px solid var(--nk-accent)` 保证键盘可见）。

### 7. 网格行距为 0，靠 margin hack 撑间距，卡片与容器贴边
**[问题]** `.backlink-reading-grid` 用 `gap: 0 16px`（行距 0），行间距改由卡片 `margin-top: 8px` 提供；再用 `margin: 0 -8px` 负外边距把网格向两侧撑出容器内边距。这是本项目已知缺陷模式（相邻容器 0 间距 + 负 margin hack）：窄容器下卡片热区会贴到容器边框和圆角上，hover 高亮块也会压到 `border-radius: 8px` 的容器圆角内。
**[证据]** `prefix.css:22-27`（`gap: 0 16px; margin: 0 -8px`）与 `prefix.css:37`（`margin-top: 8px`）。
**[建议]** 直接 `gap: 8px 16px`，删掉 `margin: 0 -8px` 与 `margin-top: 8px` 两个 hack；间距取设计档位值，不做 0 值行距。

### 8. 大数据量无 memo、无虚拟化，展开全部一次性渲染
**[问题]** 每次渲染都对全部条目重算分组、排序、`plainText` 摘录（截图显示"当天更新 539"条）；`getCreatedItems` 还对每个条目做 `getItem(ky, { isRecur: true })` 递归取值。点击「展开全部」后一次性渲染全部卡片，无虚拟滚动、无分页。在 539 条规模下点击折叠/展开会明显卡顿。
**[证据]** `DailyActivity.tsx:30-59`（每次 render 重建 Map + 排序 + 摘录拼接，无 `useMemo`）；`DailyActivity.tsx:135-137`（`isRecur: true` 递归）；`DailyActivity.tsx:65`（`expanded` 时渲染全部 entries）；截图计数 219 / 539。
**[建议]** 用 `useMemo` 包住分组+摘录计算（依赖 `items`、`pickTime`）；展开态考虑分批渲染（如每次 +50）或复用项目既有虚拟列表。

### 9. 标题计数语义不清：数字是"分组数"还是"条数"？
**[问题]** h2 里的计数显示 `groups.size`（来源主题分组数），截图显示"当天创建 219 / 当天更新 539"。若 219/539 实为条目数，则与代码语义不符；若确是分组数，用户也很难区分"219 篇笔记"和"219 个主题"。另外折叠时只显示 12 张卡片，计数与可见卡片数差距巨大（539 vs 12）而无任何"共 N 个主题、M 条动态"的拆解说明。
**[证据]** `DailyActivity.tsx:77` `{title} <span>{groups.size}</span>`；注释 line 206「标题里的计数在渲染时由 groups.size 提供」；截图「当天创建 219」「当天更新 539」。
**[建议]** 明确计数单位并在 UI 上表达（如「当天更新 · 86 个主题 / 539 条」）；`$t('dailyActivity.expand_all', { count: hidden })` 的 count 也要与该口径一致。

### 10. 折叠状态不持久化，板块每次进来都全开
**[问题]** `sectionOpen` / `expanded` 都是组件本地 `useState`，切换日期或离开再回来（组件卸载重建）后状态重置为全展开。面对 539 条的默认全开视图，用户每次都要重新收起，"用户控制与自由"打了折扣。
**[证据]** `DailyActivity.tsx:62-64`；组件随 `addMoreComponent` 挂载于编辑器视图，切换日期即重建。
**[建议]** 折叠偏好写入 addon `config`（`config = {}` 已存在，line 124）或 localStorage，按板块记忆开合。

---

## P2 可优化

### 11. 移动端安全项缺失：tap 高亮与触摸滚动
**[问题]** 样式未设置 `-webkit-tap-highlight-color: transparent` 与 `overscroll-behavior`。该模块基于 webview/移动适配时（backlink 网格 minmax 220px 可在窄容器触发横排改竖排），点卡片会出现系统灰块闪动，嵌套滚动到底时可能带动整页橡皮筋。对应原则 `tap-highlight`、`overscroll-behavior`。
**[证据]** `prefix.css` 全文无 `-webkit-tap-highlight-color` / `overscroll-behavior`。
**[建议]** 在卡片与 toggle 上加 `-webkit-tap-highlight-color: transparent`；滚动容器（若板块可滚动）加 `overscroll-behavior: contain`。

### 12. 加载/空状态依赖"不渲染"，缺少系统状态可见性
**[问题]** 空数据时返回 `null`（无空卡片，这是合理的），但大数据计算（539 条分组+摘录）在主线程同步执行期间没有任何"计算中"反馈；Nielsen「系统状态可见性」在此缺失。低优先级因为当前为同步计算、卡顿即冻结，用户至少能感知"在干活"。
**[证据]** `DailyActivity.tsx:45, 216`（null 早退）；无 loading/skeleton 分支。
**[建议]** 若按问题 8 引入分批/异步加载，配 skeleton 或"正在汇总…"文字；纯同步方案可忽略。

### 13. 摘录与计数用 12px muted 色小字，长文可读性与对比度存疑
**[问题]** 摘录 `font-size: 12px; line-height: 16px; color: var(--nk-muted)`，是界面最小字号承载最长内容；muted 灰在浅色背景上的对比度需实测（WCAG AA 正文要求 4.5:1，12px 小字更敏感）。
**[证据]** `prefix.css:58-68`；截图两板块收起态无法验证实际摘录渲染，但计数「219/539」同为 12px 灰字可作参照。
**[建议]** 摘录提至 13px / 行高 18px 与标题一致，或实测 `--nk-muted` 对比度不达 4.5:1 时换深一档变量。

### 14. 展开全部后无"收起"入口的边界泄漏
**[问题]** 「收起」按钮条件是 `expanded && entries.length > COLLAPSED_COUNT`，逻辑正确；但当 `entries.length` 恰在 12±1 边界、且分组数据在编辑过程中实时变化（用户边写边看每日动态）时，`hidden` 与按钮会闪现/消失，触发布局跳动。低概率，但编辑器场景数据是活的。
**[证据]** `DailyActivity.tsx:97-114`；`withActivityReading` 每次渲染重取 `getList`。
**[建议]** toggle 区域给固定 `min-height`，或对 `entries.length` 变化做防抖。

---

## 走查覆盖说明

- 16 条原则中 `sticky-header-topmost`、`modal-fullscreen`、`safe-area-adaptation`、`input-focus-keyboard-avoid`、`panel-hidden-by-default`、`hover-not-control-visibility`、`pc-api-mobile-equivalent`、`tooltip-tap-trigger`、`sidebar-fixed-content-scroll`、`state-full-container`（部分，见问题 12）在本模块无对应场景或未发现问题，未列入。
- 工作台补充 10 条中 `selection-equals-hitarea`（卡片高亮无选中态概念）、`left-content-right-actions`（卡片已左对齐）、`density-inline`（摘录独立成块属合理设计）通过。
- 截图独立观察：两个板块在收起态下仍占满宽度、卡片未渲染，与代码 `sectionOpen &&` 一致，未发现截图与代码矛盾项（箭头方向问题已归入问题 3）。
