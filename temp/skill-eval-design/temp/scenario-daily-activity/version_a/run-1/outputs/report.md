# 「每日动态」UI 模块设计走查报告

- 方法论：vercel-agent-skills / web-design-guidelines（已按技能要求经代理抓取最新规则清单 https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md ，8055 字节全量应用）
- 材料：screenshot.jpg（978×658 截图）、DailyActivity.tsx（228 行）、prefix.css（79 行）
- 严重度定义：P0 = 功能/可访问性阻断；P1 = 明显可用性或正确性缺陷；P2 = 规范偏离、体验瑕疵

---

## P0（阻断级）

### 1. 板块折叠标题不可键盘操作，键盘与读屏用户无法折叠/展开模块
- [问题] 模块级折叠的唯一交互绑定在 `<h2 onClick>` 上（DailyActivity.tsx:70-73）。`h2` 不是可聚焦元素，没有 `tabIndex`、`role="button"`、`onKeyDown`，违反规则「Interactive elements need keyboard handlers」与「`<button>` for actions」。折叠功能对键盘用户完全不可达。
- [证据] DailyActivity.tsx:70-73：`<h2 className="backlink-reading-head" onClick={() => setSectionOpen((v) => !v)}>`；prefix.css 中 `.backlink-reading-head` 无任何聚焦样式。
- [建议] 把可点击区域改为 `<button type="button" aria-expanded={sectionOpen} aria-controls={panelId}>` 包住 carets+标题，`h2` 只作语义外壳；或保留 `h2` 但内部嵌 button 并补 `onKeyDown`（Enter/Space）。

### 2. 折叠箭头是纯文本字符且未标 decorative，状态变化不通知辅助技术
- [问题] `▸` 字符（DailyActivity.tsx:74-76）直接暴露给读屏，会被朗读为无法理解的符号；开合状态只写在 `data-open` 属性上，无 `aria-expanded`，读屏用户感知不到模块是展开还是收起。违反「Decorative icons need aria-hidden="true"」。
- [证据] DailyActivity.tsx:74-76；全文件无 `aria-expanded`。
- [建议] carets 加 `aria-hidden="true"`，状态用按钮上的 `aria-expanded` 表达；如需动画旋转，用 CSS transform 而非换字符。

### 3. 交互元素全部没有可见聚焦样式
- [问题] 卡片按钮（`.backlink-reading-entry`）、展开/收起按钮（`.backlink-reading-toggle`）、标题按钮都没有 `:focus-visible` 规则；entry 还设了 `border: 0; background: transparent`，默认轮廓是唯一线索。违反「Interactive elements need visible focus」「Never outline-none without focus replacement」——透明卡片一旦被全局 reset 去掉 outline 就彻底隐形。
- [证据] prefix.css:28-47、69-79：无任何 `:focus` / `:focus-visible` 声明。
- [建议] 统一补 `:focus-visible { outline: 2px solid var(--nk-focus, …); outline-offset: 2px; }`，卡片可配 `:focus-within`。

---

## P1（严重）

### 4. 大列表未虚拟化，且每次渲染全量重算分组
- [问题] 「当天更新」实测 539 条（screenshot），`ActivityReadingComp` 每次渲染都对全量 items 做 Map 分组、排序、`plainText` 摘录拼接（DailyActivity.tsx:34-59），无 `useMemo`，无虚拟化。违反「Large lists (>50 items): virtualize」。父组件 `withActivityReading` 每次编辑器渲染都会重新拉 `getList`（DailyActivity.tsx:214-216），输入不变也重算。
- [证据] DailyActivity.tsx:30-59、65、214-216；screenshot 中「当天更新 539」。
- [建议] 分组/排序/摘录用 `useMemo([items, pickTime])`；超 50 条时启用 `content-visibility: auto` 或窗口化渲染（折叠态已部分缓解，展开后仍全量）。

