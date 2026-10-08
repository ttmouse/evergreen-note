# 每日动态 UI 走查报告（run-2 / version_a）

走查方法：vercel-agent-skills `web-design-guidelines`（已按 SKILL.md 要求经 web_fetch 抓取最新 Web Interface Guidelines 全量规则清单后逐条核对）。
材料：screenshot.jpg（978×658 界面截图）、DailyActivity.tsx（228 行）、prefix.css（79 行）。
严重度定义：P0 崩溃/功能不可用或键盘完全不可达；P1 明显可用性/可访问性缺陷；P2 规范偏离与打磨项。每条按 [问题]/[证据]/[建议] 输出。

---

## P0

### 1. React Hooks 在条件返回之后调用，存在运行时崩溃风险
- [问题] `useState` 的两次调用位于 `if (!groups.size) return null`（第 45 行）之后，违反 Rules of Hooks：同一组件实例在「groups 为空 ↔ 非空」之间切换时，Hook 调用数量在两次渲染间不一致，React 会直接抛错白屏。
- [证据] DailyActivity.tsx:45（提前 return）与 DailyActivity.tsx:62-64（`React.useState` ×2）。外层 `withActivityReading`（:216）对 items 为空时返回 null，挡住了大部分空场景，但只要 items 全是 `isEmpty` 的脏数据（:35 仍会 continue）就会命中空 groups 分支，且父层未拦截。
- [建议] 把两个 `useState` 移到 `groups` 计算之前（函数最顶部、任何 return 之前），`if (!groups.size) return null` 保持在 Hook 之后。

### 2. 板块折叠标题不可键盘操作，折叠功能对键盘用户完全不可达
- [问题] 折叠整个模块的唯一入口是 `<h2 onClick>`，不是 button、无 `tabIndex`、无 `onKeyDown`、无 `role="button"`/`aria-expanded`。键盘用户（Tab/Enter/Space）永远无法折叠或展开板块。
- [证据] DailyActivity.tsx:70-73（`<h2 className="backlink-reading-head" onClick={...}>`）；prefix.css:9-15 也未给 h2 设 `cursor: pointer`，鼠标用户同样得不到可点提示。
- [建议] 在 h2 内放一个真正的 `<button aria-expanded={sectionOpen} aria-controls="...">` 包住 caret+标题+计数；h2 保留纯文本语义。同时补 `cursor: pointer`。

### 3. 模块横向溢出视口，卡片右边缘被裁切（截图实证）
- [问题] 板块卡片（含 1px 边框）延伸到视口右缘之外，右侧边框与圆角被裁掉；`.backlink-reading-grid` 的负水平外边距叠加父容器无 `overflow-x` 约束，把内容推出容器。
- [证据] screenshot.jpg：「当天创建 219」「当天更新 539」两张卡片右边框均被屏幕右缘切断、右侧留白为 0；prefix.css:26 `margin: 0 -8px`（负 margin 出血）且整个 prefix.css 无任何 `overflow-x` 处理。
- [建议] 去掉负 margin 出血，或给 `.backlink-reading` 补 `overflow-x: clip` 并核对父级 padding；验收标准：任意窗口宽度下卡片右边框完整可见且与右侧留白 ≥ 8px。

---

## P1

### 4. 卡片用 `<button>` 承担「跳转主题」的导航职责
- [问题] 点击卡片的语义是导航到来源主题，却用 button + onClick 实现：不支持 Cmd/Ctrl+点击新开、不支持中键、不产生链接上下文菜单，也没有 `href` 可复制。
- [证据] DailyActivity.tsx:83-94（`<button onClick={(e) => $.topic.route(...)}>`）。
- [建议] 换成 `<a>`（route 目标若非 URL，至少生成可导航的 href / 保留 button 但补修饰键分支：`e.metaKey||e.ctrlKey` 时走新开逻辑）。

### 5. 摘要换行符 `\n` 不会换行，多条摘录被挤成一行
- [问题] `excerpts.join('\n')` 写入 `<span>`，但 CSS 没有 `white-space: pre-line`，`\n` 会被折叠成空格——多条动态摘录之间的视觉分隔丢失，与代码注释意图（逐条分行）不符。
- [证据] DailyActivity.tsx:93（`{excerpts.join('\n')}`）；prefix.css:58-68（`.backlink-reading-excerpt` 无 `white-space` 声明）。
- [建议] `.backlink-reading-excerpt { white-space: pre-line; }`，或改为每条摘录一个子元素。

### 6. 折叠箭头是纯文本字符且无任何样式规则，展开态指示失真
- [问题] `▸` caret 依赖 `data-open` 属性做旋转，但 prefix.css 中根本不存在 `.backlink-reading-caret` 规则——展开/收起时箭头永远指向右，状态指示错误；且装饰字符未加 `aria-hidden="true"`，读屏会念出「向右指的小三角」。
- [证据] DailyActivity.tsx:74-76（`data-open={String(sectionOpen)}` + `▸`）；prefix.css 全文无 caret 相关规则。截图中间区域也可见两板块均为 ▸ 态。
- [建议] 补 CSS：`.backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }` + `transition: transform 150ms`（transform 合成器友好）；caret span 加 `aria-hidden="true"`，展开状态由标题按钮的 `aria-expanded` 承载（见问题 2）。

