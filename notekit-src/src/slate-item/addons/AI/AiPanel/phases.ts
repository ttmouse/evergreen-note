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

type ThoughtItem = Extract<AiItem, { kind: 'thought' }>
export type ToolItem = Extract<AiItem, { kind: 'tool' }>
type Part = ThoughtItem | ToolItem

export type Phase = {
  kind: PhaseKind
  items: Part[]
  /** 在源 items 里的下标，用于稳定 key */
  startIndex: number
}

/** 轨道上最多显示几个相位头像，其余收成 +N */
export const MAX_VISIBLE_PHASES = 8

const isPart = (it: AiItem): it is Part => it.kind === 'thought' || it.kind === 'tool'

// ------------------------------------------------------------------ 工具表

/**
 * **一张表，多个属性。** 一个工具名对应的事实只有一组：它属于哪个相位、行上用哪个动词、
 * 是否读文件（决定「N 个文件」还是「N 处」）、是否属于 making 的某个子类
 * （决定「新建/编辑/删除/移动 N」怎么分）。
 *
 * 为什么坚持一张表：这里原先有五张并行表（token→相位、连写名→相位、token→动词、
 * 连写名→动词、四个子类 token 集合）。给 `grep` 补了分类却忘了补动词，
 * 行里就会显示「调用」——**而且不报错**。一个事实只在一处说，才不会漂。
 *
 * key 是**归一化后的名或 token**（小写、去掉所有非字母数字）。
 * 查表分两级：① 整名命中（覆盖 readfile / websearch 这类连写名）→ ② 分词命中
 * （覆盖 my_custom_bash 这种带前缀的名）。
 *
 * ⚠️ **刻意不做子串匹配**。子串猜看起来聪明，实际是 bug 工厂：
 * `renew` 命中 write、`budget` 命中 get、`spreadsheet` 命中 read。
 * 猜错的代价（把只读的当成改动）远大于猜不出的代价（显示成「调用」，一眼就知道没归类）。
 */
type ToolSpec = {
  phase: PhaseKind
  verb: string
  /** 读文件类；配合 rawInput 里的 file_path 计入「N 个文件」 */
  readsFile?: boolean
  /** making 的子类，用于分项计数。缺省即「编辑」 */
  makes?: 'create' | 'delete' | 'move'
}

