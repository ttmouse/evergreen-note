import React, { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react'
import { marked } from 'marked'
import { useAddons } from '../../../hooks/useAddons'
import { aiPanelStore as S, NoteRef } from './AiPanelStore'
import { groupBlocks } from './phases'
import { AiActivityTrack, ActivityOrb, AI_ACTIVITY_CSS } from './AiActivity'
import { XIcon, ClockCounterClockwiseIcon, PlusIcon, CaretDoubleRightIcon, ArrowDownIcon, ArrowCounterClockwiseIcon, PaperPlaneTiltIcon, StopIcon } from '@phosphor-icons/react'

marked.setOptions({ gfm: true, breaks: true })

// AI 回复按 Markdown 渲染；顺带剥掉 script 与内联事件，防注入
const mdToHtml = (src: string): string => {
  const html = marked.parse(src, { async: false }) as string
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

/**
 * 正文的展开层。
 *
 * ACP 的 `agent_message_chunk` 是**整段提交**：实测一轮 582 字只发 1 个事件、跨度 0ms
 * （见 notes/AI侧边栏ACP接入方案-20261009.md §5），所以没有 token 流可以直接渲染。
 * 这一层负责把"整块到手"的文字按时间铺开，让它像流进来一样出现，而不是硬糊上去。
 *
 * 只对**刚到手**的正文展开（到手 2s 内）；历史回看、刷新重建的旧正文整段直出。
 * 同一块只展开一次（animatedAts 记在页面存活期内），减少动态效果设置下完全不动画。
 */
const animatedAts = new Set<number>()
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 展开时长随字数伸缩，夹在 220ms–1.5s：短答不拖，长答不让人等 */
const revealDuration = (chars: number) => Math.min(1500, Math.max(220, (chars / 700) * 1000))

const AiMarkdown = ({ text, at }: { text: string; at: number }) => {
  const [animate] = useState(() => {
    const on = !prefersReducedMotion() && !animatedAts.has(at) && Date.now() - at < 2000
    if (on) animatedAts.add(at)
    return on
  })
  const shownRef = useRef(animate ? 0 : text.length)
  const [shown, setShown] = useState(shownRef.current)
  const rafRef = useRef(0)

  useEffect(() => {
    const target = text.length
    // 不展开（历史回看 / 已追平）：直接给全量
    if (!animate || shownRef.current >= target) {
      if (shownRef.current !== target) {
        shownRef.current = target
        setShown(target)
      }
      return
    }
    const from = shownRef.current
    const dur = revealDuration(target - from)
    const t0 = performance.now()
    let lastCommit = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const n = from + Math.round((target - from) * p)
      // 长正文下别每帧都重排 markdown：约 30fps 提交一次，收尾那一帧必提交
      if (n !== shownRef.current && (p >= 1 || now - lastCommit >= 32)) {
        lastCommit = now
        shownRef.current = n
        setShown(n)
      }
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else if (shownRef.current !== target) {
        shownRef.current = target
        setShown(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [text, animate])

  return (
    <div
      className={animate ? 'ai-md' : 'ai-md nk-settle'}
      dangerouslySetInnerHTML={{ __html: mdToHtml(text.slice(0, shown)) }}
    />
  )
}

const ink = 'var(--nk-ink)'
const muted = 'var(--nk-muted)'
const line = 'var(--nk-line)'
const acc = 'var(--nk-accent)'

const AI_MD_CSS = `
.ai-md { font-size: 14px; line-height: 1.85; color: ${ink}; word-break: break-word; }
.ai-md > :first-child { margin-top: 0; }
.ai-md > :last-child { margin-bottom: 0; }
.ai-md h1, .ai-md h2, .ai-md h3, .ai-md h4 { font-size: 14px; line-height: 1.6; margin: 14px 0 6px; color: ${ink}; }
.ai-md h1 { font-size: 16px; }
.ai-md h2 { font-size: 15px; }
.ai-md p { margin: 6px 0; }
.ai-md ul, .ai-md ol { margin: 6px 0; padding-left: 20px; }
.ai-md li { margin: 2px 0; }
.ai-md blockquote { margin: 6px 0; padding-left: 10px; border-left: 2px solid ${line}; color: ${muted}; }
.ai-md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: var(--nk-canvas); border: 1px solid ${line}; border-radius: 4px; padding: 0 4px; }
.ai-md pre { margin: 8px 0; padding: 8px 10px; background: var(--nk-canvas); border: 1px solid ${line}; border-radius: 6px; overflow-x: auto; }
.ai-md pre code { background: none; border: none; padding: 0; }
.ai-md table { border-collapse: collapse; margin: 8px 0; font-size: 13px; }
.ai-md th, .ai-md td { border: 1px solid ${line}; padding: 4px 8px; text-align: left; }
.ai-md hr { border: none; border-top: 1px solid ${line}; margin: 12px 0; }
.ai-md a { color: ${acc}; }
.ai-md img { max-width: 100%; }

/* 正文落定：只用于**不展开**的那些（历史回看 / 刷新重建 / 已追平），让整块内容"落下来"
   而不是硬邦邦地糊上去。新到手的正文走 AiMarkdown 的展开层，见上方注释。 */
.ai-md.nk-settle { animation: nkSettle .3s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes nkSettle { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ai-md.nk-settle { animation: none; } }
`

export const AiPanelComp = observer(() => {
  const { extArea, editorView, app, dbMemory } = useAddons() as any
  const [draft, setDraft] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    S.connect()
    // 打开面板即确保会话就绪（懒启动，失败会进 error 行）
    S.ensureSession().catch(() => {})
  }, [])

  // 只在「本来就贴底」时跟随新内容。用户一旦往上滚，就不再抢滚动条。
  useEffect(() => {
    const el = bodyRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  })

  const jumpToBottom = () => {
    const el = bodyRef.current
    if (!el) return
    stickRef.current = true
    setAtBottom(true)
    el.scrollTop = el.scrollHeight
  }

  const currentNote = (): NoteRef => {
    try {
      const ky = editorView?.currentItemKy
      if (!ky) return null
      const node = dbMemory?.getItem(ky, { isRecur: false })
      return { ky, title: node?.ori ?? undefined }
    } catch {
      return null
    }
  }

  const send = async () => {
    const t = draft.trim()
    if (!t || S.busy) return
    setDraft('')
    await S.send(t, currentNote())
  }

  const fmtTime = (at: number) => {
    const d = new Date(at)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const dotColor = S.state === 'busy' ? acc : S.state === 'ready' ? '#28c840' : S.state === 'stopped' ? muted : '#febc2e'
  // 数据源接线（2026-10-09 19:3x，store 拥有者落地）：旧的 history/viewing「只读快照」已换成
  // 真会话列表 —— 每段对应 agent 侧一条 ACP 会话，切过去可以直接接着聊。
  // 仍然只做「读不到就当空」：面板宁可少一块，也不能整片白掉（18:44 的事故）。
  const convs: any[] = Array.isArray(S.list) ? S.list : []
  const activeConv: any = S.active ?? null
  const viewing: number | null = activeConv?.id ?? null
  // 当前不是在最新的那段上（列表按最近活动排序）→ 给一条横幅说明你在看哪一段
  const isOlder = convs.length > 1 && !!activeConv && convs[0]?.id !== activeConv.id
  // 当前这段是不是空的 —— 空段本来就是个新对话，再按「新对话」没有意义
  const canNewConv = (activeConv?.items?.length ?? 0) > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // 输入区必须永远钉在底部：根节点不许比宿主高、不许被内容顶开。
        // minHeight: 0 是 flex 子项的关键（min-height:auto 会让滚动区拒绝收缩），
        // overflow:hidden 是第二道闸 —— 宁可裁掉也不许把输入框推出视口。
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--nk-surface)',
      }}
    >
      <style>{AI_MD_CSS}{AI_ACTIVITY_CSS}</style>
      {/* 头 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, boxSizing: 'border-box', flexShrink: 0, padding: '0 12px', borderBottom: `1px solid ${line}`, fontSize: 12, color: muted, position: 'relative' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'block' }} />
        <span style={{ flex: 1 }} />
        <span title={S.agent || ''} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {S.agent || (S.connected ? '连接中…' : '未连接')}
        </span>
        <button
          onClick={() => setHistOpen((v) => !v)}
          title={`切换会话：点任意一段都能直接接着聊${convs.length > 1 ? `（共 ${convs.length} 段）` : ''}`}
          aria-label="历史会话"
          style={{
            border: 'none',
            background: 'none',
            color: histOpen || convs.length > 1 ? ink : muted,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: 2,
          }}
        >
          <ClockCounterClockwiseIcon size={14} weight={histOpen ? 'fill' : 'regular'} />
          {convs.length > 1 && <span style={{ fontSize: 10, lineHeight: 1 }}>{convs.length - 1}</span>}
        </button>
        {/* 「清空」的语义收窄：它从来不删除任何东西，实际是「收工 + 另起一段」，
            名字却读着像删除。换成名副其实的入口，并把空段的静默 no-op 变成明确禁用
            （原先在空白段上点，什么都不会发生 —— 那正是「没法新建对话」的由来）。 */}
        <button
          onClick={() => canNewConv && S.clear()}
          disabled={!canNewConv}
          title={canNewConv ? '新建对话：当前这段会留在历史里，另起一段空白的' : '当前已经是新对话了'}
          aria-label="新对话"
          style={{
            border: 'none',
            background: 'none',
            color: canNewConv ? ink : muted,
            opacity: canNewConv ? 1 : 0.4,
            cursor: canNewConv ? 'pointer' : 'default',
            display: 'inline-flex',
            alignItems: 'center',
            padding: 2,
          }}
        >
          <PlusIcon size={14} />
        </button>
        <button
          onClick={() => extArea?.foldup(true)}
          title="收起面板"
          aria-label="收起面板"
          style={{ border: 'none', background: 'none', color: muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: 2 }}
        >
          <CaretDoubleRightIcon size={14} />
        </button>

        {/* 历史下拉 */}
        {histOpen && (
          <div
            style={{
              position: 'absolute',
              top: 40,
              right: 8,
              zIndex: 20,
              width: 300,
              maxHeight: 320,
              overflowY: 'auto',
              background: 'var(--nk-surface)',
              border: `1px solid ${line}`,
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,.12)',
              padding: 4,
            }}
          >
            {convs.length <= 1 && (
              <div style={{ padding: '10px 8px', fontSize: 12, color: muted }}>
                还没有别的会话。点「＋ 新对话」会把当前这段留在列表里，另起一段空白的；每段各有自己的上下文，切过去可以直接接着聊。
              </div>
            )}
            {convs.map((c) => (
              <div
                key={c.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', color: viewing === c.id ? acc : ink }}
                onClick={() => {
                  S.switchTo(c.id)
                  setHistOpen(false)
                }}
              >
                <span style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap' }}>{fmtTime(c.at)}</span>
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.preview || '（新会话）'}</span>
                {S.isBusy(c) && <span title="它正在这一段里干活" style={{ width: 6, height: 6, borderRadius: '50%', background: acc, flexShrink: 0 }} />}
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    S.removeConversation(c.id)
                  }}
                  title="从列表里删掉这一段（agent 侧会话不动）"
                  style={{ display: 'inline-flex', alignItems: 'center', color: muted, padding: '0 4px' }}
                >
                  <XIcon size={11} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 较早会话横幅：只说清「你在看哪一段」+ 能继续聊，
          切换动作只留在「历史」那一个入口（Jobs 尺子：同一个动作两个入口是噪音）。 */}
      {isOlder && (
        <div style={{ flexShrink: 0, padding: '5px 12px', borderBottom: `1px solid ${line}`, fontSize: 12, color: muted }}>
          正在看较早的一段会话（{fmtTime(activeConv.at)}）· 可以直接接着聊
        </div>
      )}

      {/* 流水 */}
      <div
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          stickRef.current = near
          if (near !== atBottom) setAtBottom(near)
        }}
        style={{
          flex: '1 1 auto',
          minHeight: 0, // 同上：不给这一条，flex 子项会拒绝收缩，把输入区顶出面板
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {S.items.length === 0 && (
          <div style={{ color: muted, fontSize: 13, lineHeight: 1.9 }}>
            光标所在的那篇笔记，它看得见（靠 ky 自己用 ev 去读）。
            <br />
            说一句话开工：
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {['这篇笔记还缺什么', '查一下库里有没有同名主题', '把这段变成常青笔记'].map((q) => (
                <button
                  key={q}
                  onClick={() => S.send(q, currentNote())}
                  style={{ fontSize: 13, padding: '4px 11px', borderRadius: 14, border: `1px solid ${line}`, background: 'transparent', color: ink, cursor: 'pointer' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {(() => {
          // 连续的 thought+tool 折成一个活动轨道；其余（正文 / 权限 / 报错）原样流过。
          // 刻意不用 useMemo：Store 里的 items 是原地 push 的观察数组，
          // 引用不变会让 memo 永不失效 —— 每次渲染重算，几十条的量级可以忽略。
          const blocks = groupBlocks(S.displayItems)
          const lastIdx = blocks.length - 1
          const lastIsActivity = S.busy && lastIdx >= 0 && blocks[lastIdx].type === 'activity'
          return (
            <>
              {blocks.map((b, bi) => {
                if (b.type === 'activity')
                  return <AiActivityTrack key={b.key} trackKey={b.key} phases={b.phases} live={lastIsActivity && bi === lastIdx} />
                const it = b.item
                const i = b.i

                if (it.kind === 'user')
                  return (
                    <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '86%', background: 'var(--nk-hover)', borderRadius: 10, padding: '6px 10px', fontSize: 14, color: ink, lineHeight: 1.7 }}>
                      {it.text}
                    </div>
                  )

                if (it.kind === 'text') return <AiMarkdown key={`t${it.at}`} text={it.text} at={it.at} />

                if (it.kind === 'permission')
                  return (
              <div key={i} style={{ border: `1px solid var(--nk-line-strong)`, borderRadius: 6, padding: 10, background: 'var(--nk-warn-soft, rgba(163,106,0,.08))' }}>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: ink, marginBottom: 8 }}>
                  它请求权限：<b>{(it.toolCall as any)?.title || (it.toolCall as any)?.kind || '未知操作'}</b>
                </div>
                {it.decided ? (
                  <div style={{ fontSize: 12, color: muted }}>已处理：{it.decided}</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => S.answer(it.requestId, 'allow')} style={{ fontSize: 13, padding: '3px 12px', borderRadius: 5, border: 'none', background: ink, color: 'var(--nk-surface)', cursor: 'pointer', fontWeight: 600 }}>
                      允许一次
                    </button>
                    <button onClick={() => S.answer(it.requestId, 'always')} style={{ fontSize: 13, padding: '3px 12px', borderRadius: 5, border: `1px solid ${line}`, background: 'var(--nk-surface)', color: ink, cursor: 'pointer' }}>
                      总是允许
                    </button>
                    <button onClick={() => S.answer(it.requestId, 'deny')} style={{ fontSize: 13, padding: '3px 12px', borderRadius: 5, border: `1px solid ${line}`, background: 'var(--nk-surface)', color: ink, cursor: 'pointer' }}>
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            )

          if (it.kind === 'exit' || it.kind === 'error')
            return (
              <div key={i} style={{ border: `1px solid #d9534f`, borderRadius: 6, padding: 9, fontSize: 13, color: '#d9534f', lineHeight: 1.7 }}>
                {it.kind === 'exit' ? '进程已退出：' : '出错了：'}
                {it.text}
              </div>
            )

                return null
              })}
              {/* 活着但还没有活相位（比如正在出正文）—— 底部一行呼吸，别让面板看着卡住 */}
              {S.busy && !lastIsActivity && <ActivityOrb label="跟进中" />}
            </>
          )
        })()}
      </div>

      {/* 输入区：**永远可见、永远可输入**。
          历史已从「只读快照」改成真会话 —— 切到哪一段，发的话就进那一段自己的 ACP 会话，
          所以没有"回看时不能打字"这回事了（旧的两态一并删掉）。 */}
      <div style={{ borderTop: `1px solid ${line}`, padding: '8px 10px', flexShrink: 0 }}>
        {/* 离底了就给个明确出口，别让人靠反复滚找输入框 */}
        {!atBottom && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <button
              onClick={jumpToBottom}
              title="回到最新"
              aria-label="回到最新"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: 3,
                borderRadius: 12,
                border: `1px solid ${line}`,
                background: 'var(--nk-surface)',
                color: muted,
                cursor: 'pointer',
              }}
            >
              <ArrowDownIcon size={12} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={S.busy ? '它正在这一段里干活…（可点停止）' : '让它改这篇笔记，或问它点什么'}
            style={{ flex: 1, font: 'inherit', fontSize: 13, padding: '6px 10px', borderRadius: 6, border: `1px solid var(--nk-line-strong)`, background: 'var(--nk-canvas)', color: ink, outline: 'none' }}
          />
          {S.busy ? (
            <button
              onClick={() => S.cancel()}
              title="停止"
              aria-label="停止"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 6,
                border: `1px solid ${line}`,
                background: 'var(--nk-surface)',
                color: ink,
                cursor: 'pointer',
              }}
            >
              <StopIcon size={13} />
            </button>
          ) : (
            <button
              onClick={send}
              title="发送"
              aria-label="发送"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 6,
                border: 'none',
                background: ink,
                color: 'var(--nk-surface)',
                cursor: 'pointer',
              }}
            >
              <PaperPlaneTiltIcon size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: muted }}>
          {!S.busy && S.snapCount > 0 && (
            <button
              onClick={async () => {
                const n = await S.undoTurn()
                if (n > 0) S.clear()
              }}
              title={`撤销本次 AI 改动（${S.snapCount} 个节点）`}
              aria-label={`撤销本次 AI 改动（${S.snapCount} 个节点）`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 5,
                border: `1px solid ${line}`,
                background: 'var(--nk-surface)',
                color: ink,
                cursor: 'pointer',
              }}
            >
              <ArrowCounterClockwiseIcon size={12} />
              撤销改动<span style={{ color: muted }}>{S.snapCount}</span>
            </button>
          )}
          <span>
            {S.usage.used ? `${(S.usage.used / 1000).toFixed(1)}k / ${(S.usage.size / 1000).toFixed(0)}k` : '未占用'}
          </span>
          <span style={{ flex: 1, height: 2, background: line, borderRadius: 2, overflow: 'hidden' }}>
            <i style={{ display: 'block', height: '100%', background: acc, width: `${Math.min(100, (S.usage.used / Math.max(1, S.usage.size)) * 100)}%` }} />
          </span>
        </div>
      </div>
    </div>
  )
})

export default AiPanelComp
