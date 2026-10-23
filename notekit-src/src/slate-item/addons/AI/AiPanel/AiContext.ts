/**
 * AI 面板的「上下文解析」—— 纯函数，不依赖 React / DOM。
 * 选中块的 DOM 读取由调用方（AiPanelComp）注入，这里只吃纯数据，
 * 跟 phases.ts 一样是可以脱 UI 单测的接缝。
 *
 * 语义（优先级，任务拍板「页面和块同时有值时必须明确」）：
 *   1. 选中块（BlockSelection 多选）→ selection：用户显式圈了范围，块是主对象，
 *      块原文随请求内联（agent 不必再去读库）；页面只作背景（标题 + ky）。
 *   2. 否则当前页面（editorView.currentItemKy）→ page：维持 v1 约定，
 *      只给 ky + 标题，正文由 agent 自己用 `ev get --ky` 读取。
 *   3. 都没有 → null：上下文行显示「无上下文」，自由对话仍可用。
 *
 * 隐私边界（硬约束）：默认只出「当前页面及其中被显式选中的块」，
 * 不拼任何页面之外的内容；内联原文有截断上限，防止一次拖 选整页把请求撑爆。
 */

export type AiContextBlock = { ky?: string; text: string }

export type AiContext =
  | { mode: 'selection'; blocks: AiContextBlock[]; pageKy?: string; pageTitle?: string }
  | { mode: 'page'; pageKy: string; pageTitle?: string }

/** 单块内联原文上限：块再长也只是背景之一，不该独占整个请求 */
export const MAX_BLOCK_CHARS = 1500
/** 一次随请求内联的块原文总量上限（含截断标记在内，硬上限不破） */
export const MAX_SELECTION_CHARS = 12000

const TRUNC_MARK = '……（超长截断）'

/** 截到 max **含标记在内**：截出的串（含标记）不会超过 max，总量账才对得上 */
const clip = (text: string, max: number): string => {
  const s = String(text ?? '')
  if (s.length <= max) return s
  return s.slice(0, Math.max(0, max - TRUNC_MARK.length)) + TRUNC_MARK
}

export type ResolveAiContextInput = {
  pageKy?: string | null
  pageTitle?: string | null
  /** 已按界面顺序解析好的选中块（调用方从 DOM 读）；空文本块会被丢弃 */
  blocks: AiContextBlock[]
}

/** 有选中块 → selection（哪怕只有一块）；否则有页面 → page；否则 null */
export function resolveAiContext(input: ResolveAiContextInput): AiContext | null {
  const blocks = (input.blocks ?? []).filter((b) => !!b && typeof b.text === 'string' && !!b.text.trim())
  if (blocks.length > 0) {
    return {
      mode: 'selection',
      blocks,
      pageKy: input.pageKy || undefined,
      pageTitle: input.pageTitle || undefined,
    }
  }
  if (input.pageKy) return { mode: 'page', pageKy: input.pageKy, pageTitle: input.pageTitle || undefined }
  return null
}

/**
 * 上下文行的一句话标签。选中块在前（它是主对象），页面退居背景。
 * 页面无标题时给「当前页面」——别拿 ky 这个内部符号去烦用户。
 */
export function contextLabel(ctx: AiContext): string {
  if (ctx.mode === 'selection') {
    const page = ctx.pageTitle ? ` · 页「${ctx.pageTitle}」` : ''
    return `${ctx.blocks.length} 个选中块${page}`
  }
  return ctx.pageTitle ? `页「${ctx.pageTitle}」` : '当前页面'
}

export type AiNoteRef = {
  ky?: string
  title?: string
  selection?: { blocks: AiContextBlock[] }
}

/**
 * 随请求发给服务端的 note（/api/ai/acp/prompt 的 note 字段）。
 *   page 模式：维持 v1 约定，只给 ky + 标题（正文 agent 自取）；
 *   selection 模式：块原文内联，逐块截断 + 总量截断，超限的块直接舍弃（拼不下的装不下，别塞半块谎称完整）。
 */
export function contextNote(ctx: AiContext): AiNoteRef {
  if (ctx.mode === 'page') return { ky: ctx.pageKy, title: ctx.pageTitle }
  const blocks: AiContextBlock[] = []
  let total = 0
  for (const b of ctx.blocks) {
    const room = MAX_SELECTION_CHARS - total
    // 剩余空间连一个截断标记都装不下：这个块整块舍弃（宁少勿溢）
    if (room <= TRUNC_MARK.length) break
    const text = clip(b.text, Math.min(MAX_BLOCK_CHARS, room))
    total += text.length
    blocks.push({ ky: b.ky, text })
  }
  return { ky: ctx.pageKy, title: ctx.pageTitle, selection: { blocks } }
}
