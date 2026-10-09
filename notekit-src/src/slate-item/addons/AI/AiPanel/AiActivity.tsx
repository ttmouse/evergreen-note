/**
 * 活动轨道（ActivityTrack）—— 参考 Alma 桌面端的折叠模型。
 *
 * 四层：
 *   ① 头像轨道  最多 8 个相位头像，溢出的收成 +N 胶囊
 *   ② 活标签    当前相位的「动词 + 计数」，流式时扫光
 *   ③ 展开体    live → 卡片堆（最多 3 层错位叠放）；settled → 点开是竖线时间线
 *   ④ 呼吸行    2×4 点阵 + 文字，只在「没有活相位」时露出来
 *
 * 全部内联样式 + 一份局部 CSS（不引入 Tailwind）；图标统一用项目的 SvgIcon。
 */
import React, { useLayoutEffect, useRef, useState } from 'react'
import { SvgIcon, type SvgIconName } from '../../../../components/SvgIcon'
import {
  type Phase,
  type ToolItem,
  MAX_VISIBLE_PHASES,
  allThinking,
  countUnits,
  PHASE_NOUN,
  phaseLabel,
  phaseSettled,
  rowForTool,
} from './phases'

const ink = 'var(--nk-ink)'
const muted = 'var(--nk-muted)'
const line = 'var(--nk-line)'
const surface = 'var(--nk-surface)'
const canvas = 'var(--nk-canvas)'
const accent = 'var(--nk-accent)'
const amber = '#febc2e'
const red = '#d9534f'

// ------------------------------------------------------------------ 相位图标

// 相位头像的图标 —— 原先是手写 <path>，跟项目其它图标不是同一套字形/字重。
const PHASE_ICON: Record<Phase['kind'], SvgIconName> = {
  thinking: 'svg_magic', // MagicWand
  exploring: 'svg_search', // MagnifyingGlass
  making: 'svg_edit', // PencilSimple
  running: 'svg_code', // Code
  generic: 'svg_more', // DotsThree
}

const PhaseIcon = ({ kind }: { kind: Phase['kind'] }) => <SvgIcon name={PHASE_ICON[kind] || 'svg_more'} width={12} />

// ------------------------------------------------------------------ 局部 CSS

export const AI_ACTIVITY_CSS = `
/* 活相位头像：1.6s 呼吸环（内圈那 2px 是「背景色描边」，重叠才干净） */
.nk-av-alive { animation: nkAvBreathe 1.6s ease-in-out infinite; }
@keyframes nkAvBreathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(148,163,184,.35), 0 0 0 2px ${surface}; }
  50%      { box-shadow: 0 0 0 4px rgba(148,163,184,.12), 0 0 0 2px ${surface}; }
}

/* 活标签扫光 */
.nk-shimmer {
  color: transparent;
  -webkit-text-fill-color: transparent;
  background-image: linear-gradient(90deg, ${muted} 0%, ${muted} 38%, ${ink} 50%, ${muted} 62%, ${muted} 100%);
  background-size: 220% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  animation: nkShimmer 1.8s linear infinite;
}
/* ⚠️ 位置必须留在 0%→100% 之内。
   background-clip:text 下字的可见性 = 渐变有没有铺到它；
   百分比位置把渐变**推出容器**时，没被铺到的那段字是**透明的**（看着像被白块盖住，
   其实是字没了露出底色）。旧版用 130% / -130%，半程里整条标签会消失。
   0%→100% 恒覆盖：图宽 2.2W、左边界 -1.2XW，X≥0 保证左边、X≤1 保证右边。 */
@keyframes nkShimmer {
  from { background-position: 0% 0; }
  to   { background-position: 100% 0; }
}

/* 呼吸行：2×4 点阵 */
.nk-dotgrid {
  display: inline-grid;
  grid-template-columns: repeat(2, 2px);
  grid-auto-rows: 2px;
  gap: 1.5px;
}
.nk-dotgrid > i {
  width: 2px; height: 2px; border-radius: .5px;
  background: currentColor; opacity: .9;
  animation: nkDotBlink 2s ease-in-out infinite;
}
@keyframes nkDotBlink { 0%, 100% { opacity: .9; } 50% { opacity: .35; } }

/* 卡片堆：新卡入场 */
.nk-deck-deal { animation: nkDeckDeal .28s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes nkDeckDeal { from { transform: translateY(8px); } to { transform: none; } }

/* 行 hover */
.nk-arow:hover { background: var(--nk-hover); }

/* ⚠️ 对齐 Alma：箭头默认**不可见**，悬停标题行或展开时才现。
   Alma 原码：railOpen ? "rotate-180 opacity-100" : "opacity-0 group-hover/ahdr:opacity-100" */
.nk-chev { opacity: 0; transition: opacity .15s ease, transform .15s ease; }
.nk-arow:hover .nk-chev, .nk-chev.on { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .nk-av-alive, .nk-shimmer, .nk-dotgrid > i, .nk-deck-deal { animation: none; }
  .nk-shimmer { color: ${muted}; -webkit-text-fill-color: currentColor; background: none; }
}
`

