# Design Review: 每日动态（DailyActivity）UI 模块

**Date**: 2026-10-08
**材料**: screenshot.jpg（当日页截图）+ DailyActivity.tsx + prefix.css
**方法**: 按 design-review 技能的 7 类检查项（布局间距 / 排版 / 颜色对比 / 视觉层级 / 组件一致性 / 交互态 / 响应式），截图与代码交叉验证。

## Overall Impression

整体是「能用但未打磨」的开发者审美：卡片网格的行间距、标题层级、折叠指示与空态处理都欠火候；另有一个会直接导致运行时报错的 React Hooks 结构性 bug。

## Findings（按严重度排序）

### High

**1. React Hooks 条件调用，运行时会崩溃**
- [问题] `ActivityReadingComp` 在 `useState` 之前有 `if (!groups.size) return null` 提前返回（DailyActivity.tsx:45 vs :62-64）。当某天数据从「有」变「无」（如切换日期、删除笔记），组件在同一挂载位置从「渲染 2 个 hook」变「渲染 0 个 hook」，触发 React "Rendered fewer hooks than expected" 错误，整个编辑器视图白屏。
- [证据] DailyActivity.tsx:45 `if (!groups.size) return null`；:62 `React.useState(false)`、:64 `React.useState(true)` 位于其后。
- [建议] 把两个 `useState` 移到函数最顶部（所有提前返回之前），或把空判断下沉到渲染处（`if (!groups.size) return null` 改为在 JSX 里条件渲染）。

**2. 卡片网格行间距为 0，相邻行卡片贴合**
- [问题] 网格 `gap: 0 16px` 行间距为 0，行距全靠每张卡片 `margin-top: 8px` 兜底。8px 的行距配上 hover 背景和 64px 最小高度，卡片行与行几乎贴死，与列间 16px 不对称，也违反本项目 DESIGN.md §5.2「相邻容器禁止 0 间距档位」的纪律；末行还会多出一个 8px 的底部多余边距，板块底部留白不对称。
- [证据] prefix.css:25 `gap: 0 16px`；:37 `margin-top: 8px`。截图无法展开验证（见问题 4），但代码路径确定。
- [建议] 改为 `gap: 8px 16px` 并删除 `margin-top: 8px`（或统一走 12px 档），让横纵向间距同档。

**3. 折叠箭头不随状态旋转，开/合外观无差异**
- [问题] 箭头字符 `▸` 只有 `data-open` 属性标记，prefix.css 里没有任何针对 `data-open` 的旋转/替换规则，展开与收起时箭头指向完全相同。截图里两个板块处于收起态，但箭头仍指向右侧偏下的同一形态——用户无法从箭头本身读出状态，只能靠「下面有没有内容」猜。
- [证据] DailyActivity.tsx:74-76 `data-open={String(sectionOpen)}` + 字面量 `▸`；prefix.css 全文无 `[data-open]` 规则。
- [建议] 补 CSS：`.backlink-reading-caret { display:inline-block; transition: transform 150ms ease; } .backlink-reading-caret[data-open="true"] { transform: rotate(90deg); }`。

**4. 板块标题折叠无键盘可达性，违反交互态检查**
- [问题] 折叠交互挂在 `<h2 onClick>` 上：h2 不可聚焦、无 `role="button"`、无 `aria-expanded`、无键盘事件，键盘用户完全无法折叠/展开板块；折叠状态也不向读屏器暴露。
- [证据] DailyActivity.tsx:70-78，`<h2 className="backlink-reading-head" onClick={...}>` 内部无 tab/role/aria 属性。
- [建议] 在 h2 内放一个真正的 `<button aria-expanded={sectionOpen} aria-controls={...}>` 包住标题文本与箭头，或给 h2 加 `tabIndex={0}` + `role="button"` + onKeyDown 处理 Enter/Space（前者更规范）。

### Medium

