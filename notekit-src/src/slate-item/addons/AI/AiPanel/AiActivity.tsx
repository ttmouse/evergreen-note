/**
 * 活动轨道（ActivityTrack）—— 参考 Alma 桌面端的折叠模型。
 *
 * 四层：
 *   ① 头像轨道  最多 8 个相位头像，溢出的收成 +N 胶囊
 *   ② 活标签    当前相位的「动词 + 计数」，流式时扫光
 *   ③ 展开体    live → 卡片堆（最多 3 层错位叠放）；settled → 点开是竖线时间线
 *   ④ 呼吸行    2×4 点阵 + 文字，只在「没有活相位」时露出来
 *
 * 全部内联样式 + 一份局部 CSS，不引入 Tailwind / 图标库。
 */
import React, { useState } from 'react'
import {
  type Phase,
  type Part,
  type ToolItem,
  MAX_VISIBLE_PHASES,
  allThinking,
  countUnits,
  phaseLabel,
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

const ICONS = {
  thinking: { circle: undefined as [number, number, number] | undefined, d: 'M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z' },
  exploring: { circle: [11, 11, 7] as [number, number, number], d: 'M20.5 20.5l-4.3-4.3' },
  making: { circle: undefined, d: 'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z' },
  running: { circle: undefined, d: 'M4 17l6-6-6-6M12 19h8' },
  generic: { circle: undefined, d: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.8-3.8a6 6 0 01-7.9 7.9l-6.9 6.9a2.1 2.1 0 01-3-3l6.9-6.9a6 6 0 017.9-7.9l-3.8 3.8z' },
}

const PhaseIcon = ({ kind }: { kind: Phase['kind'] }) => {
  const ico = ICONS[kind] || ICONS.generic
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // 头像按钮是 flex 容器，默认 flex-shrink 会把 12px 的图标压成 10px。
      style={{ flexShrink: 0, display: 'block' }}
    >
      {ico.circle && <circle cx={ico.circle[0]} cy={ico.circle[1]} r={ico.circle[2]} />}
      <path d={ico.d} />
    </svg>
  )
}

const Chevron = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0, display: 'block' }}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

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
@keyframes nkShimmer {
  from { background-position: 130% 0; }
  to   { background-position: -130% 0; }
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

@media (prefers-reduced-motion: reduce) {
  .nk-av-alive, .nk-shimmer, .nk-dotgrid > i, .nk-deck-deal { animation: none; }
  .nk-shimmer { color: ${muted}; -webkit-text-fill-color: currentColor; background: none; }
}
`

export const ActivityOrb = ({ label = '跟进中' }: { label?: string }) => (
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
  rowKey,
  open,
  onToggle,
}: {
  it: ToolItem
  rowKey: string
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
            <Chevron />
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
      if (it.kind === 'thought') {
        const key = `${baseKey}-r${phase.startIndex}-${idx}`
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggleRow(key)}
            className="nk-arow"
            style={{
              display: 'flex',
              gap: 6,
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              padding: '2px 6px',
              margin: '0 -6px',
              borderRadius: 4,
              font: 'inherit',
              cursor: 'pointer',
              color: muted,
              fontSize: 12,
            }}
          >
            <span style={{ flexShrink: 0 }}>
              它在想…（{it.text.length} 字）{openRows[key] ? ' ▾' : ' ▸'}
            </span>
          </button>
        )
      }
      const key = `${baseKey}-r${phase.startIndex}-${idx}`
      return <ToolRow key={key} it={it} rowKey={key} open={!!openRows[key]} onToggle={() => toggleRow(key)} />
    })}
    {phase.items
      .filter((it): it is Extract<Part, { kind: 'thought' }> => it.kind === 'thought')
      .map((it) => {
        const key = `${baseKey}-r${phase.startIndex}-${phase.items.indexOf(it)}`
        if (!openRows[key]) return null
        return (
          <div key={key + '-t'} style={{ fontSize: 12, color: muted, lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '2px 0 6px 12px' }}>
            {it.text}
          </div>
        )
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
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<number | null>(null)

  if (phases.length === 0) return null

  const toggleRow = (k: string) => setOpenRows((prev) => ({ ...prev, [k]: !prev[k] }))

  const lastIndex = phases.length - 1
  const hiddenCount = Math.max(0, phases.length - MAX_VISIBLE_PHASES)
  const stacked = phases.length > 1
  const railOpen = live || open
  const openPhaseIndex = live ? lastIndex : selected
  const livePhase = live ? phases[lastIndex] : null

  // ---- 头像轨道
  const avatars: React.ReactNode[] = []
  if (hiddenCount > 0) {
    avatars.push(
      <button
        key="ovf"
        type="button"
        disabled={live}
        title={`更早的 ${hiddenCount} 个相位`}
        onClick={() => {
          setOpen(true)
          setSelected(null)
        }}
        style={{
          position: 'relative',
          zIndex: hiddenCount + 2,
          height: 24,
          padding: '0 8px',
          borderRadius: 12,
          border: `1px solid ${line}`,
          background: surface,
          color: muted,
          fontSize: 10,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          cursor: live ? 'default' : 'pointer',
          boxShadow: `0 0 0 2px ${surface}`,
        }}
      >
        +{hiddenCount}
      </button>,
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
        title={phase.kind}
        onClick={() => {
          setSelected((prev) => (prev === i ? null : i))
          setOpen(false)
        }}
        style={{
          position: 'relative',
          zIndex: isOpen || isAlive ? 50 : vi + 1,
          width: 24,
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
          marginLeft: vi === 0 && hiddenCount === 0 ? 0 : -7,
          boxShadow: isAlive ? undefined : stacked ? `0 0 0 2px ${surface}` : undefined,
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
        return (
          <span className="nk-shimmer" style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.verb}
            {l.rest ? ` ${l.rest}` : ''}
          </span>
        )
      })()
    ) : (
      <button
        type="button"
        aria-expanded={railOpen}
        onClick={() => {
          setOpen((v) => !v)
          setSelected(null)
        }}
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
        <span style={{ display: 'flex', color: muted, flexShrink: 0, transform: railOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <Chevron />
        </span>
      </button>
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
      <div style={{ position: 'relative', paddingTop: DECK_PEEK, marginTop: 2 }}>
        <span style={{ position: 'absolute', right: 0, top: -6, fontSize: 10, color: muted, opacity: 0.7 }}>
          {phases.length > 1 ? `${phases.length} 个相位` : ''}
        </span>
        {deck}
      </div>
    )
  } else if (railOpen) {
    // 时间线：竖线 + 缩进，settled 之后点开看的就是这个
    body = (
      <div style={{ marginLeft: 11, paddingLeft: 16, borderLeft: `1px solid ${line}`, paddingTop: 6, paddingBottom: 2, marginTop: 4 }}>
        {phases.map((phase, i) => {
          const l = phaseLabel(phase, false)
          return (
            <div key={`tl-${i}`} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: muted, fontWeight: phase.kind === 'thinking' ? 500 : 400 }}>
                {l.verb}
                {l.rest ? ` ${l.rest}` : ''}
              </div>
              {phase.kind !== 'thinking' && (
                <PhaseBody
                  phase={phase}
                  baseKey={`${trackKey}-tl${i}`}
                  openRows={openRows}
                  toggleRow={toggleRow}
                />
              )}
            </div>
          )
        })}
      </div>
    )
  } else if (selected != null && phases[selected]) {
    // 单相位：只点开一个头像时
    body = (
      <div style={{ marginLeft: 11, paddingLeft: 16, borderLeft: `1px solid ${line}`, paddingTop: 6, marginTop: 4 }}>
        <PhaseBody
          phase={phases[selected]}
          baseKey={`${trackKey}-sel${selected}`}
          openRows={openRows}
          toggleRow={toggleRow}
        />
      </div>
    )
  }

  return (
    <div style={{ minWidth: 260, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{avatars}</div>
        {header}
        {!live && <span style={{ flex: 1 }} />}
      </div>
      {body}
    </div>
  )
}

export default AiActivityTrack