### 5. `Math.max(...sorted.map(pickTime))` 有栈溢出风险
- [问题] 展开运算符传参上限约十万级；单日动态条目一旦超限（批量导入场景）直接抛 RangeError，整个板块崩溃。且它被放进 `entries.map` 内联计算，无缓存。
- [证据] DailyActivity.tsx:58：`last: Math.max(...sorted.map(pickTime))`。
- [建议] 改 `sorted.reduce((m, x) => Math.max(m, pickTime(x)), 0)`（sorted 非空时等价于取首元素，因为已降序排序，可直接 `pickTime(sorted[0])`）。

### 6. 卡片网格行间距为 0，相邻卡片垂直贴合
- [问题] `gap: 0 16px` 把行间距定为 0，只靠子项 `margin-top: 8px` 撑开（prefix.css:25、37），多行卡片在视觉上首尾相接，且与 16px 列间距不对称。这是截图可见的「相邻模块贴合零间距」同类缺陷。
- [证据] prefix.css:22-27、37。
- [建议] `gap: 8px 16px`（或按设计档位取值），删掉子项的 `margin-top` 补丁。

### 7. 网格负外边距造成卡片左右边距与容器内边距不一致
- [问题] 容器 `padding: 16px`（prefix.css:4），网格 `margin: 0 -8px`（prefix.css:26）把左右各拉回 8px，首列/末列卡片距容器边框仅 8px，与标题的 16px 对齐基线冲突，截图里右列卡片被裁切的观感与此相关。
- [证据] prefix.css:4、26。
- [建议] 去掉负 margin；若为了消除子项水平 padding，改为只抵消子项自身的 padding 值并同步设置网格 `padding: 0 8px`。

### 8. 摘录里的换行符不生效
- [问题] 摘录用 `excerpts.join('\n')`（DailyActivity.tsx:93）拼接多段，但 `.backlink-reading-excerpt` 未设 `white-space: pre-line`，`\n` 被折叠成空格，多条摘录挤成一段，来源不可分。
- [证据] DailyActivity.tsx:93；prefix.css:58-68 无 `white-space` 声明。
- [建议] CSS 加 `white-space: pre-line;`，或改为多条摘录各渲染一个元素。

### 9. 卡片按钮缺少 `type="button"`
- [问题] entry 按钮未写 `type`（DailyActivity.tsx:83-94），默认为 `submit`；该组件会被塞进编辑器视图，一旦上游出现 form 包裹就会触发提交。同文件的 toggle 按钮都写了 `type="button"`（99、109 行），标准不一致。
- [证据] DailyActivity.tsx:83。
- [建议] 补 `type="button"`。

### 10. 日期硬编码格式，未走 `Intl.DateTimeFormat`
- [问题] 截图主标题「2026-10-08」来自 `YYYY_MM_DD` 索引键直接当展示文案（datekit 索引键，DailyActivity.tsx:13-14、127-138），违反「Dates/times: use Intl.DateTimeFormat not hardcoded formats」；英文环境同样显示中式年月日顺序。
- [证据] screenshot 顶部；DailyActivity.tsx:5、13-14。
- [建议] 展示层用 `new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date)`，索引键仅作数据键。

---

## P2（一般）

