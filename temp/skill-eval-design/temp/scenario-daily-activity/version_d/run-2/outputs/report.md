# Design Review: 每日动态（DailyActivity）UI 模块

**Date**: 2026-10-08
**方法**: 按 design-review 技能（layout/typography/colour/hierarchy/component/interaction/responsive 七维）走查，材料为 screenshot.jpg + DailyActivity.tsx + prefix.css（离线走查，无法实测 dark mode 与多宽度）。
**Overall Impression**: 信息架构清晰（分组→卡片→摘录），但整体偏「开发者气质」：交互反馈缺失、状态可视性差、存在一处会直接导致运行时崩溃的 React 规则违例，以及多处贴合并留白失控。

---

## Findings（按严重度排序）

### High

#### 1. React Hooks 条件调用——提前 return 后才调用 useState，状态会跨条件错乱甚至崩溃
- **[问题]** `ActivityReadingComp` 在第 45 行 `if (!groups.size) return null` 之后才调用 `React.useState`（第 62、64 行）。一旦同一组件实例的 items 从空变为非空（例如折叠日期后数据异步到达、切换日期），Hook 调用数量在两次渲染间不一致，违反 Rules of Hooks，轻则状态串位，重则直接抛错白屏。
- **[证据]** DailyActivity.tsx:45（return null）vs :62-64（useState）。另外 `withActivityReading` 外层还有一层 `isEmpty(items) → null`（:216），同一挂载点会在「渲染 0 个 Hook 的组件」与「渲染 2 个 Hook 的组件」间切换，放大触发概率。
- **[建议]** 把两个 useState 移到函数最顶部（所有提前 return 之前）；或把空态判断改为渲染层面（`if (!groups.size) return <section hidden />` 不推荐）——最简单是所有 Hook 前置。

#### 2. 可点击卡片没有任何 hover / focus-visible 反馈，键盘焦点不可见
- **[问题]** `.backlink-reading-entry` 是承载唯一主操作（跳转来源主题）的 `<button>`，但 prefix.css 里没有 `:hover`、`:focus-visible`、`:active` 任何一条规则——鼠标悬停无反馈、Tab 聚焦无焦点环，用户无法知道卡片可点，键盘用户完全失去位置感。唯一的 `transition: background-color 100ms` 因没有 hover 目标而形同虚设。
- **[证据]** prefix.css:28-47（entry 规则块内无伪类）；grep 全文件无 `hover`/`focus`。
- **[建议]** 补 `.backlink-reading-entry:hover { background: var(--nk-hover, rgba(0,0,0,.04)) }` 与 `:focus-visible { outline: 2px solid var(--nk-accent); outline-offset: -2px }`；transition 放宽到 150ms ease。

#### 3. 相邻模块零间距贴合——「当天创建」与「当天更新」两个板块边框直接相接
- **[问题]** 截图中两个板块卡片上下边框贴合，视觉上糊成一个双线块，分不清是两个独立模块还是一张破损的卡片。这属于技能定义的 High（看起来像渲染坏了）。
- **[证据]** screenshot.jpg：两个灰框在 y≈430 处边框直接相接；组件里两个板块（Created / Updated）只是先后 `addMoreComponent`，prefix.css 的 `.backlink-reading` 只有自身 padding，模块间垂直间距依赖外部布局，未保证非零。
- **[建议]** 在容器层面给连续 `.backlink-reading` 之间 16px（一个 DESIGN 档位）间距，如 `.backlink-reading + .backlink-reading { margin-top: 16px }`，或由父布局统一 `gap`。

#### 4. 空内容条目仍渲染成孤零零的项目符号
- **[问题]** 截图第二个 bullet 只有一个圆点、无任何文字。空文本的 citation 没有被过滤，渲染出一个可交互列表项的空壳——用户会以为是 bug 或「可点的隐形条目」。
- **[证据]** screenshot.jpg y≈233 处空圆点；代码 :34-35 只用 `isEmpty(citation)`（判对象），:50-57 组摘录时 `plainText(citation)` 可返回空串，未按「整条摘录为空则不渲染该 citation」过滤。
- **[建议]** 在构建 excerpts 时过滤掉 join 后为空的条目；若某卡片 excerpts 全空则跳过该 citation，避免空 bullet 与空卡片。

### Medium

#### 5. 折叠箭头（caret）无任何样式与状态表现，开合无视觉区分
- **[问题]** `<span className="backlink-reading-caret" data-open>` 输出字符「▸」，但 prefix.css 完全没有 `.backlink-reading-caret` 规则——`data-open` 属性没有任何对应样式，箭头展开/收起时不旋转、不变色，模块收起与展开状态只能靠内容消失来猜。
- **[证据]** DailyActivity.tsx:74-76；prefix.css 全文件无 caret 规则。
- **[建议]** 补 `.backlink-reading-caret { display:inline-block; transition: transform 150ms }` + `[data-open="true"] { transform: rotate(90deg) }`。

#### 6. 多段摘录用 '\n' 拼接但容器不保留换行，全部挤成一行
- **[问题]** 代码用 `excerpts.join('\n')` 拼多条摘录，但 `.backlink-reading-excerpt` 没有 `white-space: pre-line`，换行符在 span 中被折叠为空格——同主题多条动态混在一起无法区分，排版意图完全落空。
- **[证据]** DailyActivity.tsx:93（join('\n')）；prefix.css:58-68（无 white-space）。
- **[建议]** 给 `.backlink-reading-excerpt` 加 `white-space: pre-line;`；或改为每条摘录一个子元素、用 margin 分隔。

