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
 * ACP 的 tool_call.kind 本身就够用（不像 Alma 要拿工具名去查表）：
 * read/search/fetch → 探索，edit/delete/move → 修改，execute → 执行，其余归 generic。
 */
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

export function phaseKindOf(it: Part): PhaseKind {
  if (it.kind === 'thought') return 'thinking'
  return ACP_KIND_TO_PHASE[String(it.toolKind || '').toLowerCase()] || 'generic'
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

/** 动词按 ACP kind 细分（比相位粗粒度再细一档） */
const VERB_BY_KIND: Record<string, string> = {
  read: '查看',
  search: '搜索',
  fetch: '抓取',
  edit: '编辑',
  delete: '删除',
  move: '移动',
  execute: '执行',
  think: '思考',
}

export type ToolRow = { verb: string; object: string; running: boolean; error: boolean }

/**
 * 一行 = 动词 + 宾语。
 * ACP 的 tool_call.title 本来就是人话（如「查看 Alma 应用资源目录」），直接当宾语——
 * 等于白送 Alma 自己拼的 verb + object。
 */
export function rowForTool(it: ToolItem): ToolRow {
  const kind = String(it.toolKind || '').toLowerCase()
  return {
    verb: VERB_BY_KIND[kind] || '调用',
    object: String(it.title || '').trim() || '…',
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
