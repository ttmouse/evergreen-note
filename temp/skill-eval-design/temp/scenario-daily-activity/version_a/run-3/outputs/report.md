# 「每日动态」UI 模块设计走查报告

- 走查方法：Vercel web-design-guidelines 技能（规则清单已于走查时从 [vercel-labs/web-interface-guidelines command.md](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) 实时抓取，共 9 大类约 90 条规则逐条比对）。
- 走查对象：`fixtures/DailyActivity.tsx`、`fixtures/prefix.css`、`fixtures/screenshot.jpg`（三份材料交叉验证，截图用于证实代码推断）。
- 结论概览：**高危 4 条、中危 7 条、低危 4 条**。最严重的是一处真实的 React Hooks 违规（条件早退后调用 useState）和整块折叠交互对键盘/读屏用户不可达。

---

## 高危

### 1. React Hooks 条件调用——违反 Rules of Hooks 的真实缺陷

- **[问题]** `useState` 在函数组件的条件早退之后调用，Hooks 调用顺序随数据变化而改变，React 会在开发期直接抛错，生产下可能产生状态串位（把 A 卡片组的 `expanded` 状态接到 B 上）。
- **[证据]** DailyActivity.tsx:45 `if (!groups.size) return null` 先于 DailyActivity.tsx:62-64 的 `React.useState(false)`。当某天无动态时组件走早退分支，Hook 数量比有数据时少 2 个。
- **[建议]** 把两处 `useState`（`expanded`、`sectionOpen`）移到 `groups` 计算与早退判断之前；空数据直接在渲染 JSX 时返回 `null`，而不是提前 return。

### 2. 板块折叠（h2 onClick）对键盘与读屏用户完全不可达

- **[问题]** 折叠整个模块的交互挂在 `<h2>` 的 onClick 上：键盘用户无法聚焦、无法用 Enter/Space 触发；读屏用户得不到「可折叠 / 当前是否展开」的任何语义。这是对「交互元素必须有键盘处理」「动作用 button」两条规则的直接违反。
- **[证据]** DailyActivity.tsx:70-73 `<h2 className="backlink-reading-head" onClick={...}>`；caret `▸`（DailyActivity.tsx:74-76）为纯装饰字符却未加 `aria-hidden="true"`，会被读屏念出。截图证据：screenshot.jpg 中「当天创建 219」「当天更新 539」两个模块均处于折叠态，但无任何「已折叠」的视觉/语义说明，仅剩一行标题。
- **[建议]** 折叠按钮改为 `<button type="button" aria-expanded={sectionOpen} aria-controls={面板id}>` 包住标题行（button 上保留 h2 语义可写为 `<h2><button …>…</button></h2>`）；`▸` 字符加 `aria-hidden="true"`。

### 3. 折叠/展开状态不进 URL，刷新即丢

- **[问题]** 「展开全部」「板块折叠」都是纯 `useState` 局部状态，未同步到 URL。「URL 反映状态（过滤器、展开面板）」「对有状态 UI 做深链」两条规则均不满足；用户刷新或把链接发给别人，对方看到的展开状态完全不同。
- **[证据]** DailyActivity.tsx:62-64 仅 `useState`，无任何 searchParams/URL 写入。
- **[建议]** 至少把「板块是否展开」同步进查询参数（或 hash）；展开全部可保持局部状态，但刷新丢失体验也应评估。

### 4. 单日最多数百张卡片一次性渲染，无虚拟化

- **[问题]** 截图显示「当天更新 539」——展开全部后 539 个卡片按钮全量 `.map()` 渲染。规则要求超过 50 项的列表虚拟化。展开瞬间会明显卡顿（尤其低端机），且 539 个可聚焦按钮让键盘/读屏用户按 Tab 穿越整个模块变成灾难。
- **[证据]** DailyActivity.tsx:82-95 `visible.map(...)` 直接渲染；DailyActivity.tsx:65 `expanded ? entries : entries.slice(0, 12)` 展开后无上限。截图证据：「当天更新 539」。
- **[建议]** 引入虚拟化（如 `virtua`）或对容器加 `content-visibility: auto`；同时给展开后的列表加分页/「每次多显示 50 条」递进加载。

---

## 中危

### 5. 卡片导航用 `<button onClick>` 而非链接，丢失浏览器原生导航手势

- **[问题]** 点击卡片是「跳转到来源主题」——这是导航不是动作。用 `<button>` 实现导致 Cmd/Ctrl+点击、中键新开标签、悬停状态栏预览链接等全部不可用。
- **[证据]** DailyActivity.tsx:83-94 `<button className="backlink-reading-entry" onClick={...route(...)}>`。
- **[建议]** 若路由框架支持，改为 `<a href>`（编程式导航可包一层）；至少保留按钮方案时在提示文案上说明不支持新开标签。

### 6. 卡片与「展开全部」按钮均无 hover 视觉反馈

