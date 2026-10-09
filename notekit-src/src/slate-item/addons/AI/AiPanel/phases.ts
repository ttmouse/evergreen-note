/**
 * AI 面板的「活动相位」推导 —— 纯函数，不依赖 React / DOM。
 *
 * 参考 Alma 桌面端的活动轨道：一屏工具调用不铺成一堆卡片，而是折成
 *   part → 相位（phase）→ 轨道
 * 相位 = 相邻同类的 part 合并（不跨段归并，顺序即时间顺序）。
 *
 * 三条纪律：
 *   1. 只收 thought + tool。正文文本走自己的渲染路径——轨道只描述「动作」。
 *   2. 相位是投影，不是存储。原始事件流（AiItem[]）才是源，相位每次重算。
 *   3. 全部纯函数 —— 跟帧解析器一样，是可以脱 UI 单测的接缝。
 */
import type { AiItem } from './AiPanelStore'

export type PhaseKind = 'thinking' | 'exploring' | 'making' | 'running' | 'generic'

export type ThoughtItem = Extract<AiItem, { kind: 'thought' }>
export type ToolItem = Extract<AiItem, { kind: 'tool' }>
export type Part = ThoughtItem | ToolItem

export type Phase = {
  kind: PhaseKind
  items: Part[]
  /** 在源 items 里的下标，用于稳定 key */
  startIndex: number
}

/** 轨道上最多显示几个相位头像，其余收成 +N */
export const MAX_VISIBLE_PHASES = 8

const isPart = (it: AiItem): it is Part => it.kind === 'thought' || it.kind === 'tool'

/**
 * ⚠️ 实测（2026-10-09 真机）：DSH 对**所有**工具都发 `kind: "other"`。
 * 所以相位**不能**只看 ACP 的 kind —— 那会把一切都压成 generic（"使用中 / 调用"）。
 * 这也正是 Alma 按工具名查表、而不是按 ACP kind 分类的原因。
 *
 * 分类顺序：① 连写别名精确命中 → ② 分词后逐 token 精确命中 → ③ ACP 的 kind → ④ generic。
 *
 * **这里刻意不做子串匹配**。子串猜看起来聪明，实际是 bug 工厂：
 * `renew` 命中 write、`budget` 命中 get、`spreadsheet` 命中 read。
 * 猜错的代价（把只读的当成改动）远大于猜不出的代价（显示成「调用」，一眼就知道没归类）。
 */
const TOOL_TOKEN_PHASE: Record<string, PhaseKind> = {
  bash: 'running', shell: 'running', sh: 'running', zsh: 'running', terminal: 'running',
  exec: 'running', execute: 'running', run: 'running', command: 'running', script: 'running',
  read: 'exploring', view: 'exploring', cat: 'exploring', open: 'exploring', glob: 'exploring',
  grep: 'exploring', search: 'exploring', find: 'exploring', list: 'exploring', ls: 'exploring',
  fetch: 'exploring', web: 'exploring', browse: 'exploring', query: 'exploring', inspect: 'exploring',
  write: 'making', edit: 'making', create: 'making', new: 'making', mkdir: 'making',
  delete: 'making', remove: 'making', unlink: 'making', move: 'making', rename: 'making',
  patch: 'making', apply: 'making', update: 'making', replace: 'making', append: 'making', insert: 'making',
  todo: 'making',
}

/** 没有分隔符的连写名，分词分不开 —— 显式列出，不靠子串猜 */
const TOOL_ALIAS_PHASE: Record<string, PhaseKind> = {
  todowrite: 'making',
  todoread: 'exploring',
  readfile: 'exploring',
  readthread: 'exploring',
  searchthread: 'exploring',
  websearch: 'exploring',
  webfetch: 'exploring',
  strreplaceeditor: 'making',
  notebookedit: 'making',
  runscript: 'running',
  bashoutput: 'running',
  killshell: 'running',
}

const ACP_KIND_TO_PHASE: Record<string, PhaseKind> = {
  read: 'exploring',
  search: 'exploring',
  fetch: 'exploring',
  edit: 'making',
  delete: 'making',
  move: 'making',
  execute: 'running',
  think: 'thinking',
}

/** 归一化：小写 + 去掉所有分隔符（`web_search` / `web-search` / `webSearch` → `websearch`） */
const normalizeToolName = (name: unknown): string =>
  String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** 分词（`read_file` → ['read','file']）；非 ASCII 名分词为空，走不出去就是 null */
const toolTokens = (name: unknown): string[] =>
  String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** 工具名 → 相位；认不出返回 null（导出以便单测） */
export function phaseKindOfName(name: unknown): PhaseKind | null {
  const flat = normalizeToolName(name)
  if (!flat) return null
  if (TOOL_ALIAS_PHASE[flat]) return TOOL_ALIAS_PHASE[flat]
  for (const t of toolTokens(name)) if (TOOL_TOKEN_PHASE[t]) return TOOL_TOKEN_PHASE[t]
  return null
}

