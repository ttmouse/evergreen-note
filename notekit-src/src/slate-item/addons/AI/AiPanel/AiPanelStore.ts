import { makeAutoObservable, runInAction } from 'mobx'

/** 面板里的一行。刻意不做"会话/消息"数据模型——它只是这一轮的流水。 */
export type AiItem =
  | { kind: 'user'; at: number; text: string }
  | { kind: 'text'; at: number; text: string }
  | { kind: 'thought'; at: number; text: string; open: boolean }
  | { kind: 'tool'; at: number; id: string; title: string; status: string; locations?: unknown }
  | { kind: 'permission'; at: number; requestId: string; toolCall: unknown; decided?: string }
  | { kind: 'error'; at: number; text: string }
  | { kind: 'exit'; at: number; text: string }

export type NoteRef = { ky?: string; title?: string } | null

const API = '/api/ai/acp'

/**
 * AI 面板的唯一状态源。
 * 纪律（方案 §4）：exit / error 必须显式落到界面上，绝不留静默挂起。
 */
export class AiPanelStore {
  /** 面板是否打开（宿主组件据此决定要不要占一列） */
  open = false
  items: AiItem[] = []
  busy = false
  /** stopped | starting | ready | busy */
  state = 'stopped'
  sessionId: string | null = null
  agent: string | null = null
  usage = { used: 0, size: 0 }
  error: string | null = null
  connected = false
  /** 本回合 AI 改动的节点数（>0 且不在 busy 时，可撤销） */
  snapCount = 0
  undoing = false
  private undoImpl: { undoTurn: () => Promise<number>; beginTurn: () => void } | null = null

  /** 历史档（每轮自动归档；清空时也归档）。viewing 非空表示正在只读回看某一档。 */
  history: { at: number; preview: string; items: AiItem[]; sid?: number }[] = []
  viewing: number | null = null

  private es: EventSource | null = null

  constructor() {
    makeAutoObservable(this, { es: false })
    this.loadHistory()
  }

  // ------------------------------------------------------------------ 历史

  private static HISTORY_KEY = 'nk-ai-panel-history'
  private static CURRENT_KEY = 'nk-ai-panel-current'
  private static HISTORY_MAX = 30

  private loadHistory() {
    try {
      const raw = localStorage.getItem(AiPanelStore.HISTORY_KEY)
      if (raw) this.history = JSON.parse(raw)
    } catch {
      this.history = []
    }
    // 上次没点「清空」就退出/刷新的对话：从 current 快照并回历史，保证历史完整。
    try {
      const raw = localStorage.getItem(AiPanelStore.CURRENT_KEY)
      if (raw) {
        const snap = JSON.parse(raw)
        if (snap && Array.isArray(snap.items) && snap.items.length > 0) this.mergeSnap(snap)
      }
    } catch {}
  }

  private saveHistory() {
    try {
      localStorage.setItem(AiPanelStore.HISTORY_KEY, JSON.stringify(this.history.slice(0, AiPanelStore.HISTORY_MAX)))
    } catch {}
  }

  /** 当前对话的稳定 id：首行的时间戳（clear 后从零重开，天然区分不同对话） */
  private get currentSid(): number | undefined {
    return this.items.length > 0 ? this.items[0].at : undefined
  }

  private makeSnap() {
    const firstUser = this.items.find((x) => x.kind === 'user') as any
    const preview = (firstUser?.text || this.items[0]?.text || '').slice(0, 40)
    return { sid: this.currentSid, at: this.items[0].at, preview, items: this.items }
  }

  /** 快照并入历史：同 sid 替换（对话进行中每轮刷新同一条），否则插到最前 */
  private mergeSnap(snap: { sid?: number; at: number; preview: string; items: AiItem[] }) {
    this.history = [snap, ...this.history.filter((h) => h.sid == null || h.sid !== snap.sid)].slice(
      0,
      AiPanelStore.HISTORY_MAX,
    )
    this.saveHistory()
  }

  /** 把当前流水持久化到 localStorage（每轮调用），退出/刷新后可并回历史 */
  private persistCurrent() {
    try {
      if (this.items.length === 0) localStorage.removeItem(AiPanelStore.CURRENT_KEY)
      else localStorage.setItem(AiPanelStore.CURRENT_KEY, JSON.stringify(this.makeSnap()))
    } catch {}
  }

  /** 每轮结束后同步刷新历史档（同一条对话只更新历史里同一条目，不产生重复） */
  syncHistory() {
    if (this.items.length === 0) return
    this.mergeSnap(this.makeSnap())
    this.persistCurrent()
  }

  /** 把当前流水归档进历史（clear 时调用；空流水不归档） */
  archive() {
    if (this.items.length === 0) return
    this.mergeSnap(this.makeSnap())
    try {
      localStorage.removeItem(AiPanelStore.CURRENT_KEY)
    } catch {}
  }