**5. 摘录内的换行符被 CSS 折叠，多条摘录黏成一团**
- [问题] 代码用 `excerpts.join('\n')` 分隔一条主题下的多条动态（DailyActivity.tsx:93），但 `.backlink-reading-excerpt` 没有设 `white-space: pre-line`，HTML 渲染时 `\n` 折叠为空格——同一主题的多条摘录、以及「上下文 — 摘录」的拼接串会连成一句不可分读的长文本，line-clamp 4 行截断后信息损失更大。
- [证据] DailyActivity.tsx:56 `[context, plainText(citation)].filter(Boolean).join(' — ')`、:93 `excerpts.join('\n')`；prefix.css:58-68 无 `white-space` 声明。
- [建议] 给 `.backlink-reading-excerpt` 加 `white-space: pre-line`；或改为每条摘录一个 `<span className="...-excerpt-line">`，用 `display:-webkit-box` 逐行钳制。

**6. 标题与摘录字重、字号层级过弱，眯眼测试失败**
- [问题] 卡片标题 13px/400，摘录 12px/400（prefix.css:54-56、66-67），仅 1px 字号差且字重相同；对比板块标题 14px/600，卡片内部没有可辨的层级。截图上「当天创建 219」标题是唯一有层级的元素，卡片本体灰度均一。
- [证据] prefix.css:48-57（title 13px / 400）、58-68（excerpt 12px / 400）。
- [建议] 标题提到 `font-weight: 600`（或 500）并保持 13px；摘录维持 12px/400，用字重而非字号建立层级。

**7. 截断无省略号语义，长标题/摘录被硬剪**
- [问题] 标题与摘录用 `-webkit-line-clamp` 截断，但 `<button>` 上没有 `title` 属性展示全文，`text-overflow` 也未声明——长主题名被剪掉后用户既看不到省略提示也无法悬停读全文。每日动态里长标题很常见（219 个创建项）。
- [证据] prefix.css:50-53、60-63 只有 line-clamp；DailyActivity.tsx:83-94 button 无 `title`。
- [建议] button 加 `title={source.topic || plainText(source)}`；如需更完整，摘录 `title` 给出 join 前的全文。

**8. 空 bullet 渲染：截图出现无文本的空列表项**
- [问题] 截图日期标题下第二个圆点没有任何文本。每日动态的上层列表把空/空白笔记也渲染成了条目，属于「空态未处理」——`withActivityReading` 里只 `filter(notEmpty)` 了传入项，但条目文本可能为纯空白（`isEmpty` 若只判 null/undefined 则放行空白串）。
- [证据] screenshot.jpg 第二个 bullet 无文字；DailyActivity.tsx:215 `filter(notEmpty)`；:47 `readingPlainText` 结果未做 trim 兜底。
- [建议] 在分组循环前加 `if (!plainText(citation).trim() && !citation.topic) continue`，或确认 `isEmpty` 对空白字符串的行为。

**9. 板块（模块卡片）之间的垂直间距与内部间距不同档**
- [问题] 截图中「当天创建」与「当天更新」两张板块卡片间距约 8–10px，而板块自身 padding 16px——外层节奏比内层紧，模块看起来像黏在一起的两张纸。板块间距应由上层布局提供统一档位（如 16px）。
- [证据] screenshot.jpg 两板块间隙明显小于板块内边距；prefix.css:4 板块 `padding: 16px`，片段内无板块间 margin（依赖外部，实际效果偏小）。
- [建议] 上层容器为 `.backlink-reading` 之间提供 ≥16px 的间距档；若间隙由别处样式给死，登记到 DESIGN.md 偏离清单。

**10. getUpdatedItems 与 getCreatedItems 防御不对称，存在崩溃路径**
- [问题] `getCreatedItems` 有 `typeof $.dbMemory.indexed.created === 'object'` 守卫，`getUpdatedItems` 直接 `date in $.dbMemory.indexed.updated`——索引未初始化时前者安全、后者抛 TypeError。这是组件一致性问题在代码层的体现（同一文件两种写法）。
- [证据] DailyActivity.tsx:126-139 两函数对比。
- [建议] `getUpdatedItems` 补同样的 `typeof` 守卫，或抽一个 `getIndexed(date, key)` 公用。