#### 7. 行 clamp 截断无 ellipsis 之外的补救——标题/摘录截断后看不到全文，也无 title 提示
- **[问题]** 标题 `-webkit-line-clamp: 2`、摘录 `-webkit-line-clamp: 4` 截断后，没有任何 `title` 属性或展开手段看到完整内容。按技能标准「truncates with ellipsis, title attribute shows full text」不达标（ellipsis 有、title 无）。
- **[证据]** prefix.css:50-57、:60-67；DailyActivity.tsx:90-93 无 title 属性。
- **[建议]** 在 button 上加 `title={source.topic || plainText(source) + '\n' + excerpts.join('\n')}`；长摘录可考虑「点击卡片跳转」作为已有补救并在报告中注明。

#### 8. 板块收起后没有任何「已收起」的可发现性，且 h2 点击目标不可键盘触达
- **[问题]** 折叠整个模块的交互挂在 `<h2 onClick>` 上：无 `role="button"`、无 `tabIndex`、无 `aria-expanded`、无 `onKeyDown`——键盘用户无法收起/展开板块，屏幕阅读器也不知道这是可折叠控件。收起态只剩标题行，新用户看不出还能展开。
- **[证据]** DailyActivity.tsx:70-78。
- **[建议]** h2 内套一个真正的 `<button aria-expanded={sectionOpen}>` 承载点击；保留 h2 为纯文本标题。

#### 9. 页面级留白失控：日期大标题与第一条内容之间出现约 100px 的无意义空白
- **[问题]** 截图顶部「2026-10-08」标题与 bullet 列表之间有一大段空带，而标题区与板块之间的间距又远小于它——垂直节奏没有统一刻度，看起来像「内容被抽走后留下的洞」。
- **[证据]** screenshot.jpg y≈60–160 的空带；prefix.css 中无页头/列表相关间距规则可约束。
- **[建议]** 用 8px 系刻度（如标题下 24px）固定页头与首个内容块的间距；排查该空隙是否来自空态组件占位。

#### 10. 分组计数与实际展示脱节：标题写 219 / 539，默认只给 12 张卡片
- **[问题]** 标题计数显示全量分组数（groups.size），但默认只渲染前 12 张且「展开全部」是文字小链接——用户第一眼读到的信息层级是「219 个主题」，实际视野里只有 12 张，认知与视觉不一致；且折叠前无法判断剩余内容的重要性。
- **[证据]** DailyActivity.tsx:61（COLLAPSED_COUNT=12）、:77（`<span>{groups.size}</span>`）；screenshot.jpg 中 219 / 539 计数。
- **[建议]** 计数旁加「显示前 12 个」的微文案（如「219 · 显示 12」），或把展开按钮做成次级按钮样式而不是 12px 灰字链接。

### Low

#### 11. 字号层级过密：板块标题 14px 与卡片标题 13px 仅差 1px，squint test 无主次
- **[问题]** h2 14px/600 与卡片 title 13px/400 视觉重量几乎相同，页面缺乏明确的层级跳变；整页最重要的「日期」反而在截图里是唯一有层级的元素。
- **[证据]** prefix.css:12（14px）与 :54（13px）。
- **[建议]** 板块标题维持 14px，卡片标题可降到 13px 但加 500 字重或用主题色区分；或把板块标题提到 15-16px 拉开档位。

#### 12. muted 色文本 12px 存在对比度风险（无法在本走查中实测 token 值）
- **[问题]** 摘录、计数、展开按钮都用 `var(--nk-muted)` 且 12px；若 muted 是常见的中灰（如 #999 量级），在浅底上不满足 WCAG AA 4.5:1。本走查无运行环境，只能标记风险。
- **[证据]** prefix.css:18、:65、:75（含回退 #666，回退值尚可，但真实 token 未知）。
- **[建议]** 实测 `--nk-muted` 在 `--nk-canvas` 上的对比度；不达标则正文类 muted 至少提到 4.5:1 的灰阶。

#### 13. 图标/符号用文本字符「▸」而非图标字体，跨平台渲染大小不一
- **[问题]** caret 用裸 Unicode 字符，不同系统字体的三角形大小、基线、颜色权重不一致，且无法精细控制。
- **[证据]** DailyActivity.tsx:75。
- **[建议]** 换成项目图标库的 chevron 图标，或统一用 CSS 画三角/SVG。

#### 14. 同 ky key 冲突风险：source 回退 citation 自身时可能重复 key
- **[问题]** :39 回退 `?? citation` 后，多条无法解析来源的 citation 若 ky 相同（或索引里同一条被建/更两个板块重复收录），`key={source.ky}` 会产生重复 key 告警与渲染异常。
- **[证据]** DailyActivity.tsx:36-43、:84。
- **[建议]** key 改为 `source.ky + '#' + group.citations[0]?.ky` 之类的稳定组合，或分组时按 ky 去重。

---

## What Looks Good（应保留）
- 卡片网格 `repeat(auto-fill, minmax(220px, 1fr))` 自适应，窄容器不破版。
- 摘录用 line-clamp 控制卡片高度，列表不失控。
- 无内容返回 null 不渲染空板块，符合「不留空卡」原则。
- 量大默认折叠 + 可展开的意识（OP-047）方向正确，只是呈现层细节欠打磨。
- 色彩全部走语义 token（--nk-*），没有硬编码彩色。

## Top 3 Fixes
1. **把 useState 移到提前 return 之前**（#1）——这是会崩溃的正确性问题，任何视觉打磨之前先修。
2. **补齐卡片的 hover / focus-visible 与 caret 旋转**（#2、#5）——几行 CSS，直接把「看起来能点」的反馈补上，视觉收益最大。
3. **模块之间加 16px 间距 + 消灭空 bullet**（#3、#4）——消除截图里最扎眼的两处「看起来坏了」。
