# 每日动态 UI 模块走查报告（echo-ux）

- 走查对象：`temp/fixtures/screenshot.jpg`、`DailyActivity.tsx`、`prefix.css`
- 方法：ec rules match 召回 9 条规则 → 截图 + 代码 + 样式三方对照分析
- 结论：共 12 条问题，按严重度排序如下

---

## P0 — 功能性缺陷（会崩溃 / 结果错误）

### 1. React Hooks 条件调用，组件会直接崩溃

[问题] `ActivityReadingComp` 在 `if (!groups.size) return null`（第 45 行）之后才调用 `React.useState`（第 62、64 行），违反 Hooks 规则；分组数在空与非空之间变化时触发「Rendered fewer hooks than expected」崩溃。

[证据] DailyActivity.tsx:45 提前 return；DailyActivity.tsx:62/64 `useState`。当天第一条动态出现/清空的瞬间即命中。这与本项目已知缺陷模式（Hooks 条件调用为代码级真 bug）一致。

[建议] 把两个 `useState` 移到组件最顶部（任何 return 之前），或将空态判断移到 `withActivityReading` 外层包装里（该层已经做了 `isEmpty(items) → null`，内层这个 return null 本身冗余，可直接删除）。

### 2. 标题计数与正文内容矛盾（截图可见 219/539 但无一张卡片）

[问题] 截图中「当天创建 219」「当天更新 539」两个板块正文区完全没有卡片，标题数字宣称有内容、正文却是空的，状态展示自相矛盾，用户无法判断是没加载、被折叠还是数据丢了。

[证据] screenshot.jpg：两个板块只显示标题行与计数，下方空白；代码 `sectionOpen` 默认 `true`（DailyActivity.tsx:64），`withActivityReading` 仅在 items 全空时返回 null——说明此时 sectionOpen 为真、items 非空，正文理应有 12 张卡片。违反 UX.DATA.001（状态穷举与诚实展示）。

[建议] 先查 `visible.map` 渲染链路（如 `$.dbMemory.getItem` 返回空导致 excerpts 全空、卡片高度塌缩为 0 被父容器 overflow 裁掉），并给卡片加最小可见性兜底；计数与内容不一致时宁可显示「加载中/暂无明细」占位，不能数字与空白并存。

### 3. 折叠指示器方向与实际状态不符

[问题] caret 字符固定为 `▸`（向右 = 收起），prefix.css 里没有任何针对 `data-open` 的旋转规则；`sectionOpen` 默认展开时指示器仍指向右，用户会误以为点开的是收起状态。

[证据] DailyActivity.tsx:74-76 写了 `data-open={String(sectionOpen)}` 说明本意是让 CSS 旋转，但 prefix.css 全文无 `data-open` 选择器；截图两个板块均为 `▸`。

[建议] 在 prefix.css 补 `.backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }` 并加 transition；或改用图标库的 chevron 组件，别用裸文本字符当图标（见问题 9）。

## P1 — 状态与交互缺陷

### 4. 折叠/展开状态跨日期残留

[问题] `expanded`、`sectionOpen` 两个 state 不随 `item`（日期）变化重置；用户在某天收起板块或展开全部后切到另一天，旧状态被沿用，与「看新一天」的预期不符。

[证据] DailyActivity.tsx:62-64 useState 无 key/reset 逻辑；`Comp` 以 `props.item` 为输入但从不响应其变化。

[建议] 给使用处加 `key={item.ky}`，或在组件内用「渲染期比较 + setState」模式在 item 变化时重置；最简单是父级 key 方案，无额外代码。

### 5. 相邻卡片行距为 0，靠卡片自身 margin-top 兜底

[问题] 网格 `gap: 0 16px`（行间距 0），行距全靠 `.backlink-reading-entry` 的 `margin-top: 8px` 补——间距不归属布局层，卡片被单独复用到别的容器时行距消失；且列距 16 / 行距 8 视觉不均。

[证据] prefix.css:25 `gap: 0 16px`；prefix.css:37 `margin-top: 8px`。命中 UX.LAYOUT.003（同级板块必须显式间距、走 8/16/24 档位、不靠父级顺带给出）。

[建议] 改为 `gap: 16px`（或 8px 统一），删除卡片的 `margin-top`；折叠切换后间距依然成立。

### 6. 多条摘录换行丢失，挤成一行

[问题] `excerpts.join('\n')` 用换行拼接多条摘录，但 `.backlink-reading-excerpt` 是普通 span，`\n` 不生效，多条动态连成一串「上下文 — 摘录 — 上下文 — 摘录」，无法分辨条数。

[证据] DailyActivity.tsx:93；prefix.css:58-68 无 `white-space: pre-line`。且 `-webkit-line-clamp: 4` 会把多行内容截断得更早，用户不知道被截掉了多少条。