const TOOLS: Record<string, ToolSpec> = {
  // —— 执行
  bash: { phase: 'running', verb: '执行' },
  shell: { phase: 'running', verb: '执行' },
  sh: { phase: 'running', verb: '执行' },
  zsh: { phase: 'running', verb: '执行' },
  terminal: { phase: 'running', verb: '执行' },
  exec: { phase: 'running', verb: '执行' },
  execute: { phase: 'running', verb: '执行' },
  run: { phase: 'running', verb: '执行' },
  command: { phase: 'running', verb: '执行' },
  script: { phase: 'running', verb: '执行' },
  bashoutput: { phase: 'running', verb: '执行' }, // 连写名
  killshell: { phase: 'running', verb: '执行' }, // 连写名
  runscript: { phase: 'running', verb: '执行' }, // 连写名

  // —— 探索：读
  read: { phase: 'exploring', verb: '查看', readsFile: true },
  view: { phase: 'exploring', verb: '查看', readsFile: true },
  cat: { phase: 'exploring', verb: '查看', readsFile: true },
  open: { phase: 'exploring', verb: '查看', readsFile: true },
  load: { phase: 'exploring', verb: '查看', readsFile: true },
  get: { phase: 'exploring', verb: '查看' },
  list: { phase: 'exploring', verb: '查看' },
  ls: { phase: 'exploring', verb: '查看' },
  readfile: { phase: 'exploring', verb: '查看', readsFile: true }, // 连写名
  readthread: { phase: 'exploring', verb: '查看' }, // 连写名
  searchthread: { phase: 'exploring', verb: '查看' }, // 连写名
  todoread: { phase: 'exploring', verb: '查看' }, // 连写名
  tasklist: { phase: 'exploring', verb: '查看' }, // 连写名
  taskget: { phase: 'exploring', verb: '查看' }, // 连写名

  // —— 探索：搜
  glob: { phase: 'exploring', verb: '搜索' },
  grep: { phase: 'exploring', verb: '搜索' },
  search: { phase: 'exploring', verb: '搜索' },
  find: { phase: 'exploring', verb: '搜索' },
  query: { phase: 'exploring', verb: '搜索' },
  inspect: { phase: 'exploring', verb: '搜索' },
  websearch: { phase: 'exploring', verb: '搜索' }, // 连写名

  // —— 探索：取
  fetch: { phase: 'exploring', verb: '抓取' },
  web: { phase: 'exploring', verb: '抓取' },
  browse: { phase: 'exploring', verb: '抓取' },
  http: { phase: 'exploring', verb: '抓取' },
  url: { phase: 'exploring', verb: '抓取' },
  webfetch: { phase: 'exploring', verb: '抓取' }, // 连写名

  // —— 修改：新建
  write: { phase: 'making', verb: '新建', makes: 'create' },
  create: { phase: 'making', verb: '新建', makes: 'create' },
  new: { phase: 'making', verb: '新建', makes: 'create' },
  mkdir: { phase: 'making', verb: '新建', makes: 'create' },
  touch: { phase: 'making', verb: '新建', makes: 'create' },

  // —— 修改：编辑
  edit: { phase: 'making', verb: '编辑' },
  patch: { phase: 'making', verb: '编辑' },
  apply: { phase: 'making', verb: '编辑' },
  update: { phase: 'making', verb: '编辑' },
  replace: { phase: 'making', verb: '编辑' },
  append: { phase: 'making', verb: '编辑' },
  insert: { phase: 'making', verb: '编辑' },
  todo: { phase: 'making', verb: '编辑' },
  strreplaceeditor: { phase: 'making', verb: '编辑' }, // 连写名
  notebookedit: { phase: 'making', verb: '编辑' }, // 连写名
  todowrite: { phase: 'making', verb: '编辑' }, // 连写名

  // —— 修改：删除 / 移动（必须分项报，归进「编辑」就是把破坏性操作说轻）
  delete: { phase: 'making', verb: '删除', makes: 'delete' },
  remove: { phase: 'making', verb: '删除', makes: 'delete' },
  unlink: { phase: 'making', verb: '删除', makes: 'delete' },
  move: { phase: 'making', verb: '移动', makes: 'move' },
  rename: { phase: 'making', verb: '移动', makes: 'move' },

  // —— 用技能
  skill: { phase: 'generic', verb: '用了技能' },
}

/** ACP 的 tool_call.kind 只在工具名认不出时兜底 —— 实测 DSH 一律发 "other"，不可靠 */
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

const ACP_KIND_TO_VERB: Record<string, string> = {
  read: '查看',
  search: '搜索',
  fetch: '抓取',
  edit: '编辑',
  delete: '删除',
  move: '移动',
  execute: '执行',
  think: '思考',
}

/** 归一化：小写 + 去掉所有分隔符（`web_search` / `web-search` / `webSearch` → `websearch`） */
const normalizeToolName = (name: unknown): string => String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** 分词（`read_file` → ['read','file']）；非 ASCII 名分词为空，走不出去就是 null */
const toolTokens = (name: unknown): string[] =>
  String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** 工具名 → 规格；认不出返回 null */
const specOf = (name: unknown): ToolSpec | null => {
  const flat = normalizeToolName(name)
  if (!flat) return null
  return TOOLS[flat] ?? toolTokens(name).map((t) => TOOLS[t]).find(Boolean) ?? null
}

/** 工具名 → 相位；认不出返回 null（导出以便单测） */
export function phaseKindOfName(name: unknown): PhaseKind | null {
  return specOf(name)?.phase ?? null
}