export const ActivityOrb = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, color: muted }}>
    <span className="nk-dotgrid">
      {Array.from({ length: 8 }, (_, i) => {
        // 2 列 × 4 行，按列优先行进，逐格延迟 0.25s —— 斜向走一遍
        const travel = (i % 2) * 4 + Math.floor(i / 2)
        return <i key={i} style={{ animationDelay: `${travel * 0.25}s` }} />
      })}
    </span>
    <span className="nk-shimmer" style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
  </div>
)

// ------------------------------------------------------------------ 一行

const ToolRow = ({
  it,
  open,
  onToggle,
}: {
  it: ToolItem
  open: boolean
  onToggle: () => void
}) => {
  const row = rowForTool(it)
  const locs = Array.isArray(it.locations) ? (it.locations as any[]) : []
  // rawInput 也当明细：没有 locations 的工具（如 bash）原本点不动、点开也空，
  // 看起来就是「框架有了但里面是空的」。
  const rawText =
    it.rawInput && typeof it.rawInput === 'object' && Object.keys(it.rawInput as object).length
      ? JSON.stringify(it.rawInput, null, 2)
      : ''
  const canOpen = locs.length > 0 || !!rawText
  return (
    <div>
      <button
        type="button"
        onClick={canOpen ? onToggle : undefined}
        disabled={!canOpen}
        className={canOpen ? 'nk-arow' : undefined}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '2px 6px',
          margin: '0 -6px',
          borderRadius: 4,
          font: 'inherit',
          cursor: canOpen ? 'pointer' : 'default',
        }}
      >
        {row.running && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: amber,
              alignSelf: 'center',
              flexShrink: 0,
              animation: 'nkDotBlink 1.2s ease-in-out infinite',
            }}
          />
        )}
        {row.error && <span style={{ color: red, fontSize: 11, alignSelf: 'center', flexShrink: 0 }}>✕</span>}
        <span style={{ flexShrink: 0, fontWeight: 600, color: row.error ? red : ink, opacity: row.error ? 1 : 0.85 }}>
          {row.verb}
        </span>
        <span
          style={{
            color: row.error ? red : muted,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.object}
        </span>
        {canOpen && (
          <span style={{ flexShrink: 0, color: muted, opacity: open ? 1 : 0.5, display: 'flex', alignSelf: 'center', transform: open ? 'rotate(180deg)' : 'none' }}>
            <SvgIcon name="svg_fold" width={12} />
          </span>
        )}
      </button>
      {open && canOpen && (
        <div style={{ fontSize: 11, color: muted, padding: '2px 0 6px 12px', lineHeight: 1.7, wordBreak: 'break-all' }}>
          {locs.map((l, i) => (
            <div key={i}>{typeof l === 'string' ? l : l?.path || JSON.stringify(l)}</div>
          ))}
          {rawText && (
            <pre
              style={{
                margin: '4px 0 0',
                padding: '6px 8px',
                borderRadius: 5,
                border: `1px solid ${line}`,
                background: 'var(--nk-canvas)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                maxHeight: 220,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {rawText}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ 相位正文

const PhaseBody = ({
  phase,
  baseKey,
  openRows,
  toggleRow,
}: {
  phase: Phase
  baseKey: string
  openRows: Record<string, boolean>
  toggleRow: (k: string) => void
}) => (
  <>
    {phase.items.map((it, idx) => {
      const key = `${baseKey}-r${phase.startIndex}-${idx}`
      // 推理直接以弱化文字铺出来，**不折叠**（与 Alma 一致）。
      // 之前那版折成一行「它在想…（N 字）▸」是我自己加的，Alma 没有 —— 已于 2026-10-09 对齐。
      if (it.kind === 'thought') {
        return (
          <div
            key={key}
            style={{
              fontSize: 13,
              lineHeight: 1.85,
              color: muted,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              padding: '2px 0 6px',
            }}
          >
            {it.text}
          </div>
        )
      }
      return <ToolRow key={key} it={it} open={!!openRows[key]} onToggle={() => toggleRow(key)} />
    })}
  </>
)

// ------------------------------------------------------------------ 卡片堆

const DECK_PEEK = 12 // 后排卡片向上露出多少
const DECK_DEPTH = 3 // 最多几层

const Card = ({
  phase,
  depth,
  front,
  baseKey,
  openRows,
  toggleRow,
}: {
  phase: Phase
  depth: number
  front: boolean
  baseKey: string
  openRows: Record<string, boolean>
  toggleRow: (k: string) => void
}) => (
  <div
    className={front ? 'nk-deck-deal' : undefined}
    style={{
      position: front ? 'relative' : 'absolute',
      top: front ? undefined : DECK_PEEK - depth * 6,
      left: front ? undefined : depth * 12,
      right: front ? undefined : depth * 12,
      bottom: front ? undefined : depth * 6,
      borderRadius: 8,
      border: `1px solid ${line}`,
      background: front ? canvas : surface,
      padding: '6px 9px',
      overflow: 'hidden',
      zIndex: 100 - depth,
    }}
  >
    <PhaseBody phase={phase} baseKey={`${baseKey}-d${depth}`} openRows={openRows} toggleRow={toggleRow} />
  </div>
)

// ------------------------------------------------------------------ 轨道

export const AiActivityTrack = ({
  phases,
  live,
  trackKey,
}: {
  phases: Phase[]
  live: boolean
  trackKey: string
}) => {
  const [open, setOpen] = useState(false)
  const [timelineMode, setTimelineMode] = useState(true)
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [overflowHover, setOverflowHover] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingAnchor = useRef<number | null>(null)

  /**
   * 展开/收起会改变轨道**上方**的高度，不补偿画面就会跳。
   * 手法：状态变更前记下轨道顶边的视口坐标，渲染后（useLayoutEffect）把最近的滚动
   * 祖先的 scrollTop 补上差值 —— 轨道在屏幕上原地不动。（Alma 用同样的做法）
   */
  const anchorBefore = () => {
    pendingAnchor.current = rootRef.current?.getBoundingClientRect().top ?? null
  }

  useLayoutEffect(() => {
    const before = pendingAnchor.current
    if (before == null) return
    pendingAnchor.current = null
    const el = rootRef.current
    if (!el) return
    const delta = el.getBoundingClientRect().top - before
    if (!delta) return
    for (let p = el.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY
      if (oy === 'auto' || oy === 'scroll') {
        p.scrollTop += delta
        return
      }
    }
  })

  if (phases.length === 0) return null

  const toggleRow = (k: string) => setOpenRows((prev) => ({ ...prev, [k]: !prev[k] }))

  const lastIndex = phases.length - 1
  const hiddenCount = Math.max(0, phases.length - MAX_VISIBLE_PHASES)
  const stacked = phases.length > 1
  const overlap = hiddenCount > 12 ? -16 : -7
  const showDroplets = overflowHover && !live && hiddenCount > 0
  const railOpen = live || open || selected != null
  const openPhaseIndex = live ? lastIndex : selected
  const livePhase = live ? phases[lastIndex] : null
  // 对齐 Alma：扫光只在「相位确实还在跑」时挂；收敛后换成稳定文字（动词=正文色，余量=弱化色）
  const livePhaseActive = livePhase !== null && !phaseSettled(livePhase)

  const toggleRail = () => {
    anchorBefore()
    if (railOpen) {
      setOpen(false)
      setSelected(null)
    } else {
      setOpen(true)
      setTimelineMode(true)
    }
  }

  const avatarBase = (i: number, isOpen: boolean, isAlive: boolean): React.CSSProperties => ({
    position: 'relative',
    // App 有全局 button 样式（padding 1px 6px）。固定尺寸的圆头像不该有 padding：
    // border-box 下 padding 12 + border 2 会把 width:0 的盒子撑成 14px（实测）
    padding: 0,
    zIndex: isOpen || isAlive ? 50 : i + 1,
    height: 24,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: `1px solid ${isOpen ? 'var(--nk-line-strong)' : line}`,
    background: isOpen ? canvas : surface,
    color: isOpen ? ink : muted,
    cursor: live ? 'default' : 'pointer',
    boxShadow: isAlive ? undefined : stacked ? `0 0 0 2px ${surface}` : undefined,
  })

  // ---- 头像轨道
  const avatars: React.ReactNode[] = []
  if (hiddenCount > 0) {
    // 胶囊与水滴必须共用一个 hover 容器：胶囊塌到 0 宽后，光标会落到水滴上，
    // 若 hover 挂在胶囊自己身上就会 mouseleave → 重新展开 → 来回拉锯（实测抓到 maxWidth 停在 16px 抖动）。
    // Alma 的做法也是外面裹一层 span 接管 enter/leave。
    const overflowKids: React.ReactNode[] = []
    overflowKids.push(
      <button
        key="ovf"
        type="button"
        disabled={live}
        title={`更早的 ${hiddenCount} 个相位`}
        onFocus={() => setOverflowHover(true)}
        onBlur={() => setOverflowHover(false)}
        onClick={() => {
          anchorBefore()
          setOpen(true)
          setTimelineMode(true)
          setSelected(null)
        }}
        style={{
          position: 'relative',
          zIndex: hiddenCount + 2,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: 12,
          border: `1px solid ${showDroplets ? 'transparent' : line}`,
          background: surface,
          color: muted,
          fontSize: 10,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          cursor: live ? 'default' : 'pointer',
          boxShadow: showDroplets ? 'none' : `0 0 0 2px ${surface}`,
          maxWidth: showDroplets ? 0 : 56,
          padding: showDroplets ? 0 : '0 8px',
          opacity: showDroplets ? 0 : 1,
          transition: 'max-width .28s ease-out, padding .28s ease-out, opacity .22s, border-color .22s, box-shadow .22s',
        }}
      >
        +{hiddenCount}
      </button>,
    )
    // 悬停时胶囊塌成 0 宽，隐藏的相位逐个错峰挤出来（Alma 是 18ms 递进）
    for (let hi = 0; hi < hiddenCount; hi++) {
      const phase = phases[hi]
      const isOpen = openPhaseIndex === hi
      overflowKids.push(
        <button
          key={`dp-${hi}`}
          type="button"
          disabled={live}
          tabIndex={showDroplets ? 0 : -1}
          title={PHASE_NOUN[phase.kind]}
          onClick={() => {
            anchorBefore()
            setSelected((prev) => (prev === hi ? null : hi))
            setTimelineMode(false)
          }}
          style={{
            ...avatarBase(hi, isOpen, false),
            width: showDroplets ? 24 : 0,
            // 收起来时必须是**真的 0 宽**：0 宽的盒子仍会被 padding/border 撑开，
            // 留下 14px×N 的隐形占位把可见头像推开（实测踩到）
            minWidth: 0,
            borderWidth: showDroplets ? 1 : 0,
            marginLeft: showDroplets ? (hi === 0 ? 2 : overlap) : 0,
            opacity: showDroplets ? 1 : 0,
            overflow: 'hidden',
            pointerEvents: showDroplets ? 'auto' : 'none',
            transition: 'width .28s ease-out, margin .28s ease-out, opacity .22s, border-width .28s, border-color .15s, color .15s',
            transitionDelay: showDroplets ? `${hi * 18}ms` : `${(hiddenCount - hi) * 12}ms`,
          }}
        >
          <PhaseIcon kind={phase.kind} />
        </button>,
      )
    }
    avatars.push(
      <span
        key="ovf-group"
        style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
        onMouseEnter={() => !live && setOverflowHover(true)}
        onMouseLeave={() => setOverflowHover(false)}
      >
        {overflowKids}
      </span>,
    )
  }
  phases.slice(hiddenCount).forEach((phase, vi) => {
    const i = hiddenCount + vi
    const isOpen = openPhaseIndex === i
    const isAlive = live && i === lastIndex
    avatars.push(
      <button
        key={`av-${i}`}
        type="button"
        disabled={live}
        title={PHASE_NOUN[phase.kind]}
        onClick={() => {
          anchorBefore()
          setSelected((prev) => (prev === i ? null : i))
          setTimelineMode(false)
        }}
        style={{
          ...avatarBase(i, isOpen, isAlive),
          width: 24,
          marginLeft: vi === 0 && hiddenCount === 0 ? 0 : overlap,
        }}
        className={isAlive ? 'nk-av-alive' : undefined}
      >
        <PhaseIcon kind={phase.kind} />
      </button>,
    )
  })

  // ---- 标签
  const header =
    livePhase != null ? (
      (() => {
        const l = phaseLabel(livePhase, true)
        // 对齐 Alma：动词走正文色、余量走弱化色，两层嵌在**同一个**扫光容器里
        // （扫光在容器上，background-clip:text 会盖过子元素的颜色）
        return (
          <span
            className={livePhaseActive ? 'nk-shimmer' : undefined}
            style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
          >
            <span style={{ fontWeight: 600, color: ink }}>{l.verb}</span>
            {l.rest ? <span style={{ fontWeight: 400, color: muted }}>{' '}{l.rest}</span> : null}
          </span>
        )
      })()
    ) : (
      <>
        <button
          type="button"
          aria-expanded={railOpen}
          aria-label={railOpen ? '收起活动' : '展开活动'}
          onClick={toggleRail}
          className="nk-arow"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
            background: 'none',
            border: 'none',
            padding: '2px 5px',
            margin: '0 -5px',
            borderRadius: 4,
            font: 'inherit',
            fontSize: 13,
            color: ink,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {allThinking(phases) ? '已思考' : `用了 ${countUnits(phases)} 个工具`}
          </span>
          <span
            className={railOpen ? 'nk-chev on' : 'nk-chev'}
            style={{
              display: 'flex',
              color: muted,
              flexShrink: 0,
              transform: railOpen ? 'rotate(180deg)' : 'none',
            }}
          >
            <SvgIcon name="svg_fold" width={12} />
          </span>
        </button>
        {/* 时间线视图开关：全部相位 ↔ 只看一个（Alma 标题行右侧那个列表图标） */}
        {railOpen && phases.length > 1 && (
          <button
            type="button"
            aria-pressed={timelineMode}
            title={timelineMode ? '只看一个相位' : '时间线视图（全部相位）'}
            onClick={() => {
              anchorBefore()
              const next = !timelineMode
              setTimelineMode(next)
              setSelected(next ? null : lastIndex)
            }}
            className="nk-arow"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              flexShrink: 0,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              background: timelineMode ? canvas : 'transparent',
              color: timelineMode ? ink : muted,
            }}
          >
            <SvgIcon name="svg_list" width={12} />
          </button>
        )}
        <span style={{ flex: 1 }} />
      </>
    )

  // ---- 展开体
  let body: React.ReactNode = null
  if (railOpen && live) {
    // 卡片堆：一个相位一张卡，最后 DECK_DEPTH 张可见
    const top = lastIndex
    const deck: React.ReactNode[] = []
    for (let depth = Math.min(DECK_DEPTH - 1, top); depth >= 0; depth--) {
      const i = top - depth
      deck.push(
        <Card
          key={`card-${i}`}
          phase={phases[i]}
          depth={depth}
          front={depth === 0}
          baseKey={`${trackKey}-c${i}`}
          openRows={openRows}
          toggleRow={toggleRow}
        />,
      )
    }
    body = (
      <div style={{ position: 'relative', paddingTop: DECK_PEEK, marginTop: 2 }}>{deck}</div>
    )
  } else if (railOpen && (timelineMode || selected == null)) {
    // 时间线：竖线 + 缩进，全部相位
    body = (
      <div style={{ marginLeft: 11, paddingLeft: 16, borderLeft: `1px solid ${line}`, paddingTop: 6, paddingBottom: 2, marginTop: 4 }}>
        {phases.map((phase, i) => {
          const l = phaseLabel(phase, false)
          // 与 Alma 一致：时间线里**只有 thinking 相位**另起一行标签，
          // 其余相位的语义由各行自身的动词承担（「执行 bash」已经说明是执行相位了）。
          return (
            <div key={`tl-${i}`} style={{ marginBottom: 4 }}>
              {phase.kind === 'thinking' && (
                <div style={{ fontSize: 12, color: muted, fontWeight: 500 }}>
                  {l.verb}
                  {l.rest ? ` ${l.rest}` : ''}
                </div>
              )}
              <PhaseBody phase={phase} baseKey={`${trackKey}-tl${i}`} openRows={openRows} toggleRow={toggleRow} />
            </div>
          )
        })}
      </div>
    )
  } else if (railOpen && selected != null && phases[selected]) {
    // 单相位：只看一个（Alma：只有 thinking 相位在这里补一行标签）
    body = (
      <div style={{ marginLeft: 11, paddingLeft: 16, borderLeft: `1px solid ${line}`, paddingTop: 6, marginTop: 4 }}>
        {phases[selected].kind === 'thinking' && (
          <div style={{ fontSize: 12, color: muted, fontWeight: 500, marginBottom: 2 }}>
            {phaseLabel(phases[selected], false).verb}
          </div>
        )}
        <PhaseBody phase={phases[selected]} baseKey={`${trackKey}-sel${selected}`} openRows={openRows} toggleRow={toggleRow} />
      </div>
    )
  }

  return (
    <div ref={rootRef} style={{ minWidth: 260, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{avatars}</div>
        {header}
      </div>
      {body}
    </div>
  )
}

export default AiActivityTrack