[建议] excerpt 容器加 `white-space: pre-line`；更优做法是每条摘录独立成行元素并在超出时显示「还有 N 条」，把截断量诚实告知（UX.CONTEXT.001）。

### 7. 折叠标题行不可键盘操作、无可达性语义

[问题] 整个模块的折叠/展开只挂在 `<h2 onClick>` 上：无 `tabIndex`、无 Enter/Space 处理、无 `role="button"`/`aria-expanded`，键盘用户与读屏用户完全无法折叠板块；h2 内嵌可点击也不合语义。

[证据] DailyActivity.tsx:70-78。命中 UX.DECISION.005（键盘操作必须到位）的精神：关键控件不得只有指针路径。

[建议] 把标题行改为 `<button type="button" aria-expanded={sectionOpen} aria-controls={id}>` 包裹文本，caret 作为其子元素；或至少给 h2 加 tabIndex=0 与 keydown 处理。

### 8. 「展开全部/收起」按钮键盘焦点不可见

[问题] 两个 toggle 按钮都是 `background: transparent; border: none`，prefix.css 无 `:hover`/`:focus-visible` 样式，键盘 Tab 到这里没有任何视觉指示，用户不知道焦点在哪。

[证据] DailyActivity.tsx:97-114；prefix.css:69-79。

[建议] 补 `.backlink-reading-toggle:hover { background: var(--nk-hover); }` 与 `:focus-visible { outline: 2px solid var(--nk-focus); }`，卡片 entry 同样检查焦点可见性。

## P2 — 展示质量

### 9. 文本字符 `▸` 充当图标

[问题] 用裸 Unicode 字符 `▸` 做折叠指示，不同平台/字体渲染不一（有的显示为 emoji 风格或方块），且无法统一控制粗细与颜色。

[证据] DailyActivity.tsx:75。命中 UX.VISUAL.004/WORKFLOW.DOCS.003（应使用开源图标库而非字符/emoji 充当图标）。

[建议] 换成项目图标库的 chevron-right 图标，旋转逻辑不变。

### 10. 计数语义含糊：groups.size 是「分组数」不是「条目数」

[问题] 标题旁数字是按来源主题分组后的卡片数（`groups.size`），用户很可能理解成「当天创建了 219 条笔记」；两条口径差异在折叠场景（只显示 12 张卡）下进一步放大。

[证据] DailyActivity.tsx:77 `{groups.size}`；注释（206 行）也确认是分组计数。命中 UX.DATA.001（关键状态口径必须清楚）。

[建议] 文案区分「N 个主题 · M 条动态」，或 tooltip 说明口径；至少与折叠文案「展开全部 N 张」用同一口径。

### 11. 无主题的条目点击行为不可预期

[问题] `$.topic.route(source.topic || plainText(source))`：无 topic 属性的条目会把摘录纯文本当路由目标，可能触发一次全文搜索或跳到不存在的主题，点击结果不可预期且无反馈。

[证据] DailyActivity.tsx:87；分组逻辑（37-39 行）允许 `?? citation` 兜底出无 topic 的 source。

[建议] 无 topic 的条目降级为不可点击的 div（去掉 cursor: pointer），或点击后显式执行「以此文本搜索」并给出结果视图，不给静默失败路径。

## P3 — 代码与样式卫生

### 12. 死样式声明与私有前缀无兜底

[问题] `.backlink-reading` 声明了 `container-type: inline-size` 但全文没有任何 `@container` 查询，是死代码；截断用的是 `-webkit-line-clamp` 私有前缀（虽然 Chromium 系可用，但无标准 `line-clamp` 声明）。

[证据] prefix.css:3、50-52、60-62。

[建议] 删除 container-type 或补上真正响应卡片的 @container 规则；line-clamp 补标准属性声明。

### 附：性能备注（不单列问题）

- `getCreatedItems` 的 `isRecur: true` 深读取与分组、排序都在每次渲染同步执行（无 memo），539 条更新时每次状态切换（折叠/展开）全量重算；建议 `useMemo` 包住 entries 计算。
- `expanded` 后一次性渲染全部卡片，量级大时建议分段渲染或虚拟列表。

---

## 规则应用记录

- UX.DATA.001（状态穷举诚实展示）：pass —— 问题 2、10 的判据。
- UX.LAYOUT.003（同级显式间距）：pass —— 问题 5 的判据。
- UX.SMOOTH.001（状态指示一致）：pass —— 问题 3（caret 与状态不符）。
- UX.DECISION.005（键盘可达）：pass —— 问题 7、8。
- UX.VISUAL.004（禁字符图标）：pass —— 问题 9。
- UX.CONTEXT.001（诚实截断）：pass —— 问题 6。
- UX.VISUAL.001/005/006、ENG.*、PRD.*、WORKFLOW.DOCS.003：召回但未影响本次结论（模块整体视觉克制、无强调色滥用，未发现违反点）。
