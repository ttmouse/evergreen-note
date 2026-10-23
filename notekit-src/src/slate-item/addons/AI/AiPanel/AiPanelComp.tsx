import React, { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react'
import Autocomplete from '@mui/material/Autocomplete'
import Popper from '@mui/material/Popper'
import TextField from '@mui/material/TextField'
import { marked } from 'marked'
import { useAddons } from '../../../hooks/useAddons'
import { aiPanelStore as S, NoteRef } from './AiPanelStore'
import { groupBlocks } from './phases'
import { AiActivityTrack, ActivityOrb, AI_ACTIVITY_CSS } from './AiActivity'
import { SvgIcon } from '../../../../components/SvgIcon'
import {
  AiContext,
  contextLabel,
  contextNote,
  resolveAiContext,
} from './AiContext'
import { pub } from '../../../utils/pub'

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
const danger = 'var(--nk-danger)'
const WideModelPopper = React.forwardRef<HTMLDivElement, any>((props, ref) => (
  <Popper
    {...props}
    ref={ref}
    style={{ ...props.style, width: '400px', maxWidth: 'calc(100vw - 24px)' }}
  />
))

/** 上下文用量：小圆环进度。悬停/读屏给精确数值，界面上不占文字位。 */
const UsageRing = ({ used, size }: { used: number; size: number }) => {
  const pct = size > 0 ? Math.min(100, Math.max(0, (used / size) * 100)) : 0
  const label = size > 0
    ? `上下文已用 ${(used / 1000).toFixed(1)}k / ${(size / 1000).toFixed(0)}k（${pct.toFixed(0)}%）`
    : '上下文用量：暂无数据'
  const radius = 7
  const circumference = 2 * Math.PI * radius
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, flexShrink: 0, opacity: size > 0 ? 1 : 0.5 }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r={radius} fill="none" stroke={line} strokeWidth="2" />
        {pct > 0 && (
          <circle
            cx="9"
            cy="9"
            r={radius}
            fill="none"
            stroke={acc}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - pct / 100)}
            transform="rotate(-90 9 9)"
          />
        )}
      </svg>
    </span>
  )
}

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

/* 头部图标按钮：与主区工具栏（workspace-theme.css .workspace-navigation button /
   .workspace-header-actions > .node）同一套规格 —— 30×30 热区、6px 圆角、
   默认 --nk-muted、hover 背景 --nk-hover 且图标转 --nk-ink、18px 图标。 */
.ai-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--nk-muted);
  cursor: pointer;
}
.ai-icon-btn:hover:not(:disabled) { background: var(--nk-hover); color: var(--nk-ink); }
.ai-icon-btn:disabled { cursor: default; }

/* 输入区：一个常规的对话输入框 —— 外框包住多行输入与底部操作条，
   焦点落在 textarea 时整框换边色，替代原先给 textarea 单独描边。 */
