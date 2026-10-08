# 「每日动态」UI 模块走查报告（echo-ux）

- 走查对象：DailyActivity.tsx（ActivityReadingComp / createDailyActivityAddon）、prefix.css、screenshot.jpg
- 方法：ec rules 召回体验规则 → 截图/代码/样式三方对照分析
- 严重度定义：P0 功能/运行时损坏；P1 主流程体验受损；P2 可用性/一致性问题；P3 打磨项

---

## P0 — 会崩溃的功能缺陷

### 1. React Hooks 条件调用：空组时 useState 位置漂移，随时崩溃
- [问题] `ActivityReadingComp` 在第 45 行 `if (!groups.size) return null` 提前返回，而 `React.useState`（第 62、64 行）在其后——同一组件的 Hook 数量随数据变化，违反 Hooks 规则。
- [证据] DailyActivity.tsx:45 与 :62-64；React 运行时会抛 "Rendered fewer hooks than expected" 并卸载整棵子树。触发路径很日常：当天有内容渲染出卡片后，用户删光当天条目（或切换日期）导致 `groups.size` 变 0，下一次渲染 Hook 数从 2 变 0。
- [建议] 把两个 `useState` 移到所有提前 return 之前（组件顶部），或在 `withActivityReading` 外层保证非空才挂载内部组件且内部组件不再提前 return。

### 2. `getUpdatedItems` 缺少索引存在性守卫，索引未初始化时直接抛错
- [问题] `getCreatedItems` 有 `typeof $.dbMemory.indexed.created === 'object'` 守卫，`getUpdatedItems` 没有——`$.dbMemory.indexed.updated` 为 undefined 时 `date in undefined` 抛 TypeError。
- [证据] DailyActivity.tsx:126-139 两个方法守卫不对称。
- [建议] 与 created 同款守卫，或抽一个 `getIndexed(date, kind)` 统一处理。

---

## P1 — 主流程体验受损

### 3. 截图证实：卡片计数 219/539 却一张卡片都看不见，板块默认收起且状态不可信
- [问题] 截图中「当天创建 219」「当天更新 539」下方均为空白。代码里 `sectionOpen` 默认 `true`，但截图箭头是收起态（▸）——要么状态被外部重置/未持久化导致用户每次都面对收起板块，要么箭头方向没有跟随状态。
- [证据] screenshot.jpg；DailyActivity.tsx:64（默认 true）、prefix.css 中**完全没有** `.backlink-reading-caret` 和 `[data-open]` 的样式——`data-open` 属性写了但没有任何 CSS 消费它，箭头永远是一个朝右的字符，展开态毫无视觉区分。
- [建议] 补 caret 样式：`[data-open="true"] { transform: rotate(90deg) }` + transition；并考虑把 `sectionOpen` 持久化（localStorage 或 addon config），避免用户每次进页面都要重新展开。

### 4. 折叠标题 `h2` 可点击但不可键盘操作、无 aria 状态
- [问题] 板块级折叠只挂在 `<h2 onClick>` 上：不可聚焦、不支持 Enter/Space、没有 `role="button"` / `tabIndex` / `aria-expanded`，键盘用户完全无法折叠板块，读屏用户也不知道它是可折叠的。
- [证据] DailyActivity.tsx:70-78；对照规则 UX.DECISION.005（交互必须支持纯键盘操作）。
- [建议] 把标题行包成 `<button aria-expanded={sectionOpen} aria-controls={id}>`，或给 h2 加 `role="button" tabIndex={0}` + onKeyDown。

### 5. 摘要换行符失效：多条摘录黏成一团
- [问题] 卡片摘录用 `excerpts.join('\n')`（第 93 行）分隔多条内容，但 `.backlink-reading-excerpt` 是普通 `-webkit-box` + line-clamp，`white-space` 默认 normal——`\n` 被折叠成空格，多条摘录黏成一段，且不同主题之间只靠空格分隔，无法分辨条数。
- [证据] DailyActivity.tsx:93；prefix.css:58-68。另外每条内部已用 `' — '` 连接上下文，再叠加失效的 `\n`，分隔语义混乱。
- [建议] 摘录改为按条渲染多个 `<span className="excerpt-line">`（每条 `display:block` + clamp 用外层容器 `-webkit-line-clamp` 控制），或最低成本加 `white-space: pre-line`。

### 6. 同一条目同时出现在「当天创建」和「当天更新」两个板块，内容重复
- [问题] 当天新建的条目必然同时有 created 和 updated 时间戳，会在两个板块各渲染一张一模一样的卡片，539 条更新里相当比例是重复信息，违反状态分类互斥原则。
- [证据] DailyActivity.tsx:126-139（两个索引独立取值，无差集）；规则 UX.DATA.001（分类必须穷举且互斥）。
- [建议] 「当天更新」板块过滤掉 `datekit(item.created) === 当天` 的条目，或卡片上标注「新建」徽标并允许用户关掉重复。

---

## P2 — 可用性与一致性问题

### 7. 每次渲染全量重排：539 条数据无 memo，排序/分组/取父节点每帧重跑
- [问题] `ActivityReadingComp` 渲染体里对全部条目建 Map 分组、排序、逐条 `getItem` 取父节点拼摘录，没有任何 `useMemo`；列表越长输入越卡，且父组件每次状态变化都全量重算。
- [证据] DailyActivity.tsx:30-59。
- [建议] 用 `useMemo(() => buildGroups(items), [items, pickTime])` 包住分组与摘录计算。

