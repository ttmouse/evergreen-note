# 「每日动态」UI 模块走查报告（ux-principles 全原则走查）

- 走查对象：`temp/skill-eval-design/temp/fixtures/` 下 `screenshot.jpg`、`DailyActivity.tsx`、`prefix.css`
- 方法：加载 ux-principles 技能，逐条比对 principles/ 目录 17 条原则 + 11 条工作台补充原则 + Nielsen/WCAG 附录；截图证据与代码/样式交叉验证
- 结果：P0 ×1，P1 ×3，P2 ×4，P3 ×3；7 条原则明确通过，6 条不适用（已注明）

---

## P0 必须修

### 1. React Hooks 条件调用，空组切换时组件崩溃
- [问题] `ActivityReadingComp` 在第 45 行 `if (!groups.size) return null` 提前返回之后才调用 `React.useState`（第 62、64 行）。同一组件在「有内容」与「无内容」两次渲染间 Hook 数量不同，违反 Rules of Hooks。
- [证据] DailyActivity.tsx:45 `if (!groups.size) return null` 早于 :62 `const [expanded, setExpanded] = React.useState(false)`、:64 `const [sectionOpen, setSectionOpen] = React.useState(true)`。典型触发路径：删除当天最后一条笔记使 219 → 0，React 直接抛 "Rendered fewer hooks than expected"，整个编辑器视图白屏。
- [建议] 把两个 `useState` 移到 `if (!groups.size)` 之前；或把空态判断下沉到外层 `withActivityReading`（那里已-return-null 且无 Hook，安全）。

---

## P1 建议尽快修

### 2. 相邻板块贴合零间距，「当天创建」与「当天更新」卡片粘在一起
- [问题] `.backlink-reading` 无任何 margin，两个板块实例上下堆叠时仅隔 1px 边框，视觉上粘连为一个块；与上方日记内容反而留白很大，节奏失衡。
- [证据] prefix.css:2-8 `.backlink-reading` 只有 `padding: 16px`，无 `margin`；screenshot.jpg 中「当天创建 219」与「当天更新 539」两张卡片边框相贴、中缝只有一条线，与上方列表的间距形成明显反差。
- [建议] 给 `.backlink-reading` 加 `margin: 16px 0`（或外层容器用 `display:grid; gap:16px` 统一档位），使板块间距与模块内间距同档。

### 3. 折叠状态不可见：箭头无旋转样式，展开/收起长得一样
- [问题] 折叠箭头 `▸` 是写死的字符，CSS 里没有任何 `[data-open]` 旋转/换形规则，板块展开时箭头仍指向右，用户无法从视觉判断当前是展开还是收起状态（Nielsen #1 系统状态可见性）。
- [证据] DailyActivity.tsx:74-76 `<span className="backlink-reading-caret" data-open={String(sectionOpen)}>▸</span>`；prefix.css 全文无 `.backlink-reading-caret` 选择器，`data-open` 属性悬空。
- [建议] 补 `.backlink-reading-caret { display:inline-block; transition: transform 150ms; } .backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }`。

### 4. 折叠标题行不可发现、不可键盘触达、触控目标过小
- [问题] 折叠交互只挂在 `h2` 的 `onClick` 上：无 `cursor:pointer`、无 hover/active 反馈（可发现性差）；`h2` 无 `tabIndex`/`role="button"`/`onKeyDown`，键盘与读屏用户完全无法折叠（WCAG 可操作）；标题行高仅 20px，远低于 44×44pt 最小触控目标。
- [证据] DailyActivity.tsx:70-73 `<h2 className="backlink-reading-head" onClick={...}>`；prefix.css:9-15 `.backlink-reading h2` 仅排版属性，无 cursor/hover/padding。
- [建议] 标题行改为 `<button type="button" aria-expanded={sectionOpen}>` 包裹（或 h2 加 `role="button" tabIndex={0}` + Enter/Space 处理），CSS 加 `cursor:pointer` + hover 背景 + `padding:8px 0; min-height:44px`；`aria-controls` 指向网格容器。

---

## P2 建议改

### 5. 多条摘录的 `\n` 拼接在 HTML 中失效，多条动态挤成一段
- [问题] `excerpts.join('\n')` 放进 JSX 文本后换行符塌缩为空格，同主题多条当天动态之间没有任何可见分隔，阅读上混为一谈。
- [证据] DailyActivity.tsx:93 `{excerpts.join('\n')}`；prefix.css:58-68 `.backlink-reading-excerpt` 无 `white-space: pre-line`。
- [建议] excerpt 加 `white-space: pre-line`，或每条摘录渲染为独立 `<span>`/列表行。

### 6. 「展开全部」无上限渲染，219/539 个分组一次性进 DOM
- [问题] `expanded` 后 `entries` 全量渲染，截图场景是 539 组，一次性铺几百个卡片按钮，滚动卡顿、找内容也更难；且展开后没有分组/分页收口。
- [证据] DailyActivity.tsx:65 `const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT)`；screenshot.jpg 标题计数 219 / 539。
- [建议] 展开改为阶梯加载（每次 +24）或虚拟滚动；至少对 expanded 状态再加一层上限与「继续加载」。

