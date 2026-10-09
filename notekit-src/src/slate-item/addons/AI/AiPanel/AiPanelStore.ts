import { makeAutoObservable, runInAction } from 'mobx'

/** 面板里的一行。刻意不做"会话/消息"数据模型——它只是这一轮的流水。 */
export type AiItem =
  | { kind: 'user'; at: number; text: string }
  | { kind: 'text'; at: number; text: string }
  | { kind: 'thought'; at: number; text: string; open: boolean }
  /**
   * toolKind = ACP 原生的 tool_call.kind。⚠️ 实测 DSH 一律发 "other"，不可靠 ——
   * 相位分类以 title（工具名，如 "bash"）为主，toolKind 只作兜底。
   * rawInput 用来拼行的宾语（command / file_path / pattern …）。
   */
  | {
      kind: 'tool'
      at: number
      id: string
      title: string
      status: string
      toolKind?: string
      rawInput?: unknown
      locations?: unknown
    }
  | { kind: 'permission'; at: number; requestId: string; toolCall: unknown; decided?: string }
  | { kind: 'error'; at: number; text: string }
  | { kind: 'exit'; at: number; text: string }

export type NoteRef = { ky?: string; title?: string } | null

/**
 * 一段对话。
 *
 * 2026-10-09 重做：以前「历史」只是本地只读快照，切过去看得到、聊不了。
 * 现在每段对话**真的对应 agent 侧一条 ACP 会话**（acpSessionId），于是：
 *   - 切回任意一段都能继续聊；
 *   - 各段上下文互不污染（实测：A 里埋的暗号，B 里问不出来）；
 *   - App / agent 重启后，服务端会自动 session/resume 把旧会话接回来（实测：重启后拿旧
 *     sessionId 直接发消息，仍答得出重启前埋的暗号）。
 *
 * legacy=true 是从旧「只读历史」迁移来的档：它们本来就是同一条会话的切片，
 * 所以共享同一个 acpSessionId；事件分流时优先落到"当前正在看的那条"。
 */
export type AiConversation = {
  /** 本地 id（= 本段首条消息的 at；沿用旧 history 条目的时间戳语义） */
  id: number
  /** 最近一次活动时间：列表排序用 */
  at: number
  preview: string
  /** agent 侧会话 id；null = 还没开，首次发送时新建 */
  acpSessionId: string | null
  items: AiItem[]
  legacy?: boolean
}

const API = '/api/ai/acp'

/** 新格式（会话列表） */
const KEY = 'nk-ai-panel-conversations'
/** 旧格式：只读历史快照数组 + 当前流水快照 */
const OLD_HISTORY_KEY = 'nk-ai-panel-history'
const OLD_CURRENT_KEY = 'nk-ai-panel-current'
const MAX_CONVERSATIONS = 30

/**
 * AI 面板的唯一状态源。
 * 纪律（方案 §4）：exit / error 必须显式落到界面上，绝不留静默挂起。
 */
export class AiPanelStore {
  /** 面板是否打开（宿主组件据此决定要不要占一列） */
  open = false

  /** 所有对话，最新的在前（列表展示用 list 排序） */
  conversations: AiConversation[] = []
  activeId: number | null = null

  /**
   * 会话级忙标记。多会话下不能用单个 bool：A 在跑不该把 B 的输入也锁住。
   * 键是 acpSessionId。
   */
  busyBy: Record<string, boolean> = {}
  /** 会话级用量（底部进度条） */
  usageBy: Record<string, { used: number; size: number }> = {}

  /** agent 进程级状态（与具体会话无关） */
  agentState: 'stopped' | 'starting' | 'ready' = 'stopped'
  /** 服务端"当前默认"会话 id（旧接口的兼容值） */
  sessionId: string | null = null
  agent: string | null = null
  connected = false
  error: string | null = null

  /** 本回合 AI 改动的节点数（>0 且不在 busy 时，可撤销） */
  snapCount = 0
  undoing = false
  private undoImpl: { undoTurn: () => Promise<number>; beginTurn: () => void } | null = null

  private es: EventSource | null = null

  constructor() {
    makeAutoObservable(this, { es: false })
    this.load()
  }

  // ------------------------------------------------------------------ 派生

  get active(): AiConversation | null {
    if (this.activeId == null) return this.conversations[0] ?? null
    return this.conversations.find((c) => c.id === this.activeId) ?? this.conversations[0] ?? null
  }

  /** 正在展示的行 = 当前会话的行（组件沿用旧名，改动面最小） */
  get items(): AiItem[] {
    return this.active?.items ?? []
  }