.ai-composer {
  border: 1px solid var(--nk-line);
  border-radius: 10px;
  background: var(--nk-surface);
  padding: 8px 8px 4px;
  transition: border-color .12s;
}
.ai-composer:focus-within { border-color: var(--nk-line-strong); }
`

export const AiPanelComp = observer(() => {
  const { editorView, app, dbMemory, blockSelection } = useAddons() as any
  const [draft, setDraft] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 输入框高度随内容长（封顶 ~5 行），发送清空后自动收回单行
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [draft])

  useEffect(() => {
    S.connect()
  }, [])

  // ------------------------------------------------------- 上下文感知（页面 / 选中块）

  /**
   * BlockSelection 插件是普通类（非 observable），事件驱动重算：selectionChanged
   * 覆盖拖选/点光标（Slate 每次 set_selection 都会发），editorChanged 兼顾块增删。
   * 上下文永远在「发送那一刻」现读，这里的重算只为让标签不落后。
   */
  /** 从 BlockSelection 的选块 DOM 逐个读原文；读不到（已卸载/折叠）的块跳过 */
  const readSelectedBlocks = (): { ky?: string; text: string }[] => {
    const ids: string[] = Array.isArray(blockSelection?.selectedIds) ? blockSelection.selectedIds : []
    const out: { ky?: string; text: string }[] = []
    for (const id of ids) {
      try {
        const item = (document.getElementById(id) as any)?.$item
        const text = typeof item?.GetPlainText === 'function' ? String(item.GetPlainText() ?? '') : ''
        if (text.trim()) out.push({ ky: item.ky, text })
      } catch {
        // 块在取文时恰好卸载：少一块上下文好过整次操作报错
      }
    }
    return out
  }

  /** 读「此刻」的上下文。发送与按钮都走它——不依赖 React 渲染时序。 */
  const resolveNow = (): AiContext | null => {
    try {
      const ky = editorView?.currentItemKy
      const node = ky ? dbMemory?.getItem(ky, { isRecur: false }) : null
      return resolveAiContext({
        pageKy: ky || null,
        pageTitle: node?.ori || null,
        blocks: readSelectedBlocks(),
      })
    } catch {
      return null
    }
  }

  /** 展示用：事件到来时重算（BlockSelection 非 observable，靠 pub 事件驱动）。 */
  const [aiContext, setAiContext] = useState<AiContext | null>(null)
  useEffect(() => {
    const refresh = () => setAiContext(resolveNow())
    refresh()
    pub.on(pub.evt.selectionChanged, refresh)
    pub.on(pub.evt.editorChanged, refresh)
    return () => {
      pub.off(pub.evt.selectionChanged, refresh)
      pub.off(pub.evt.editorChanged, refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 手势级暂存：mousedown（任何默认行为都还没跑）先抓一份「此刻上下文」。
   * 为什么需要：点面板按钮/输入框会让编辑器失焦，选区可能在 click 之前就被清掉 ——
   * 到 onClick 才读，选块上下文就丢了。stash 在每次手势开始时覆盖、用后即弃。
   */
  const opCtxRef = useRef<AiContext | null>(null)

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

  /**
   * 随请求发给 agent 的环境信息：有选中块 → 块原文内联；否则当前页面（ky + 标题，
   * 正文 agent 用 ev 自取）。语义与优先级见 AiContext.ts —— 选中块永远压过页面。
   */
  const send = async () => {
    const t = draft.trim()
    const hasImages = S.pendingImages.length > 0
    // 只有图、没有字也要能发：这是「贴张截图问一句」的主路径。
    // 服务端不接受空 text，这里补一句最小的说明。
    if ((!t && !hasImages) || S.busy) return
    const ctx = opCtxRef.current ?? aiContext
    opCtxRef.current = null
    setDraft('')
    await S.send(t || '看看这张图', ctx ? (contextNote(ctx) as NoteRef) : null)
  }

  const fmtTime = (at: number) => {
    const d = new Date(at)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  // 数据源接线（2026-10-09 19:3x，store 拥有者落地）：旧的 history/viewing「只读快照」已换成
  // 真会话列表 —— 每段对应 agent 侧一条 ACP 会话，切过去可以直接接着聊。
  // 仍然只做「读不到就当空」：面板宁可少一块，也不能整片白掉（18:44 的事故）。
  const convs: any[] = Array.isArray(S.list) ? S.list : []
  const activeConv: any = S.active ?? null
  const viewing: number | null = activeConv?.id ?? null
  useEffect(() => {
    // 仅在当前对话变化时取配置；模型列表由 ACP agent 返回。
    S.loadActiveConfigOptions().catch((e) => console.warn('[ai-panel] 加载模型配置失败', e))
  }, [viewing])
  const activeConfigOptions: any[] = activeConv?.acpSessionId
    ? (S.configOptionsBySession[activeConv.acpSessionId] || [])
    : []
  const modelConfig = activeConfigOptions.find((option) =>
    option?.category === 'model' && option?.type === 'select' && Array.isArray(option?.options)
  )
  const modelConfigId = modelConfig?.configId ?? modelConfig?.id
  const modelChoices = modelConfig
    ? modelConfig.options.flatMap((group: any) => {
        const groupName = String(group?.name || group?.group || 'Models')
        const entries = Array.isArray(group?.options) ? group.options : [group]
        return entries
          .map((option: any) => ({
            value: String(option?.value ?? option?.id ?? ''),
            name: String(option?.name || option?.label || option?.value || ''),
            group: groupName,
          }))
          .filter((option: any) => option.value && option.name)
      })
    : []
  const selectedModel = modelChoices.find((option: any) => option.value === String(modelConfig?.currentValue ?? '')) ?? null
  const modelSwitchQueued = !!activeConv?.acpSessionId && !!S.pendingModelBySession[activeConv.acpSessionId]
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
        // 侧边栏整体 = 画布色（用户指定 #fafafc；亮色主题的 --nk-canvas 就是它）。
        // 用变量而非写死，夜间模式才不会跟着刺眼。
        background: 'var(--nk-canvas)',
      }}
    >
      <style>{AI_MD_CSS}{AI_ACTIVITY_CSS}</style>
      {/* 头 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 44, boxSizing: 'border-box', flexShrink: 0, padding: '0 12px', borderBottom: `1px solid ${line}`, fontSize: 12, color: muted, position: 'relative' }}>
        <span style={{ flex: 1, minWidth: 4 }} />
        {modelConfig ? (
          <Autocomplete
            options={modelChoices}
            value={selectedModel}
            groupBy={(option: any) => option.group}
            getOptionLabel={(option: any) => option.name}
            isOptionEqualToValue={(option: any, value: any) => option.value === value.value}
            filterOptions={(options: any[], state) => {
              const query = state.inputValue.trim().toLocaleLowerCase()
              if (!query) return options
              return options.filter((option) => `${option.name} ${option.group} ${option.value}`.toLocaleLowerCase().includes(query))
            }}
            autoHighlight
            openOnFocus
            disableClearable
            PopperComponent={WideModelPopper}
            title={modelSwitchQueued ? '本轮回复结束后切换模型' : modelConfig.name || modelConfigId || '选择模型'}
            onChange={(_, option: any) => {
              if (!option) return
              S.selectModel(String(modelConfigId), option.value).catch((e) => {
                console.error('[ai-panel] 切换模型失败', e)
                S.loadActiveConfigOptions().catch(() => {})
              })
            }}
            size="small"
            sx={{
              width: 'min(230px, 48vw)',
              minWidth: 90,
              '& .MuiOutlinedInput-root': {
                height: 28,
                padding: '0 6px !important',
                border: `1px solid ${line}`,
                borderRadius: '4px',
                backgroundColor: 'var(--nk-canvas)',
                color: ink,
                fontSize: 12,
                '& fieldset': { border: 0 },
                '&:hover fieldset': { border: 0 },
                '&.Mui-focused fieldset': { border: 0 },
              },
              '& .MuiAutocomplete-input': { padding: '0 !important', minWidth: '24px !important' },
              '& .MuiAutocomplete-endAdornment': { right: 2 },
              '& .MuiSvgIcon-root': { color: muted, fontSize: 18 },
            }}
            componentsProps={{
              popper: { placement: 'bottom-end' },
              paper: { sx: { backgroundColor: 'var(--nk-surface)', color: ink, border: `1px solid ${line}` } },
              listbox: {
                sx: {
                  maxHeight: 360,
                  padding: '4px 0',
                  fontSize: 12,
                  '& .MuiAutocomplete-option': { fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                  '& .MuiAutocomplete-groupLabel': { whiteSpace: 'nowrap' },
                },
              },
            }}
            renderOption={(props, option: any) => (
              <li
                {...props}
                title={`${option.name} · ${option.group}`}
                style={{ ...props.style, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {option.name}
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="搜索模型"
                inputProps={{ ...params.inputProps, 'aria-label': '搜索模型' }}
              />
            )}
          />
        ) : null}
        {modelSwitchQueued ? <span style={{ color: muted, fontSize: 11, whiteSpace: 'nowrap' }}>回复后切换</span> : null}
        {/* 顶部不再放状态色点（D125F26FCF5E-22）：就绪时的绿点没有信息量、纯噪音；
            非就绪态本来就写文字，不需要再配一个点。agent 名+版本是内部实现细节，不进界面。 */}
        {S.state !== 'ready' && S.state !== 'busy' ? (
          <span style={{ color: muted }}>{S.connected ? '连接中…' : '未连接'}</span>
        ) : null}
        <button
          className="ai-icon-btn"
          onClick={() => setHistOpen((v) => !v)}
          title={`切换会话：点任意一段都能直接接着聊${convs.length > 1 ? `（共 ${convs.length} 段）` : ''}`}
          aria-label="历史会话"
          style={{ color: histOpen || convs.length > 1 ? ink : undefined }}
        >
          <SvgIcon name="svg_recent" width={18} />
        </button>
        {/* 「清空」的语义收窄：它从来不删除任何东西，实际是「收工 + 另起一段」，
            名字却读着像删除。换成名副其实的入口，并把空段的静默 no-op 变成明确禁用
            （原先在空白段上点，什么都不会发生 —— 那正是「没法新建对话」的由来）。 */}
        <button
          className="ai-icon-btn"
          onClick={() => canNewConv && S.clear()}
          disabled={!canNewConv}
          title={canNewConv ? '新建对话：当前这段会留在历史里，另起一段空白的' : '当前已经是新对话了'}
          aria-label="新对话"
          style={{ opacity: canNewConv ? 1 : 0.4 }}
        >
          <SvgIcon name="svg_add" width={18} />
        </button>
        {/* 「收起面板」按钮已移除（D125F26FCF5E-22：用户指出最右侧那个箭头图标多余）。
            同一个动作本来就有正式入口 —— 右上角工具条的 AI 图标与 mod+shift+9 热键，
            而这里的 onClick 调的是 extArea.foldup()（收起的是编辑器下拉那一列，
            根本不是这块面板），标题与行为不符。同动作多入口是噪音，删掉这一个。 */}

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
              <SvgIcon name="svg_close" width={11} />
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
            {aiContext ? (
              <>
                它看得见你正在看的内容（{contextLabel(aiContext)}）——
                {aiContext.mode === 'selection'
                  ? '选中的块会作为主要对象。'
                  : '只带页面引用，正文由它自己按需读取。'}
                <br />
                直接说一句要它做什么：
              </>
            ) : (
              <>
                打开一篇笔记后，它就能读到当前页面（或你选中的块）。
                <br />
                直接说一句要它做什么：
              </>
            )}
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
                      {it.text && <div>{it.text}</div>}
                      {it.images?.map((image) => (
                        image.dataUrl ? (
                          <img
                            key={image.id}
                            src={image.dataUrl}
                            alt={image.name}
                            title={image.name}
                            style={{ display: 'block', maxWidth: 220, maxHeight: 180, width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 4, marginTop: it.text ? 6 : 0 }}
                          />
                        ) : (
                          <div key={image.id} style={{ color: muted, fontSize: 12 }}>图片：{image.name}（历史记录不保留原图预览）</div>
                        )
                      ))}
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
              <div key={i} style={{ border: `1px solid ${danger}`, borderRadius: 6, padding: 9, fontSize: 13, color: danger, lineHeight: 1.7 }}>
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
      <div style={{ borderTop: `1px solid ${line}`, padding: '8px 10px', flexShrink: 0, position: 'relative' }}>
        {/* 离底了就给个明确出口，别让人靠反复滚找输入框 */}
        {!atBottom && (
          <div style={{ position: 'absolute', right: 14, top: -15, zIndex: 1 }}>
            <button
              className="ai-icon-btn"
              onClick={jumpToBottom}
              title="回到最新"
              aria-label="回到最新"
            >
              <SvgIcon name="svg_arrow_down" width={18} />
            </button>
          </div>
        )}
        {/* 附图预览：贴进来先看得见，能单独撤掉；发送成功后才清空 */}
        {S.pendingImages.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {S.pendingImages.map((im) => (
              <div
                key={im.id}
                title={`${im.name} · ${Math.max(1, Math.round(im.bytes / 1024))}KB`}
                style={{ position: 'relative', width: 52, height: 52, borderRadius: 4, overflow: 'hidden', border: `1px solid ${line}`, background: 'var(--nk-surface)' }}
              >
                <img src={im.dataUrl} alt={im.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button
                  className="ai-icon-btn"
                  onClick={() => S.removeImage(im.id)}
                  title="移除这张图"
                  aria-label="移除这张图"
                  style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, padding: 0, borderRadius: 0, background: 'var(--nk-surface)', color: ink, opacity: 0.9 }}
                >
                  <SvgIcon name="svg_close" width={9} />
                </button>
              </div>
            ))}
          </div>
        )}
        {S.imageError && (
          <div style={{ fontSize: 12, color: danger, marginBottom: 4 }}>{S.imageError}</div>
        )}
        <div className="ai-composer">
          {/* 多行输入：Enter 发送、Shift+Enter 换行；从两行起，随内容长到约五行封顶 */}
          <textarea
            ref={inputRef}
            value={draft}
            rows={2}
            onMouseDown={() => (opCtxRef.current = resolveNow())}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              // 剪贴板里有图 → 收下当附件，别让浏览器把它当二进制粘进文本框
              const files = Array.from(e.clipboardData?.items ?? [])
                .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                .map((it) => it.getAsFile())
                .filter((f): f is File => !!f)
              if (files.length === 0) return
              e.preventDefault()
              void S.addImages(files)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={S.busy ? '它正在这一段里干活…（可点停止）' : '发消息给它…（Enter 发送，Shift+Enter 换行）'}
            style={{ display: 'block', boxSizing: 'border-box', width: '100%', minHeight: 44, font: 'inherit', fontSize: 14, padding: '2px 4px', border: 0, background: 'transparent', color: ink, outline: 'none', resize: 'none', lineHeight: 1.6, overflowY: 'auto' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2, minHeight: 30 }}>
            <span style={{ display: 'inline-flex', flexShrink: 0 }}>
              <SvgIcon
                name={aiContext?.mode === 'selection' ? 'svg_highlight' : 'svg_document'}
                width={13}
                color={muted}
              />
            </span>
            <span
              title={
                aiContext
                  ? aiContext.mode === 'selection'
                    ? '选中的块会随请求发给 AI（有截断上限），页面只作背景'
                    : '只带当前页面的引用（ky + 标题），正文由 AI 按需自己读取'
                  : '打开一篇笔记后，这里会显示随请求发送的上下文'
              }
              style={{ minWidth: 0, fontSize: 11, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {aiContext ? contextLabel(aiContext) : '无上下文'}
            </span>
            <span style={{ flex: 1 }} />
            {!S.busy && S.snapCount > 0 && (
              <button
                className="ai-icon-btn"
                onClick={async () => {
                  const n = await S.undoTurn()
                  if (n > 0) S.clear()
                }}
                title={`撤销本次 AI 改动（${S.snapCount} 个节点）`}
                aria-label={`撤销本次 AI 改动（${S.snapCount} 个节点）`}
              >
                <SvgIcon name="svg_restore" width={15} />
              </button>
            )}
            <UsageRing used={S.usage.used} size={S.usage.size} />
            {S.busy ? (
              <button
                className="ai-icon-btn"
                onClick={() => S.cancel()}
                title="停止"
                aria-label="停止"
              >
                <SvgIcon name="svg_stop" width={16} />
              </button>
            ) : (
              <button
                className="ai-icon-btn"
                onClick={send}
                title="发送"
                aria-label="发送"
                style={{ opacity: draft.trim() || S.pendingImages.length ? 1 : 0.45 }}
              >
                <SvgIcon name="svg_send" width={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export default AiPanelComp