  removeHistory(at: number) {
    this.history = this.history.filter((h) => h.at !== at)
    if (this.viewing === at) this.viewing = null
    this.saveHistory()
  }

  /** 正在展示的行：回看时是历史档，否则是当前流水 */
  get displayItems(): AiItem[] {
    if (this.viewing != null) return this.history.find((h) => h.at === this.viewing)?.items ?? []
    return this.items
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

  private lastIndex(kind: AiItem['kind']) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].kind === kind) return i
      if (this.items[i].kind === 'user') return -1
    }
    return -1
  }

  apply(ev: any) {
    runInAction(() => {
      switch (ev.type) {
        case 'hello':
        case 'ready':
          this.state = ev.busy ? 'busy' : ev.sessionId ? 'ready' : 'starting'
          this.sessionId = ev.sessionId ?? this.sessionId
          this.agent = ev.agent ? (typeof ev.agent === 'string' ? ev.agent : `${ev.agent.name} v${ev.agent.version}`) : this.agent
          break
        case 'turn_start':
          this.busy = true
          this.state = 'busy'
          this.undoImpl?.beginTurn()
          this.items.push({ kind: 'user', at: ev.at, text: ev.text ?? '' })
          this.persistCurrent()
          break
        case 'text': {
          const i = this.lastIndex('text')
          const t = ev.text ?? ''
          if (i >= 0) this.items[i] = { ...(this.items[i] as any), text: (this.items[i] as any).text + t }
          else this.items.push({ kind: 'text', at: ev.at, text: t })
          break
        }
        case 'thought': {
          const last = this.items[this.items.length - 1]
          if (last && last.kind === 'thought') last.text += ev.text ?? ''
          else this.items.push({ kind: 'thought', at: ev.at, text: ev.text ?? '', open: false })
          break
        }
        case 'tool':
          this.items.push({
            kind: 'tool',
            at: ev.at,
            id: ev.toolCallId ?? `t${this.items.length}`,
            title: ev.title ?? 'tool',
            status: ev.status ?? 'pending',
            locations: ev.locations,
          })
          break
        case 'tool_update': {
          for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i]
            if (it.kind === 'tool' && it.id === ev.toolCallId) {
              this.items[i] = { ...it, status: ev.status ?? it.status }
              break
            }
          }
          break
        }
        case 'usage':
          this.usage = { used: ev.used ?? 0, size: ev.size ?? 0 }
          break
        case 'permission_request':
          this.items.push({
            kind: 'permission',
            at: ev.at,
            requestId: ev.requestId,
            toolCall: ev.toolCall,
          })
          break
        case 'permission_result':
          for (const it of this.items) {
            if (it.kind === 'permission' && it.requestId === ev.requestId) it.decided = ev.decision
          }
          break
        case 'turn_end':
          this.busy = false
          this.state = 'ready'
          this.syncHistory()
          break
        case 'cancel_sent':
          this.busy = false
          this.syncHistory()
          break
        case 'agent_exit':
          this.busy = false
          this.state = 'stopped'
          this.sessionId = null
          this.items.push({ kind: 'exit', at: ev.at, text: ev.message || 'agent 已退出' })
          this.syncHistory()
          break
        case 'error':
          this.busy = false
          this.error = ev.message ?? '未知错误'
          this.items.push({ kind: 'error', at: ev.at ?? Date.now(), text: this.error! })
          this.syncHistory()
          break
      }
    })
  }

  // ------------------------------------------------------------------ 动作

  async ensureSession() {
    const r = await fetch(`${API}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const j = await r.json()
    if (j?.sessionId) runInAction(() => ((this.sessionId = j.sessionId), (this.state = j.busy ? 'busy' : 'ready'), (this.agent = j.agent ?? this.agent)))
    return j
  }

  async send(text: string, note: NoteRef) {
    const t = text.trim()
    if (!t || this.busy) return
    this.error = null
    await fetch(`${API}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, note }),
    })
  }

  async cancel() {
    await fetch(`${API}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }

  async answer(requestId: string, decision: 'allow' | 'always' | 'deny') {
    await fetch(`${API}/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, decision }),
    })
  }

  clear() {
    this.archive()
    this.viewing = null
    this.items = []
    this.error = null
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
    const it = this.items.find((x) => x.kind === 'thought' && x.at === at)
    if (it && it.kind === 'thought') it.open = !it.open
  }
}

// 单例兜底：vite 分包可能让本模块被复制进多个 chunk，addon 与组件各拿一份。
// 挂到 window 上保证全局只有一份（否则 open() 改的是 A，组件看的却是 B）。
const w = window as any
export const aiPanelStore: AiPanelStore = w.__nkAiPanelStore || (w.__nkAiPanelStore = new AiPanelStore())