### 7. 卡片点击无任何视觉反馈，transition 空转
- [问题] `.backlink-reading-entry` 与 `.backlink-reading-toggle` 声明了 `transition: background-color` 却没有任何 `:hover`/`:active`/`:focus-visible` 背景规则，整个模块的所有可点元素按下均无反馈；移动端也未关 tap 高亮（tap-highlight 原则）。
- [证据] prefix.css:46、69-79：只有 transition 定义，无状态伪类；也无 `-webkit-tap-highlight-color: transparent`。
- [建议] 补 `:hover/:active { background: var(--nk-hover-bg, rgba(0,0,0,.04)) }` 与 `:focus-visible` 描边；触屏下关默认高亮、靠 :active 提供反馈。

### 8. 卡片边框溢出视口右缘（截图可见）
- [问题] 截图中两张板块卡片右边框被裁切、延伸出屏幕右缘，说明外层容器缺少宽度/溢出约束；`.backlink-reading-grid` 的 `margin: 0 -8px` 负外边距会加剧溢出（吃掉父级 padding 后仍可能超出）。
- [证据] screenshot.jpg（978px 宽）：「当天创建」「当天更新」卡片右侧边框不可见、内容贴屏；prefix.css:26 `margin: 0 -8px`，:3 `container-type: inline-size` 但无 `max-width`/`overflow` 约束。
- [建议] 排查外层插入容器（`addMoreComponent` 宿主）是否给了 `min-width:0`；负 margin 改为网格自身的 `padding-inline: 8px` 对冲方案，并验证 `entry` 的 `min-width:0` 链路完整。

---

## P3 可优化

### 9. 展开状态未暴露给辅助技术
- [问题] 折叠区只有视觉切换，网格容器无 `aria-hidden`/`hidden` 语义联动，caret 字符也未 `aria-hidden`，读屏会把「▸」读出来。
- [证据] DailyActivity.tsx:74-79；prefix.css 无相关处理。
- [建议] 网格容器挂 `id` + 标题 `aria-controls`，caret 加 `aria-hidden="true"`。

### 10. 行数截断依赖 `-webkit-line-clamp` 私有方案
- [问题] 标题 2 行、摘录 4 行截断全部依赖 `-webkit-box` 私有前缀属性，虽现代浏览器普遍支持，但无标准回退，截断处也无省略号兜底确认。
- [证据] prefix.css:50-56、60-63。
- [建议] 保持现状可接受；如需严谨，补 `@supports not (-webkit-line-clamp: 2)` 的 `max-height + overflow:hidden` 回退。

### 11. 索引取值防御不一致（代码层）
- [问题] `getCreatedItems` 有 `typeof $.dbMemory.indexed.created === 'object'` 守卫，`getUpdatedItems` 没有；索引未初始化时前者安全、后者直接抛错，属同类场景双标准。
- [证据] DailyActivity.tsx:126-139。
- [建议] 抽一个 `getIndex(date, kind)` 统一守卫。

---

## 通过项（逐条原则结论）

| 原则 | 结论 |
|---|---|
| content-no-overlap | 通过：模块内无 fixed/absolute 覆盖元素 |
| panel-hidden-by-default | 通过：无侧滑面板 |
| sticky-header-topmost | 不适用：无固定头部 |
| input-focus-keyboard-avoid | 不适用：无输入框 |
| modal-fullscreen | 不适用：无弹窗 |
| safe-area-adaptation | 不适用：非全屏层/无固定底栏（宿主层面负责） |
| overscroll-behavior | 不适用：模块自身无滚动容器（依赖页面级滚动） |
| pc-api-mobile-equivalent | 通过：无 drag/PC 专属 API |
| grid-and-flex-stack | 基本通过：`auto-fill, minmax(220px,1fr)` 窄屏自然降为单列；扣分项见 #8 负 margin 溢出 |
| hover-not-control-visibility | 通过：无 hover 控制可见性（问题是完全没有 hover 反馈，见 #7） |
| tooltip-tap-trigger | 不适用：无信息浮层 |
| state-full-container | 通过（约定内）：空数据返回 null 不渲染空卡片，符合「无内容不占位」的注释约定；但折叠态本身即空态的载体，无额外引导可接受 |
| tap-highlight | 不通过：见 #7 |
| touch-target-44pt | 不通过：见 #4 |
| mobile-first-css | 基本通过：尺寸以小屏为默认、无 max-width 覆盖堆叠 |
| self-contained-interface-layer | 不适用：非独立界面层 |
| sidebar-fixed-content-scroll | 不适用：无双栏结构 |

补充原则（工作台 11 条）中相关项：#2 对应「相邻容器间距禁 0 值」，#4 对应「操作控件位置稳定/热区范围」；其余（scrollbar、单选等）不适用于本模块。