export function phaseKindOf(it: Part): PhaseKind {
  if (it.kind === 'thought') return 'thinking'
  return (
    phaseKindOfName(it.title) ?? // DSH 把原始工具名放在 title 里
    ACP_KIND_TO_PHASE[String(it.toolKind || '').toLowerCase()] ??
    'generic'
  )
}

// ------------------------------------------------------------------ 分相位

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

// ------------------------------------------------------------------ 文案

/** rawInput 的两种形状：直接给，或包一层 `{args:{...}}`（ACP 两种都见过） */
const rawArgs = (it: ToolItem): Record<string, any> => {
  const raw = it.rawInput && typeof it.rawInput === 'object' ? (it.rawInput as Record<string, any>) : {}
  return raw.args && typeof raw.args === 'object' ? raw.args : raw
}

const hasFilePath = (it: ToolItem): boolean => {
  const args = rawArgs(it)
  return typeof args.file_path === 'string' || typeof args.path === 'string'
}

/**
 * 相位的**名词**（一个词，不带进行/完成态）—— 只给头像 tooltip 用。
 * 不复用 phaseLabel 的动词：那个是两态（思考中/已思考），当悬停提示用会别扭。
 */
export const PHASE_NOUN: Record<PhaseKind, string> = {
  thinking: '思考',
  exploring: '探索',
  making: '修改',
  running: '执行',
  generic: '其他工具',
}

/**
 * 相位的「动词 + 剩余」。同一个相位有进行/完成两态 —— 整棵树看起来「活着」全靠它。
 * 文案与 Alma 逐条对齐：
 *   思考中 / 已思考       探索中 / 已探索 · N 个文件 或 N 处
 *   修改中 / 已修改 · 新建 N · 编辑 M · 删除 K · 移动 J
 *   执行中 / 已执行 · N 条命令      使用中 / 已使用 · N 步
 */
export function phaseLabel(phase: Phase, live: boolean): { verb: string; rest: string } {
  const n = phase.items.length
  const tools = phase.items.filter((it): it is ToolItem => it.kind === 'tool')
  switch (phase.kind) {
    case 'thinking':
      return { verb: live ? '思考中' : '已思考', rest: '' }
    case 'exploring': {
      // 全是「读文件」才说「N 个文件」，否则一律「N 处」（同 Alma：reads === n ? files : places）
      const files = tools.filter((it) => specOf(it.title)?.readsFile && hasFilePath(it)).length
      return { verb: live ? '探索中' : '已探索', rest: `${n} ${files === n && n > 0 ? '个文件' : '处'}` }
    }
    case 'making': {
      // 四类分开计，只报非零项 —— 与 TOOLS 表同一份事实，不会漂
      const makes = (k: string) => tools.filter((it) => specOf(it.title)?.makes === k).length
      const creates = makes('create')
      const deletes = makes('delete')
      const moves = makes('move')
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

// ------------------------------------------------------------------ 行

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
 * 取不到才退回工具名 —— DSH 的 title 只有工具名（"bash"），单用它读起来没有内容。
 * command 优先于 description：DSH 的 description 是自动生成的英文样板
 * （"List all files in current directory"），当宾语还不如命令本身。
 */
export function rowForTool(it: ToolItem): ToolRow {
  const name = String(it.title || '').trim()
  const kind = String(it.toolKind || '').toLowerCase()
  const args = rawArgs(it)
  const detail =
    str(args.command) ||
    str(args.description) ||
    str(args.file_path) ||
    str(args.path) ||
    str(args.pattern) ||
    str(args.query) ||
    str(args.url) ||
    ''

  return {
    // 动词与相位同源：同一张 TOOLS 表
    verb: specOf(name)?.verb ?? ACP_KIND_TO_VERB[kind] ?? '调用',
    object: shorten(detail) || shorten(name) || '…',
    running: it.status === 'pending' || it.status === 'in_progress',
    error: it.status === 'failed',
  }
}

// ------------------------------------------------------------------ 分块

/** 一个回合的流水切成「块」：连续的 thought+tool 合成一个活动轨道，其余原样流过 */
type Block =
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
