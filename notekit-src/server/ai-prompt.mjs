/**
 * ACP prompt 的环境信息组装 —— 纯函数，从 ai-acp-routes.mjs 抽出（单测在 server/tests/ai-prompt.test.mjs）。
 *
 * 隐私边界（硬约束）：环境信息只带「当前页面 + 页内被显式选中的块」，不拼任何页面之外的内容。
 *   - 无选块：维持 v1 约定，只给 ky + 标题，正文由 agent 用 `ev get --ky` 自取；
 *   - 有选块：块原文内联（渲染层已做截断），并明确「选中的块是本次对象」——
 *     这来自用户显式圈选，属于已授权范围；整篇笔记仍只是「可用 ev 读取」的提示，不主动塞。
 */

/** 选块必须是带非空 text 的对象才参与渲染 */
function selectionBlocksOf(note) {
  const blocks = note && note.selection && Array.isArray(note.selection.blocks) ? note.selection.blocks : null
  if (!blocks) return null
  const out = blocks.filter((b) => b && typeof b.text === 'string' && b.text.trim())
  return out.length > 0 ? out : null
}

export function composePrompt(text, note) {
  const parts = []
  const n = note && typeof note === 'object' ? note : null
  const selBlocks = n ? selectionBlocksOf(n) : null

  if (n && (n.title || n.ky || n.body || selBlocks)) {
    if (selBlocks) {
      const id = n.ky ? `（ky=${n.ky}）` : ''
      const pageHint = n.ky ? `如需整篇笔记的上下文，可用 ev get --ky ${n.ky} 读取。` : ''
      const lines = selBlocks.map((b, i) => {
        const tag = b.ky ? `（ky=${b.ky}）` : ''
        return `<块 ${i + 1}${tag}>\n${b.text}\n</块 ${i + 1}>`
      })
      parts.push(
        `【环境信息】用户正在 Evergreen note 中查看笔记「${n.title || '(无标题)'}」${id}，` +
          `并选中了其中 ${selBlocks.length} 个块（原文如下，按界面顺序）。本次请求优先以这些选中块为对象。${pageHint}\n\n` +
          lines.join('\n\n')
      )
    } else {
      const id = n.ky ? `（ky=${n.ky}）` : ''
      parts.push(
        `【环境信息】用户正在 Evergreen note 中查看笔记「${n.title || '(无标题)'}」${id}。` +
          `若本次请求与这篇笔记相关，可用 ev get --ky ${n.ky} 读取或向它追加；若无关（例如整理整个库、处理别的内容），忽略此条即可。`
      )
    }
  }
  parts.push(String(text || ''))
  return parts.join('\n\n')
}

export default composePrompt