### Low

**11. 计数徽标裸露在 h2 里，无语义且易被误读为标题一部分**
- [问题] `{title} <span>{groups.size}</span>`（DailyActivity.tsx:77）把数量直接拼在标题文本流里，读屏会读成「当天创建 219」一个标题；视觉上 12px/400 的数字与 14px/600 标题基线对齐关系未处理（prefix.css 只给了 margin-left）。
- [证据] DailyActivity.tsx:77；prefix.css:16-21。
- [建议] 用 `<span className="backlink-reading-count" aria-label={`${groups.size} 条`}>` 并加 `vertical-align` 微调或改为 flex 对齐。

**12. 硬编码颜色兜底值绕过设计令牌**
- [问题] `.backlink-reading-toggle` 的 `color: var(--nk-muted, #666)`（prefix.css:75）：同文件其他规则兜底都指向令牌（`var(--nk-canvas)`、`var(--nk-ink)`），唯独这里兜底到裸十六进制值，令牌缺失时会出现一处离群灰色，暗色模式下 #666 对比也不达标。
- [证据] prefix.css:75 vs :5、:11、:42、:65。
- [建议] 兜底改为 `var(--nk-muted, var(--nk-ink))` 或与项目约定一致的令牌。

**13. 折叠按钮缺 hover/focus 反馈**
- [问题] `.backlink-reading-toggle` 只声明了 `cursor: pointer`，无 hover 背景与 `:focus-visible` 样式；卡片 entry 有 hover 过渡但片段内同样没有 `:focus-visible` 声明（若全局有则可忽略，片段无法证明）。键盘 focus 落在透明背景按钮上时几乎不可见。
- [证据] prefix.css:69-78、28-47。
- [建议] 补 `.backlink-reading-toggle:hover { background: var(--nk-hover); }` 与两条规则的 `:focus-visible { outline: 2px solid var(--nk-focus); outline-offset: 2px; }`。

**14. 网格负 margin 使 hover 背景越出内容对齐线**
- [问题] `.backlink-reading-grid { margin: 0 -8px }` 让卡片背景左边缘伸到 8px（prefix.css:26），而板块标题与正文对齐在 16px 内容线上；hover 时出现的背景块会向左突出 8px，破坏左对齐纪律。是为抵消 entry 自身 8px padding 的手法，但视觉副作用是悬停时内容「左跳」。
- [证据] prefix.css:26 与 :38（entry padding 8px）。
- [建议] 去掉负 margin，改为 entry `padding: 8px 8px` + `margin: 0 -8px` 只作用于列间距场景，或直接接受内容线即卡片背景线。

## What Looks Good

- 无内容返回 null 不渲染空板块（withActivityReading），空态纪律正确。
- 量大折叠（COLLAPSED_COUNT=12）+ 展开/收起双向按钮，渐进披露思路正确。
- 卡片用 `<button>` 承载整卡点击，语义比 div+onClick 好。
- line-clamp 限制标题 2 行/摘录 4 行，防止长文撑爆网格；`minmax(220px, 1fr)` 自适应列宽合理。
- 颜色基本走 `--nk-*` 令牌，跟随主题。

## Top 3 Fixes

1. 修复 Hooks 条件调用（问题 1）——唯一会直接白屏的缺陷。
2. 网格行间距 `gap: 8px 16px` + 箭头随 `data-open` 旋转（问题 2、3）——一次 CSS 改动解决「贴合」与「状态不可读」两个最扎眼的观感问题。
3. 摘录 `white-space: pre-line` + 卡片标题加字重与 `title` 提示（问题 5、6、7）——让截断的多条摘录恢复可读性并建立卡片内层级。