- **[问题]** `.backlink-reading-entry` 定义了 `transition: background-color` 却从未定义 `:hover`/`:active` 的背景色，鼠标悬停无任何反馈；`.backlink-reading-toggle` 同样没有 hover 态。违反「按钮/链接需要 hover 状态」。
- **[证据]** prefix.css:46（只有 transition 声明）、prefix.css:69-79（toggle 无任何状态样式）。
- **[建议]** 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,0.04)); }`，toggle 同理；`:active` 再加深一档。

### 7. 摘录换行丢失：`\n` 拼接但没有 `white-space: pre-line`

- **[问题]** 多条摘录用 `excerpts.join('\n')` 拼进一个 `<span>`，但 CSS 没设 `white-space: pre-line`，换行符会被 HTML 折叠成空格——「上下文 — 摘录 — 上下文 — 摘录」全部糊成一段，多来源卡片可读性差。
- **[证据]** DailyActivity.tsx:93 `{excerpts.join('\n')}`；prefix.css:58-68 `.backlink-reading-excerpt` 无 white-space 声明。
- **[建议]** 给 `.backlink-reading-excerpt` 加 `white-space: pre-line`，或改为多条摘录各渲染一行（配合 line-clamp 收口）。

### 8. 折叠箭头「▸」在两种状态下视觉完全相同——状态指示失效

- **[问题]** caret 依赖 `data-open` 属性做旋转区分，但 prefix.css 中没有任何 `[data-open]` 相关规则：展开与折叠箭头都朝右。用户无法从箭头方向判断模块是否可展开/已展开。截图证实：两个模块均显示朝右的「▸」。
- **[证据]** DailyActivity.tsx:74-76（`data-open={String(sectionOpen)}`）；prefix.css 全文无 `data-open` 选择器；screenshot.jpg 中「当天创建」「当天更新」箭头同向。
- **[建议]** 补 `.backlink-reading-caret { transition: transform 100ms linear; } .backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }`。

### 9. 相邻模块近乎零间距，与模块上方留白严重不一致

- **[问题]** 截图中「当天创建」「当天更新」两个板块卡片上下贴合，间距约 2px，而日期标题到首个列表之间却有大段空白——间距节奏不一致，模块边界糊在一起。相邻容器间距为 0 是本仓库设计规则明令禁止的档位。
- **[证据]** screenshot.jpg：两卡片边框几乎相接；DailyActivity.tsx 中两个板块由 `addMoreComponent` 相邻注入，prefix.css 中 `.backlink-reading` 无 margin 声明（只有 padding），板块间距完全依赖外部环境。
- **[建议]** 给 `.backlink-reading` 加 `margin-top`（取设计规范中的标准档位，如 12–16px），或在宿主容器统一设置相邻组件间距。

### 10. 「展开全部」触摸目标过小

- **[问题]** toggle 按钮 `padding: 4px 8px`、`font-size: 12px`，实际高度约 26px，低于 44px（触屏）/24px 的最低可用命中标准，在移动或触屏笔记本上难点中。
- **[证据]** prefix.css:71-72。
- **[建议]** 增大 padding 至纵向命中区 ≥ 32px（如 `padding: 8px 12px`），或用伪元素扩大命中范围。

### 11. 计数数字未用等宽数字（tabular-nums）

- **[问题]** 「当天创建 219」「当天更新 539」这类计数会同屏对比，非等宽数字会导致相邻数字列视觉宽度抖动。
- **[证据]** prefix.css:16-21（`.backlink-reading h2 span` 无 `font-variant-numeric`）。
- **[建议]** 加 `font-variant-numeric: tabular-nums;`。

---

## 低危

### 12. 无显式 `:focus-visible` 焦点样式，仅靠浏览器默认值

- **[问题]** 组件未设置任何 focus 样式（好消息是没有 `outline: none` 反模式，默认焦点环仍在），但卡片是透明背景，默认焦点环在浅色主题下对比偏弱。建议显式声明以保证品牌一致与可辨识度。
- **[证据]** prefix.css 全文无 `:focus-visible` 规则。
- **[建议]** 补 `.backlink-reading-entry:focus-visible { outline: 2px solid var(--nk-accent); outline-offset: 2px; }`，toggle 同理。

### 13. 触屏双击缩放延迟未处理

- **[问题]** 可点击元素密集的模块未设 `touch-action: manipulation`，触屏设备上点击有约 300ms 双击判定的潜在延迟。
- **[证据]** prefix.css 全文无 `touch-action`。
- **[建议]** 在 `.backlink-reading-entry`、`.backlink-reading-toggle`、折叠按钮上加 `touch-action: manipulation;`。

### 14. 空标题卡片会产生无可访问名称的按钮

- **[问题]** 卡片标题取 `source.topic || plainText(source)`，两者都可能是空字符串（例如空笔记），此时渲染出一个读屏念不出任何内容的 `<button>`。列表项本身有 `isEmpty` 过滤，但「存在但文本为空」的项防不住。
- **[证据]** DailyActivity.tsx:87, 90-92。
- **[建议]** 渲染前对标题做兜底（如 `$t('dailyActivity.untitled')`），或在 `plainText(source)` 为空时跳过该分组。

### 15. 过渡动画未适配 prefers-reduced-motion

- **[问题]** `transition: background-color 100ms linear` 与建议新增的 caret 旋转变换都未包 `prefers-reduced-motion` 介质查询。颜色过渡影响轻微，旋转建议顺手一起适配。
- **[证据]** prefix.css:46。
- **[建议]** `@media (prefers-reduced-motion: reduce) { .backlink-reading * { transition: none; } }`。

---

## 附：符合项（抽查通过）

- 空数据返回 `null` 不渲染空壳（DailyActivity.tsx:45、216）——符合「处理空状态」。
- 标题/摘录均有 line-clamp，grid 子项有 `min-width: 0`（prefix.css:34、52、62）——长内容截断合规。
- `transition` 明确列出属性、未用 `transition: all`（prefix.css:46）。
- 列表项用语义化 `<button>` 而非 `div onClick`；section 有 `aria-label`。
- 卡片整卡命中区大（min-height 64px），无死区。

## 严重度统计

| 严重度 | 数量 | 条目 |
| --- | --- | --- |
| 高危 | 4 | #1 Hooks 条件调用、#2 折叠不可达、#3 状态不进 URL、#4 数百项无虚拟化 |
| 中危 | 7 | #5–#11 |
| 低危 | 4 | #12–#15 |