export function phaseKindOf(it: Part): PhaseKind {
  if (it.kind === 'thought') return 'thinking'
  return (
    phaseKindOfName(it.title) ??                       // DSH 把原始工具名放在 title 里
    ACP_KIND_TO_PHASE[String(it.toolKind || '').toLowerCase()] ??
    'generic'
  )
}

/** 相邻同类合并成相位；非 thought/tool 的条目直接跳过（不进轨道） */
export function buildPhases(items: AiItem[]): Phase[] {
  const out: Phase[] = []
  items.forEach((it, index) => {
    if (!isPart(it)) return
    const kind = phaseKindOf(it)
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.items.push(it)
    else out.push({ kind, items: [it], startIndex: index })
  })
  return out
}

/** 汇总计数：thinking 相位按 1 计（跟 Alma 的 countActivityUnits 一致） */
export function countUnits(phases: Phase[]): number {
  return phases.reduce((sum, p) => sum + (p.kind === 'thinking' ? 1 : p.items.length), 0)
}

export const allThinking = (phases: Phase[]): boolean => phases.every((p) => p.kind === 'thinking')

/** rawInput 的两种形状：直接给，或包一层 `{args:{...}}`（ACP 两种都见过） */
const rawArgs = (it: ToolItem): Record<string, any> => {
  const raw = it.rawInput && typeof it.rawInput === 'object' ? (it.rawInput as Record<string, any>) : {}
  return raw.args && typeof raw.args === 'object' ? raw.args : raw
}

// 精确 token，不用子串：`get` 会误伤 get_weather，`cat` 会误伤 category
const FILE_READ_TOKENS = new Set(['read', 'view', 'cat', 'open', 'load'])
const CREATE_TOKENS = new Set(['write', 'create', 'new', 'mkdir', 'touch'])

const hasAnyToken = (name: unknown, set: Set<string>): boolean => toolTokens(name).some((t) => set.has(t))

const isFileRead = (it: Part): boolean => {
  if (it.kind !== 'tool') return false
  if (!hasAnyToken(it.title, FILE_READ_TOKENS)) return false
  const args = rawArgs(it)
  return typeof args.file_path === 'string' || typeof args.path === 'string'
}

const isCreate = (it: Part): boolean => it.kind === 'tool' && hasAnyToken(it.title, CREATE_TOKENS)
// 删除/移动要单独报 —— 归进「编辑」就是把破坏性操作报成普通改动（Alma 的两分法
// 对它自己的工具集是诚实的，因为那个相位里只有 Edit/Write；我们把 delete/move 也归了进来）
const DELETE_TOKENS = new Set(['delete', 'remove', 'unlink'])
const MOVE_TOKENS = new Set(['move', 'rename'])
const isDelete = (it: Part): boolean => it.kind === 'tool' && hasAnyToken(it.title, DELETE_TOKENS)
const isMove = (it: Part): boolean => it.kind === 'tool' && hasAnyToken(it.title, MOVE_TOKENS)

/**
 * 相位的「动词 + 剩余」。同一个相位有进行/完成两态 —— 整棵树看起来「活着」全靠它。
 * 文案与 Alma 逐条对齐：
 *   思考中 / 已思考       探索中 / 已探索 · N 个文件 或 N 处
 *   修改中 / 已修改 · 新建 N · 编辑 M      执行中 / 已执行 · N 条命令
 *   使用中 / 已使用 · N 步
 */
export function phaseLabel(phase: Phase, live: boolean): { verb: string; rest: string } {
  const n = phase.items.length
  switch (phase.kind) {
    case 'thinking':
      return { verb: live ? '思考中' : '已思考', rest: '' }
    case 'exploring': {
      // 全是「读文件」才说「N 个文件」，否则一律「N 处」（同 Alma：reads === n ? files : places）
      const files = phase.items.filter(isFileRead).length
      return { verb: live ? '探索中' : '已探索', rest: `${n} ${files === n && n > 0 ? '个文件' : '处'}` }
    }
    case 'making': {
      // 四类分开计：新建 / 编辑 / 删除 / 移动，只报非零项。
      // （Alma 只分新建与编辑，因为它的 making 集合里只有 Edit/Write；我们多收了两类，
      //   就必须把它们说出来，否则一次删除会显示成「编辑 1」。）
      const creates = phase.items.filter(isCreate).length
      const deletes = phase.items.filter(isDelete).length
      const moves = phase.items.filter(isMove).length
      const edits = n - creates - deletes - moves
      const pieces: string[] = []
      if (creates) pieces.push(`新建 ${creates}`)
      if (edits) pieces.push(`编辑 ${edits}`)
      if (deletes) pieces.push(`删除 ${deletes}`)
      if (moves) pieces.push(`移动 ${moves}`)
      return { verb: live ? '修改中' : '已修改', rest: pieces.join(' · ') }
    }
    case 'running':
      return { verb: live ? '执行中' : '已执行', rest: `${n} 条命令` }
    default:
      return { verb: live ? '使用中' : '已使用', rest: n > 1 ? `${n} 步` : '' }
  }
}