### 11. 无 hover / active 反馈定义
- [问题] `.backlink-reading-entry` 定义了 `transition: background-color 100ms`（prefix.css:46）却没有任何 `:hover` 规则改变背景；toggle 同样没有 hover 态。违反「Buttons/links need hover: state」。指针用户得不到可点击暗示（截图中的两张卡片完全无差异化）。
- [证据] prefix.css:28-47、69-79。
- [建议] 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,.04)); }` 及 active 态加深。

### 12. 折叠/展开状态未同步 URL
- [问题] `expanded`、`sectionOpen` 均为纯 `useState`（DailyActivity.tsx:62-64），刷新/分享后丢失。违反「URL reflects state」「Deep-link all stateful UI」。对编辑器内嵌组件可降级处理，但至少折叠态应持久化（localStorage 或随 daily 日期参数）。
- [证据] DailyActivity.tsx:62-65。
- [建议] 以日期为键持久化展开状态，或接受内嵌场景并在代码注释说明豁免理由。

### 13. 计数数字未用等宽数字
- [问题] 标题计数 `{groups.size}`（DailyActivity.tsx:77）与截图「219 / 539」随日期变化宽度抖动，未设 `font-variant-numeric: tabular-nums`，违反排版规则。
- [证据] DailyActivity.tsx:77；prefix.css:16-21。
- [建议] h2 的 span 与计数容器加 `font-variant-numeric: tabular-nums;`。

### 14. 触屏点击无 `touch-action: manipulation`
- [问题] 卡片与按钮是高频点击目标，未声明 `touch-action: manipulation`，移动端/触屏笔记本有双击缩放延迟。
- [证据] prefix.css 全文无 `touch-action`。
- [建议] 对 `.backlink-reading-entry`、`.backlink-reading-toggle` 加 `touch-action: manipulation;`。

### 15. carets 无旋转动画样式，`data-open` 状态纯摆设
- [问题] `data-open={String(sectionOpen)}`（DailyActivity.tsx:74）写在了元素上，但 prefix.css 片段里没有任何 `[data-open]` 选择器——箭头永远不转，状态只靠内容显隐表达；若别处有该样式，本片段也未包含，走查范围内状态视觉断裂。
- [证据] DailyActivity.tsx:74-76；prefix.css 无 `data-open` 规则。
- [建议] 补 `[data-open='true'] { transform: rotate(90deg); }` + `transition: transform 150ms`，并包 `prefers-reduced-motion` 豁免。

### 16. 空内容条目未被过滤，渲染空摘录卡片
- [问题] `isEmpty(citation)` 只过滤了空对象（DailyActivity.tsx:35），`plainText(citation)` 为空字符串、也无父上下文的条目仍会生成只有标题无摘录的卡片；截图中第二个空 bullet 即为空内容直出的实例。
- [证据] screenshot 第二个空列表项；DailyActivity.tsx:34-44、50-57。
- [建议] 过滤条件加「摘录非空」：`if (!plainText(citation) && !context) continue`。

### 17. 截图层面：内容区顶部留白过大、右缘内容被裁切
- [问题] 日期标题与第一条内容之间约 130px 空白（screenshot y≈50→160），远超任何合理节奏档位；列表行右端出现被视口裁切的痕迹（x≈940 处），提示容器存在横向溢出未处理。违反「Avoid unwanted scrollbars / fix content overflow」。
- [证据] screenshot.jpg 目测坐标。
- [建议] 收紧日期与正文间距到一个档位（如 24px）；给滚动容器加 `overflow-x: hidden` 并排查是哪个固定宽度子元素撑破。

### 18. 长标题/长摘录仅截断无补救路径
- [问题] 标题 2 行、摘录 4 行 line-clamp（prefix.css:52、62）本身合规，但截断后没有任何「查看全文」通道——唯一出口是整卡跳转，用户无法判断该不该点。属「User-generated content: anticipate very long inputs」的体验补充项。
- [证据] prefix.css:48-68。
- [建议] 截断时以 `title` 属性或展开态提供全文（hover tooltip 为最低成本方案）。

---

## 通过项（摘要）

- 卡片/展开按钮使用原生 `<button>` 而非 div onClick ✓
- 板块有 `aria-label` + `h2` 语义标题 ✓
- 摘录/标题均有 line-clamp、flex 子项有 `min-width: 0` ✓
- 空列表返回 null，不渲染空板块 ✓（组件级；条目级见问题 16）
- transition 指定了具体属性而非 `transition: all` ✓
- i18n 文案走 `$t` 而非硬编码 ✓

## 修复优先级建议

1. 先修 P0 三条（键盘可达性 + 焦点样式）——成本极低、影响面为全部用户中的键盘/读屏群体。
2. P1 中 4/5（性能与崩溃风险）和 6/7（间距体系）分两批走。
3. P2 可并入下次样式统一整改。
