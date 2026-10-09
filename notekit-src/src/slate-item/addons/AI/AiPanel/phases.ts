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

export const isPart = (it: AiItem): it is Part => it.kind === 'thought' || it.kind === 'tool'

/**
 * ⚠️ 实测（2026-10-09 真机）：DSH 对**所有**工具都发 `kind: "other"`。
 * 所以相位**不能**只看 ACP 的 kind —— 那会把一切都压成 generic（"使用中 / 调用"）。
 * 这也正是 Alma 按工具名查表、而不是按 ACP kind 分类的原因。
 *
 * 分类顺序：① 工具名的分词命中 → ② 工具名的子串命中 → ③ ACP 的 kind。
 */
const TOKEN_TO_PHASE: Record<string, PhaseKind> = {
  bash: 'running', shell: 'running', sh: 'running', zsh: 'running', terminal: 'running',
  exec: 'running', execute: 'running', run: 'running', command: 'running', script: 'running',
  read: 'exploring', view: 'exploring', cat: 'exploring', get: 'exploring', glob: 'exploring',
  grep: 'exploring', search: 'exploring', find: 'exploring', list: 'exploring', ls: 'exploring',
  fetch: 'exploring', web: 'exploring', browse: 'exploring', query: 'exploring', inspect: 'exploring',
  write: 'making', edit: 'making', create: 'making', delete: 'making', remove: 'making',
  move: 'making', rename: 'making', patch: 'making', apply: 'making', update: 'making',
  append: 'making', insert: 'making',
}

/** 分词没命中时的兜底：整名子串匹配（工具名可能完全没分隔符，如 todowrite） */
const SUBSTRING_RULES: Array<[RegExp, PhaseKind]> = [
  [/(bash|shell|terminal|exec|command|script)/, 'running'],
  [/(read|view|cat|glob|grep|search|find|list|fetch|web|browse|inspect)/, 'exploring'],
  [/(write|edit|create|delete|remove|move|rename|patch|apply|todo)/, 'making'],
]

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

/** 工具名 → 相位（导出以便单测） */
export function phaseKindOfName(name: string): PhaseKind | null {
  const n = String(name || '').toLowerCase().trim()
  if (!n) return null
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean)
  for (const t of tokens) if (TOKEN_TO_PHASE[t]) return TOKEN_TO_PHASE[t]
  for (const t of tokens) for (const s of Object.keys(TOKEN_TO_PHASE)) if (t.includes(s)) return TOKEN_TO_PHASE[s]
  for (const [re, kind] of SUBSTRING_RULES) if (re.test(n)) return kind
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

/** 相位里所有 part 都收尾了吗（用于判断「还在跑」） */
export function phaseSettled(phase: Phase): boolean {
  return phase.items.every((it) => {
    if (it.kind === 'thought') return true
    return it.status === 'completed' || it.status === 'failed'
  })
}

/** 汇总计数：thinking 相位按 1 计（跟 Alma 的 countActivityUnits 一致） */
export function countUnits(phases: Phase[]): number {
  return phases.reduce((sum, p) => sum + (p.kind === 'thinking' ? 1 : p.items.length), 0)
}

export const allThinking = (phases: Phase[]): boolean => phases.every((p) => p.kind === 'thinking')

/**
 * 相位的「动词 + 剩余」。同一个相位有进行/完成两态 —— 整棵树看起来「活着」全靠它。
 *   思考中 / 已思考     探索中 / 已探索 · N 处     修改中 / 已修改 · N 处改动
 *   执行中 / 已执行 · N 条命令                     使用中 / 已使用 · N 步
 */
export function phaseLabel(phase: Phase, live: boolean): { verb: string; rest: string } {
  const n = phase.items.length
  switch (phase.kind) {
    case 'thinking':
      return { verb: live ? '思考中' : '已思考', rest: '' }
    case 'exploring':
      return { verb: live ? '探索中' : '已探索', rest: `${n} 处` }
    case 'making':
      return { verb: live ? '修改中' : '已修改', rest: `${n} 处改动` }
    case 'running':
      return { verb: live ? '执行中' : '已执行', rest: `${n} 条命令` }
    default:
      return { verb: live ? '使用中' : '已使用', rest: n > 1 ? `${n} 步` : '' }
  }
}

/** 动词：同样按工具名细分（ACP kind 不可靠，见上） */
const VERB_RULES: Array<[RegExp, string]> = [
  [/(bash|shell|terminal|exec|command|script|run)/, '执行'],
  [/(glob|grep|search|find|query)/, '搜索'],
  [/(fetch|web|browse|http|url)/, '抓取'],
  [/(write|create|new)/, '新建'],
  [/(delete|remove)/, '删除'],
  [/(move|rename)/, '移动'],
  [/(edit|patch|apply|update|append|insert|replace)/, '编辑'],
  [/(read|view|cat|get|glob|list)/, '查看'],
  [/(todo|task|plan)/, '计划'],
  [/(skill)/, '用了技能'],
]

const VERB_BY_ACP_KIND: Record<string, string> = {
  read: '查看', search: '搜索', fetch: '抓取', edit: '编辑',
  delete: '删除', move: '移动', execute: '执行', think: '思考',
}

export type ToolRow = { verb: string; object: string; running: boolean; error: boolean }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** 长路径只留末 3 段；其他文本截到 80 字（一行放不下就没意义了） */
export function shorten(v: string): string {
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  if (s.includes('/') && !s.includes(' ')) {
    const parts = s.split('/').filter(Boolean)
    return parts.length <= 3 ? s.replace(/^\//, '') : '…/' + parts.slice(-3).join('/')
  }
  return s.length > 80 ? s.slice(0, 79) + '…' : s
}

/**
 * 一行 = 动词 + 宾语。
 * 宾语优先取 rawInput 里最有信息量的那个字段（命令 / 路径 / 模式 / 查询词），
 * 取不到才退回 title —— DSH 的 title 只有工具名（"bash"），单用它读起来没有内容。
 */
export function rowForTool(it: ToolItem): ToolRow {
  const name = String(it.title || '').trim()
  const kind = String(it.toolKind || '').toLowerCase()

  const raw = it.rawInput && typeof it.rawInput === 'object' ? (it.rawInput as Record<string, any>) : {}
  const args = raw.args && typeof raw.args === 'object' ? raw.args : raw
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
    VERB_RULES.find(([re]) => re.test(name.toLowerCase()))?.[1] ||
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