  get displayItems(): AiItem[] {
    return this.items
  }

  /** 列表：按最近活动排序 */
  get list(): AiConversation[] {
    return [...this.conversations].sort((a, b) => b.at - a.at)
  }

  /** 当前会话是否在跑 */
  get busy(): boolean {
    const sid = this.active?.acpSessionId
    return !!sid && !!this.busyBy[sid]
  }

  /** 有没有任何一条会话在跑（列表上打点用） */
  isBusy(conv: AiConversation): boolean {
    return !!conv.acpSessionId && !!this.busyBy[conv.acpSessionId]
  }

  get usage(): { used: number; size: number } {
    const sid = this.active?.acpSessionId
    return (sid && this.usageBy[sid]) || { used: 0, size: 0 }
  }

  get state(): 'stopped' | 'starting' | 'ready' | 'busy' {
    if (this.busy) return 'busy'
    return this.agentState
  }

  // ------------------------------------------------------------- 持久化/迁移

  private load() {
    const saved = this.readSaved()
    this.conversations = saved?.conversations ?? []
    this.activeId = saved && typeof saved.activeId === 'number' ? saved.activeId : null

    // 旧「只读快照」永远再兜一次底：新键可能是**迁移半途**写下的（早于历史重建），
    // 只信新键会让用户的历史整片消失。按 id 去重，重复跑无副作用。
    const legacy = this.readLegacyConversations()
    if (legacy.length > 0) {
      const have = new Set(this.conversations.map((c) => c.id))
      const add = legacy.filter((c) => !have.has(c.id))
      if (add.length > 0) this.conversations = [...this.conversations, ...add]
    }

    this.conversations.sort((a, b) => b.at - a.at)
    this.conversations = this.conversations.slice(0, MAX_CONVERSATIONS)
    if (this.conversations.length === 0) this.conversations = [this.createConversation()]
    if (this.activeId == null || !this.conversations.some((c) => c.id === this.activeId)) {
      this.activeId = this.conversations[0].id
    }
    this.persist()
  }