### 8. 「展开全部/收起」按钮文案与状态可能同时出现两个、且展开态没有数量反馈
- [问题] 展开后若 `entries.length > COLLAPSED_COUNT` 显示收起按钮，逻辑本身对；但 `expanded === true` 时 `hidden` 恒为 0、展开按钮消失，两个按钮互斥靠两段独立条件维护，中间态脆弱。且收起后视口停留在原处，内容突然缩短，视线落点跳变。
- [证据] DailyActivity.tsx:97-114；规则 UX.SMOOTH.001（状态切换视线落点不变）。
- [建议] 合并为一个 toggle 按钮（`expanded ? collapse : expand`）；展开/收起后如需滚动补偿，记录触发前 `getBoundingClientRect()` 并在渲染后复位。

### 9. 卡片可点击跳转依赖 `source.topic || plainText(source)`，无主题的条目点击可能空跳
- [问题] 分组时 `citation.isTopic || citation.topic` 不满足就回退到父主题，再回退到 citation 自身（第 36-39 行）；点击时 `route(source.topic || plainText(source))`——若该条目既无 topic 属性、plainText 又为空（如纯附件节点），点击无效果且无反馈。
- [证据] DailyActivity.tsx:36-39, 86-88。
- [建议] 分组阶段对不可路由的 source 降级为不可点（渲染 span 而非 button），或点击时给出空态提示。

### 10. 网格行间距为 0，行与行只靠每张卡片自己的 `margin-top: 8px` 撑开
- [问题] `.backlink-reading-grid` 用 `gap: 0 16px`（行间距 0），行距实际由 `.backlink-reading-entry { margin-top: 8px }` 提供。这是规则 UX.LAYOUT.003 点名的反模式：间距归属错位——一旦某个板块单独被挂到别的容器、或卡片末行/首行状态变化（如展开动画），间距就不成立；8px 也不在设计档位（8/16/24 中 8 虽在档位内，但网格间距与列间距 16px 不一致，视觉上行松列紧不均衡）。
- [证据] prefix.css:22-27, 37；规则 UX.LAYOUT.003。
- [建议] 改为 `gap: 12px 16px`（或项目档位内的行/列距），删除卡片的 `margin-top`。

### 11. 网格负外边距 `margin: 0 -8px` 使卡片溢出容器内边距，与外层 16px padding 打架
- [问题] 容器 padding 16px，网格 `margin: 0 -8px` 向两侧各溢出 8px，卡片左右实际只剩 8px 呼吸空间；截图右侧卡片边框直接被视口裁切（可能叠加了更外层布局问题，但此负 margin 是本模块自己引入的错位源）。
- [证据] prefix.css:4, 26；screenshot.jpg 右缘卡片边框被切。
- [建议] 去掉负 margin；若是为了对齐某个 8px 栅格，应在注释里写明对齐对象，否则删。

### 12. 键盘焦点样式缺失：focus 时只有 background 过渡，无可见焦点环依赖浏览器默认
- [问题] `.backlink-reading-entry` / `.backlink-reading-toggle` 重置了 `border: 0 / none; background: transparent`，却未定义 `:focus-visible` 样式；如果全局有 outline 重置（本仓 workspace-theme 曾有类似 reset），键盘用户找不到焦点在哪。
- [证据] prefix.css:28-47, 69-79；规则 UX.DECISION.005（键盘可达）。
- [建议] 显式补 `:focus-visible { outline: 2px solid var(--nk-accent); outline-offset: -2px }`。

---

## P3 — 打磨项

### 13. 标题行可点但没有 pointer 光标，折叠可供性弱
- [证据] prefix.css:9-15，`h2` 未设 `cursor: pointer`（截图里光标停在标题上无任何提示）。
- [建议] `.backlink-reading-head { cursor: pointer }`，修复第 4 条时一并处理。

### 14. 计数展示语义不明：「219」是主题数还是条目数
- [问题] 标题旁数字是 `groups.size`（主题分组数），但用户看到「当天创建 219」大概率理解为"创建了 219 条笔记"；两者可能差数倍。
- [证据] DailyActivity.tsx:77。
- [建议] 文案区分：「219 个主题」或同时给条目数。

### 15. 空态直接 `return null`，板块整体消失，用户失去"今天没动静"的确认
- [证据] DailyActivity.tsx:45, 216。折叠板块尚有标题在，空态则整块蒸发，与折叠态视觉上无法区分"没数据"和"没加载"。
- [建议] 空态渲染标题 + 「今天暂无动态」一行灰字（规则 UX.LOADING.001 的占位精神）。

### 16. 附加元数据陈旧
- [问题] `addonInfo().updated: 20221109`、`defaultValue: 'off'`——组件已多轮迭代（OP-047），元数据未跟随；`addonRun` 留空壳注释。
- [证据] DailyActivity.tsx:159-168, 196-198。
- [建议] 更新 `updated` 字段；空壳删除或补真实初始化。

---

## 汇总

| 严重度 | 条目 |
| --- | --- |
| P0 | #1 Hooks 条件调用；#2 索引守卫缺失 |
| P1 | #3 展开状态/箭头失效；#4 折叠不可键盘操作；#5 摘录换行失效；#6 创建/更新板块内容重复 |
| P2 | #7 无 memo 全量重排；#8 toggle 按钮脆弱+视口跳变；#9 空主题点击空跳；#10 网格间距归属错位；#11 负 margin 溢出；#12 焦点样式缺失 |
| P3 | #13 pointer 缺失；#14 计数语义；#15 空态蒸发；#16 元数据陈旧 |

规则应用情况：UX.DECISION.005（键盘可达）、UX.SMOOTH.001（状态切换视线）、UX.DATA.001（互斥）、UX.LAYOUT.003（间距归属）、UX.VISUAL.001/004（视觉克制核查通过，本模块无 AI 味装饰）。