/** 动词：与相位同一套精确查表（同样不做子串猜） */
const VERB_BY_TOKEN: Record<string, string> = {
  bash: '执行', shell: '执行', sh: '执行', zsh: '执行', terminal: '执行',
  exec: '执行', execute: '执行', run: '执行', command: '执行', script: '执行',
  glob: '搜索', grep: '搜索', search: '搜索', find: '搜索', query: '搜索', ls: '搜索',
  fetch: '抓取', browse: '抓取', http: '抓取', url: '抓取',
  write: '新建', create: '新建', new: '新建', mkdir: '新建', touch: '新建',
  delete: '删除', remove: '删除', unlink: '删除',
  move: '移动', rename: '移动',
  edit: '编辑', patch: '编辑', replace: '编辑', apply: '编辑', update: '编辑',
  append: '编辑', insert: '编辑',
  read: '查看', view: '查看', cat: '查看', get: '查看', open: '查看', load: '查看', list: '查看',
  todo: '计划', task: '计划', plan: '计划',
  skill: '用了技能',
}

/** 连写名单独给动词（分词分不开） */
const VERB_BY_ALIAS: Record<string, string> = {
  websearch: '搜索',
  webfetch: '抓取',
  strreplaceeditor: '编辑',
  notebookedit: '编辑',
  runscript: '执行',
  bashoutput: '执行',
  killshell: '执行',
  todowrite: '计划',
  todoread: '计划',
}

const VERB_BY_ACP_KIND: Record<string, string> = {
  read: '查看', search: '搜索', fetch: '抓取', edit: '编辑',
  delete: '删除', move: '移动', execute: '执行', think: '思考',
}

export type ToolRow = { verb: string; object: string; running: boolean; error: boolean }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * 只做展示必需的规整，**不改写原文语义**：
 * - 折行挤成单空格（heredoc / 多行命令会把一行撑爆）
 * - 超长截断（CSS 也会 ellipsis；这里兜住 title 属性这种没有 CSS 的场景）
 * - 深路径折叠中间段，但**保留前导 `/`**
 *   （前一版把 `/a/b/c.md` 变成 `a/b/c.md` —— 展示层不该篡改数据）
 */
function shorten(v: string): string {
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  if (!s.includes(' ') && s.includes('/')) {
    const segs = s.split('/').filter(Boolean)
    if (segs.length > 3) return `${s.startsWith('/') ? '/' : ''}…/${segs.slice(-3).join('/')}`
    return s
  }
  return s.length > 80 ? `${s.slice(0, 79)}…` : s
}

/**
 * 一行 = 动词 + 宾语。
 * 宾语优先取 rawInput 里最有信息量的那个字段（命令 / 路径 / 模式 / 查询词），
 * 取不到才退回 title —— DSH 的 title 只有工具名（"bash"），单用它读起来没有内容。
 */
export function rowForTool(it: ToolItem): ToolRow {
  const name = String(it.title || '').trim()
  const kind = String(it.toolKind || '').toLowerCase()

  const args = rawArgs(it)
  // command 优先于 description：DSH 的 description 是自动生成的英文样板
  // （"List all files in current directory"），当宾语还不如命令本身。
  const detail =
    str(args.command) ||
    str(args.description) ||
    str(args.file_path) ||
    str(args.path) ||
    str(args.pattern) ||
    str(args.query) ||
    str(args.url) ||
    ''

  const verb =
    VERB_BY_ALIAS[normalizeToolName(name)] ||
    toolTokens(name).map((t) => VERB_BY_TOKEN[t]).find(Boolean) ||
    VERB_BY_ACP_KIND[kind] ||
    '调用'

  return {
    verb,
    object: shorten(detail) || shorten(name) || '…',
    running: it.status === 'pending' || it.status === 'in_progress',
    error: it.status === 'failed',
  }
}

/** 一个回合的流水切成「块」：连续的 thought+tool 合成一个活动轨道，其余原样流过 */
export type Block =
  | { type: 'flow'; item: AiItem; i: number }
  | { type: 'activity'; phases: Phase[]; key: string; i: number }

export function groupBlocks(items: AiItem[]): Block[] {
  const out: Block[] = []
  let i = 0
  while (i < items.length) {
    const it = items[i]
    if (isPart(it)) {
      let j = i
      while (j < items.length && isPart(items[j])) j++
      out.push({ type: 'activity', phases: buildPhases(items.slice(i, j)), key: `act-${i}-${items[i].at}`, i })
      i = j
    } else {
      out.push({ type: 'flow', item: it, i })
      i++
    }
  }
  return out
}