  private readSaved(): { activeId?: number; conversations: AiConversation[] } | null {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed?.conversations)) return null
      return { activeId: parsed.activeId, conversations: parsed.conversations }
    } catch {
      return null
    }
  }

  /**
   * 旧格式（只读快照）→ 会话。它们本来就是同一条 ACP 会话的切片，
   * 标 legacy 后由 ensureSession() 绑上当前会话，于是"切过去就能接着聊"。
   */
  private readLegacyConversations(): AiConversation[] {
    const out: AiConversation[] = []
    const push = (at: number, preview: string, items: AiItem[]) => {
      if (!items || items.length === 0) return
      out.push({ id: at, at, preview: preview || '(无摘要)', acpSessionId: null, items, legacy: true })
    }
    try {
      const cur = localStorage.getItem(OLD_CURRENT_KEY)
      if (cur) {
        const snap = JSON.parse(cur)
        if (snap?.items?.length) push(snap.at ?? Date.now(), snap.preview ?? '', snap.items)
      }
      const hist = localStorage.getItem(OLD_HISTORY_KEY)
      if (hist) {
        const arr = JSON.parse(hist)
        if (Array.isArray(arr)) for (const h of arr) push(h.at ?? Date.now(), h.preview ?? '', h.items)
      }
    } catch {}
    const seen = new Set<number>()
    return out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  }

  private persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ activeId: this.activeId, conversations: this.conversations.slice(0, MAX_CONVERSATIONS) })
      )
    } catch {}
  }

  // ------------------------------------------------------------------ 会话

  private createConversation(): AiConversation {
    let id = Date.now()
    while (this.conversations.some((c) => c.id === id)) id += 1
    return { id, at: id, preview: '', acpSessionId: null, items: [] }
  }

  /** 切到某一段对话。切换是纯本地的（不发请求）—— 旧会话的接回由服务端在 prompt 时自动 resume。 */
  switchTo(id: number) {
    this.activeId = id
    this.persist()
  }

  /** 收工：当前这段留在列表里，另起一段空白的（这就是「清空」在新模型下的含义） */
  clear() {
    const cur = this.active
    if (cur && cur.items.length === 0) {
      this.error = null
      return
    }
    this.newConversation()
  }

  newConversation() {
    const c = this.createConversation()
    this.conversations = [c, ...this.conversations].slice(0, MAX_CONVERSATIONS)
    this.activeId = c.id
    this.persist()
    return c
  }

  removeConversation(id: number) {
    this.conversations = this.conversations.filter((c) => c.id !== id)
    if (this.activeId === id) this.activeId = this.conversations[0]?.id ?? null
    if (this.conversations.length === 0) this.newConversation()
    this.persist()
  }

  private activeOrCreate(): AiConversation {
    const c = this.active
    if (c) return c
    return this.newConversation()
  }

  // ------------------------------------------------------------------ SSE

  connect() {
    if (this.es) return
    const es = new EventSource(`${API}/stream`)
    this.es = es
    es.onopen = () => runInAction(() => (this.connected = true))
    es.onerror = () =>
      runInAction(() => {
        this.connected = false
      })
    es.onmessage = (e) => {
      let ev: any
      try {
        ev = JSON.parse(e.data)
      } catch {
        return
      }
      this.apply(ev)
    }
  }

  disconnect() {
    this.es?.close()
    this.es = null
    this.connected = false
  }

  // ---------------------------------------------------------------- 事件归并

  /**
   * 事件 → 会话。带 sessionId 的一律按会话分流；找不到归属的就丢掉
   * （宁可少显示，也不能把 A 的回复串进 B）。
   */
  private conversationFor(sid?: string): AiConversation | null {
    if (!sid) return this.active
    const cur = this.active
    if (cur && cur.acpSessionId === sid) return cur
    return this.conversations.find((c) => c.acpSessionId === sid) ?? null
  }

  private lastIndex(items: AiItem[], kind: AiItem['kind']) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === kind) return i
      if (items[i].kind === 'user') return -1
    }
    return -1
  }

  private touch(conv: AiConversation, at?: number) {
    conv.at = at ?? Date.now()
    if (!conv.preview) {
      const firstUser = conv.items.find((x) => x.kind === 'user') as any
      const t = firstUser?.text || (conv.items[0] as any)?.text || ''
      conv.preview = String(t).slice(0, 40)
    }
  }

  apply(ev: any) {
    const scoped = !!ev.sessionId
    runInAction(() => {
      if (ev.type === 'hello' || ev.type === 'ready') {
        this.agentState = ev.sessionId ? 'ready' : 'starting'
        this.sessionId = ev.sessionId ?? this.sessionId
        this.agent = ev.agent
          ? typeof ev.agent === 'string'
            ? ev.agent
            : `${ev.agent.name} v${ev.agent.version}`
          : this.agent
        return
      }
      if (ev.type === 'agent_exit' || ev.type === 'stopped') {
        this.busyBy = {}
        if (ev.type === 'agent_exit') {
          this.agentState = 'stopped'
          this.sessionId = null
          const c = this.active
          if (c) c.items.push({ kind: 'exit', at: ev.at ?? Date.now(), text: ev.message || 'agent 已退出' })
        }
        return
      }
      // 服务端把某条会话换成了别的 id（resume 后拿到不同 id / 旧会话已不存在时降级）
      if (ev.type === 'session_remap') {
        for (const c of this.conversations) if (c.acpSessionId === ev.from) c.acpSessionId = ev.sessionId
        return
      }

      const conv = this.conversationFor(ev.sessionId)
      if (!conv) return

      const sid: string | undefined = ev.sessionId
      switch (ev.type) {
        case 'turn_start':
          if (sid) this.busyBy = { ...this.busyBy, [sid]: true }
          this.undoImpl?.beginTurn()
          conv.items.push({ kind: 'user', at: ev.at, text: ev.text ?? '' })
          break
        case 'text': {
          const i = this.lastIndex(conv.items, 'text')
          const t = ev.text ?? ''
          if (i >= 0) conv.items[i] = { ...(conv.items[i] as any), text: (conv.items[i] as any).text + t }
          else conv.items.push({ kind: 'text', at: ev.at, text: t })
          break
        }
        case 'thought': {
          const last = conv.items[conv.items.length - 1]
          if (last && last.kind === 'thought') last.text += ev.text ?? ''
          else conv.items.push({ kind: 'thought', at: ev.at, text: ev.text ?? '', open: false })
          break
        }
        case 'tool':
          conv.items.push({
            kind: 'tool',
            at: ev.at,
            id: ev.toolCallId ?? `t${conv.items.length}`,
            title: ev.title ?? 'tool',
            status: ev.status ?? 'pending',
            toolKind: ev.kind,
            rawInput: ev.rawInput,
            locations: ev.locations,
          })
          break
        case 'tool_update': {
          for (let i = conv.items.length - 1; i >= 0; i--) {
            const it = conv.items[i]
            if (it.kind === 'tool' && it.id === ev.toolCallId) {
              // title / kind 只在首次 tool_call 里出现是常态，但 update 里也可能补上；
              // 状态无条件跟随，其余字段「有才覆盖」。
              conv.items[i] = {
                ...it,
                status: ev.status ?? it.status,
                title: ev.title || it.title,
                toolKind: ev.kind || it.toolKind,
                rawInput: ev.rawInput || it.rawInput,
                locations: ev.locations || it.locations,
              }
              break
            }
          }
          break
        }
        case 'usage':
          if (sid) this.usageBy = { ...this.usageBy, [sid]: { used: ev.used ?? 0, size: ev.size ?? 0 } }
          break
        case 'permission_request':
          conv.items.push({
            kind: 'permission',
            at: ev.at,
            requestId: ev.requestId,
            toolCall: ev.toolCall,
          })
          break
        case 'permission_result':
          for (const c of this.conversations) {
            for (const it of c.items) {
              if (it.kind === 'permission' && it.requestId === ev.requestId) it.decided = ev.decision
            }
          }
          break
        case 'turn_end':
        case 'cancel_sent':
          if (sid) this.busyBy = { ...this.busyBy, [sid]: false }
          break
        case 'error':
          if (sid) this.busyBy = { ...this.busyBy, [sid]: false }
          this.error = ev.message ?? '未知错误'
          conv.items.push({ kind: 'error', at: ev.at ?? Date.now(), text: this.error! })
          break
        default:
          return
      }
      this.touch(conv, ev.at)
    })

    if (!scoped || ['turn_end', 'cancel_sent', 'error', 'permission_result'].includes(ev.type)) this.persist()
  }

  // ------------------------------------------------------------------ 动作

  /**
   * 确保 agent 就绪，并拿到服务端"当前会话"。首次调用时把旧历史迁来的档
   * 绑到这条会话上 —— 它们本来就是它的切片，绑上就能接着聊。
   */
  async ensureSession() {
    const r = await fetch(`${API}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const j = await r.json()
    runInAction(() => {
      if (j?.sessionId) {
        this.sessionId = j.sessionId
        for (const c of this.conversations) if (c.legacy && !c.acpSessionId) c.acpSessionId = j.sessionId
      }
      if (j?.agent) this.agent = j.agent
      if (j?.sessionId) this.agentState = 'ready'
    })
    this.persist()
    return j
  }

  async send(text: string, note: NoteRef) {
    const t = text.trim()
    if (!t || this.busy) return
    const conv = this.activeOrCreate()
    this.error = null
    // 这一段还没有自己的会话 → 现开一条（各段互不污染）
    if (!conv.acpSessionId) {
      try {
        const r = await fetch(`${API}/session/new`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        const j = await r.json()
        if (j?.sessionId) {
          runInAction(() => {
            conv.acpSessionId = j.sessionId
            this.sessionId = j.sessionId
            this.agentState = 'ready'
          })
          this.persist()
        }
      } catch (e: any) {
        runInAction(() => {
          this.error = `新会话创建失败：${e?.message ?? e}`
          conv.items.push({ kind: 'error', at: Date.now(), text: this.error! })
        })
        return
      }
    }
    await fetch(`${API}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, note, sessionId: conv.acpSessionId }),
    })
  }

  async cancel() {
    await fetch(`${API}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.active?.acpSessionId ?? undefined }),
    })
  }

  async answer(requestId: string, decision: 'allow' | 'always' | 'deny') {
    await fetch(`${API}/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, decision }),
    })
  }

  attachUndo(impl: { undoTurn: () => Promise<number>; beginTurn: () => void }) {
    this.undoImpl = impl
  }

  async undoTurn() {
    if (!this.undoImpl) return 0
    const n = await this.undoImpl.undoTurn()
    return n
  }

  toggleThought(at: number) {
    for (const c of this.conversations) {
      const it = c.items.find((x) => x.kind === 'thought' && x.at === at)
      if (it && it.kind === 'thought') {
        it.open = !it.open
        return
      }
    }
  }
}

// 单例兜底：vite 分包可能让本模块被复制进多个 chunk，addon 与组件各拿一份。
// 挂到 window 上保证全局只有一份（否则 open() 改的是 A，组件看的却是 B）。
const w = window as any
export const aiPanelStore: AiPanelStore = w.__nkAiPanelStore || (w.__nkAiPanelStore = new AiPanelStore())