### 7. 卡片与「展开全部/收起」按钮均无 hover 反馈
- [问题] `.backlink-reading-entry` 声明了 `transition: background-color 100ms` 却没有任何 `:hover` 规则改变背景，过渡形同虚设；`.backlink-reading-toggle` 同样无 hover。交互元素缺少视觉反馈。
- [证据] prefix.css:28-47、prefix.css:69-79（均无 `:hover` 声明）。
- [建议] 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,.04)); }`，toggle 同理；hover/focus 态对比度应高于静止态。

### 8. 展开后全量渲染数百张卡片，无虚拟化
- [问题] 计数显示「当天更新 539」，点「展开全部」后 `entries`（含全部 `excerpts` 字符串预拼接）一次性 `.map()` 渲染成几百个 DOM 按钮，无 `content-visibility`、无虚拟滚动，长内容日会明显卡顿。
- [证据] screenshot.jpg（当天更新 539）；DailyActivity.tsx:65（`expanded ? entries : entries.slice(...)`）、:82-95（全量 map）；DailyActivity.tsx:48-59（每项都在 render 里重算 plainText 拼接）。
- [建议] 给 `.backlink-reading-entry` 加 `content-visibility: auto; contain-intrinsic-size: auto 64px;`（最小改动），或对 expanded 列表分页/窗口化；`excerpts` 拼接可用 `useMemo` 缓存。

### 9. 展开状态是纯本地 useState，不进 URL、不持久化
- [问题] 板块折叠（`sectionOpen`）与列表展开（`expanded`）都是一次性内存态：刷新丢失、无法分享/深链，也不记忆用户偏好。指南要求有状态 UI 反映到 URL。
- [证据] DailyActivity.tsx:62-64。
- [建议] 至少把「板块折叠」同步到 localStorage 或 URL query；「展开全部」因是临时浏览态可保留本地，但折叠偏好应持久。

---

## P2

### 10. 计数数字未用等宽数字（tabular-nums）
- [问题] 标题后的计数（219、539、groups.size、hidden）随数值变化会抖动相邻文字；指南要求数字列/对比数字使用 `tabular-nums`。
- [证据] screenshot.jpg（219 / 539 与标题间距随位数变化）；prefix.css:16-21（h2 span 无 `font-variant-numeric`）。
- [建议] `.backlink-reading h2 span { font-variant-numeric: tabular-nums; }`。

### 11. 触屏基础三件套缺失
- [问题] 所有可点元素未声明 `touch-action: manipulation`（移动端双击缩放延迟）与刻意的 `-webkit-tap-highlight-color`。
- [证据] prefix.css:28-47、69-79（button 规则均无这两项）。
- [建议] `.backlink-reading-entry, .backlink-reading-toggle, .backlink-reading-head { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }`（高亮交由 hover/active 背景承担）。

### 12. 焦点样式仅依赖浏览器默认值，无 `:focus-visible` 增强
- [问题] CSS 没有移除 outline（好），但也完全没定义焦点态；在自定义 hover 背景之后，默认焦点环与整体风格割裂且部分浏览器下不明显。
- [证据] prefix.css 全文无 `:focus` / `:focus-visible`。
- [建议] 补 `.backlink-reading-entry:focus-visible, .backlink-reading-toggle:focus-visible { outline: 2px solid var(--nk-accent); outline-offset: 2px; }`，不要用 `outline: none`。

### 13. 12px 灰色摘录文字对比度踩线
- [问题] 摘录用 `--nk-muted`（fallback #666）12px/16px 行高，浅色画布上约 4.6:1 勉强达标，暗色主题或自定义 muted 变量偏浅时会更低；小字号更需要充足对比。
- [证据] prefix.css:58-68（font-size 12px + `var(--nk-muted)`）。
- [建议] 摘录色改用比 muted 更深的次级文字变量，或保证暗色主题下 ≥ 4.5:1 并实测截图验收。

### 14. `Math.max(...sorted.map(pickTime))` 的展开写法有数组长度上限
- [证据] DailyActivity.tsx:58。单组 citations 超过约 10 万条时 `Math.max(...arr)` 会因参数展开超限抛 RangeError；当前场景量级安全，属防御性隐患。
- [建议] 改 `sorted.reduce((m, i) => Math.max(m, pickTime(i)), 0)` 或循环取最大。

### 15. 截图上方列表出现「空 bullets」
- [问题] 模块上方的每日列表渲染了一个无任何文字的列表项（第二个圆点后为空白），违反「空内容不渲染破碎 UI」。
- [证据] screenshot.jpg：日期标题下方第二条 bullet 为空。
- [证据] 关联代码：DailyActivity.tsx:35 只在 `isEmpty(citation)` 时跳过，内容为纯空白/不可见字符的条目不会被过滤（`isEmpty` 若只判 null/undefined/空串则漏掉空白串）。
- [建议] 过滤条件加 trim 判断（`!String(plainText(item)).trim()` 跳过），上游列表同样处理。

---

## 已核对通过的项（供对照，非问题）

- 空数据处理：无内容返回 null 不渲染空卡片（withActivityReading，:216）；`hidden>0` 才显示展开按钮。
- 卡片文本容器有 `min-width: 0` + `-webkit-line-clamp`（2 行标题 / 4 行摘录），长内容不会撑破网格（prefix.css:34、52、62）。
- 无 `transition: all`（只过渡 background-color）；无 `outline: none`；无 `autoFocus`；无禁用缩放；无 onPaste 拦截。
- 语义方向正确：动作用 button（卡片/toggle），未出现 div/span onClick；section 有 `aria-label`。
- 无图片/表单/拖拽场景，相关规则不适用。
- `data-open` 用字符串布尔而非裸属性，React 传值写法正确。

## 结论

P0 三项（Hook 顺序、折叠标题键盘不可达、横向溢出）建议立即修；P1 中 5、6 属「代码意图与实际渲染不符」的功能性小 bug，4、7、8 影响日常手感与长内容性能；P2 均为打磨项。修复后按报告第 3 条的验收标准在运行中的 App 内截图复核（本报告为只读走查，未改任何代码）。
