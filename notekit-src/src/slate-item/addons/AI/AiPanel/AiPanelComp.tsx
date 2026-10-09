import React, { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react'
import { marked } from 'marked'
import { useAddons } from '../../../hooks/useAddons'
import { aiPanelStore as S, NoteRef } from './AiPanelStore'
import { groupBlocks } from './phases'
import { AiActivityTrack, ActivityOrb, AI_ACTIVITY_CSS } from './AiActivity'

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

const AiMarkdown = ({ text }: { text: string }) => (
  <div className="ai-md" dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />
)

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
  const viewingHist = S.viewing != null

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
          style={{ border: 'none', background: 'none', color: histOpen || S.history.length > 0 ? ink : muted, cursor: 'pointer', fontSize: 12 }}
        >
          历史{S.history.length > 0 ? `（${S.history.length}）` : ''}
        </button>
        <button onClick={() => S.clear()} style={{ border: 'none', background: 'none', color: muted, cursor: 'pointer', fontSize: 12 }}>
          清空
        </button>
        <button onClick={() => extArea?.foldup(true)} style={{ border: 'none', background: 'none', color: muted, cursor: 'pointer', fontSize: 12 }}>
          收起
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
            {S.history.length === 0 && <div style={{ padding: '10px 8px', fontSize: 12, color: muted }}>还没有历史。点「清空」会把当前对话自动存进这里。</div>}
            {S.history.map((h) => (
              <div
                key={h.at}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', color: S.viewing === h.at ? acc : ink }}
                onClick={() => {
                  S.viewing = h.at
                  setHistOpen(false)
                }}
              >
                <span style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap' }}>{fmtTime(h.at)}</span>
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{h.preview || '（空）'}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    S.removeHistory(h.at)
                  }}
                  title="删除这条历史"
                  style={{ fontSize: 11, color: muted, padding: '0 4px' }}
                >
                  ✕
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 回看横幅 */}
      {viewingHist && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '5px 12px', borderBottom: `1px solid ${line}`, fontSize: 12, color: muted }}>
          正在查看历史（{fmtTime(S.viewing!)}）· 只读
          <span style={{ flex: 1 }} />
          <button
            onClick={() => (S.viewing = null)}
            style={{ fontSize: 12, padding: '1px 10px', borderRadius: 4, border: `1px solid ${line}`, background: 'var(--nk-surface)', color: ink, cursor: 'pointer' }}
          >
            回到最新
          </button>
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
        {!viewingHist && S.items.length === 0 && (
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
          const lastIsActivity = !viewingHist && S.busy && lastIdx >= 0 && blocks[lastIdx].type === 'activity'
          return (
            <>
              {blocks.map((b, bi) => {
                if (b.type === 'activity')
                  return <AiActivityTrack key={b.key} trackKey={b.key} phases={b.phases} live={lastIsActivity && bi === lastIdx} />
                const it = b.item
                const i = b.i

                if (it.kind === 'user')
                  return (
                    <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '86%', background: 'var(--nk-accent-soft)', borderRadius: 10, padding: '6px 10px', fontSize: 14, color: ink, lineHeight: 1.7 }}>
                      {it.text}
                    </div>
                  )

                if (it.kind === 'text') return <AiMarkdown key={i} text={it.text} />

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
                    <button onClick={() => S.answer(it.requestId, 'allow')} style={{ fontSize: 13, padding: '3px 12px', borderRadius: 5, border: `1px solid ${acc}`, background: acc, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
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
              {!viewingHist && S.busy && !lastIsActivity && <ActivityOrb label="跟进中" />}
            </>
          )
        })()}
      </div>

      {/* 输入区
          这里**永远不隐藏**。原先回看历史时是 display:none —— 那是代码里唯一能让
          输入框整个消失的路径，而症状（输入框不见 + 底下空白）跟「面板坏了」无法区分。
          改成可见但禁用：意图一样（不误发到当前会话），但用户永远看得见它在哪。 */}
      <div style={{ borderTop: `1px solid ${line}`, padding: '8px 10px', flexShrink: 0, opacity: viewingHist ? 0.55 : 1 }}>
        {/* 离底了就给个明确出口，别让人靠反复滚找输入框 */}
        {!atBottom && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <button
              onClick={jumpToBottom}
              style={{
                fontSize: 12,
                padding: '2px 12px',
                borderRadius: 12,
                border: `1px solid ${line}`,
                background: 'var(--nk-surface)',
                color: muted,
                cursor: 'pointer',
              }}
            >
              ↓ 回到最新
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
            disabled={viewingHist}
            placeholder={
              viewingHist
                ? '正在回看历史（只读）—— 点上方「回到最新」继续'
                : S.busy
                  ? '它正在干活…（可点停止）'
                  : '让它改这篇笔记，或问它点什么'
            }
            style={{ flex: 1, font: 'inherit', fontSize: 13, padding: '6px 10px', borderRadius: 6, border: `1px solid var(--nk-line-strong)`, background: 'var(--nk-canvas)', color: ink, outline: 'none' }}
          />
          {S.busy ? (
            <button onClick={() => S.cancel()} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: `1px solid ${line}`, background: 'var(--nk-surface)', color: ink, cursor: 'pointer' }}>
              停止
            </button>
          ) : viewingHist ? (
            <button
              onClick={() => (S.viewing = null)}
              style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: `1px solid ${acc}`, background: acc, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
            >
              回到最新
            </button>
          ) : (
            <button onClick={send} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: `1px solid ${acc}`, background: acc, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              发送
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
              style={{ fontSize: 12, padding: '2px 10px', borderRadius: 5, border: `1px solid ${line}`, background: 'var(--nk-surface)', color: ink, cursor: 'pointer' }}
            >
              撤销本次 AI 改动（{S.snapCount} 个节点）
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
