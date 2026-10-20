/**
 * 正文里的纯文本 URL 命中测试。
 *
 * 2026-10-20 用户报障「笔记正文里面，链接不能点击」：编辑器里只有**超链接元素**
 * （粘贴 URL 会自动转成它）可点；手打、或 AI 直接写进正文的裸 URL 只是普通文字，
 * 点下去只会落光标。这里负责回答一个问题：这个坐标点到的字符，是不是落在一段 URL 里。
 *
 * 判定只认带协议的写法（http/https/mailto），不猜裸域名 —— 猜错会把普通词变成外链。
 */

/** URL 允许出现的 ASCII 字符；遇到空格、中文、全角标点即断开 */
const URL_CHARS = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/
/** 句末标点通常不属于 URL（"见 https://a.com/x。" 这类） */
const TRAILING_PUNCT = /[.,;:!?'")\]]/
const SCHEME = /(?:https?:\/\/|mailto:)/gi

export type UrlHit = { url: string; start: number; end: number }

/** 在纯文本里找包含 offset 的那段 URL（offset 可落在末尾，方便点 URL 最后一个字符） */
export function urlAtOffset(text: string, offset: number): UrlHit | null {
  if (!text) return null
  SCHEME.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SCHEME.exec(text))) {
    let end = m.index + m[0].length
    while (end < text.length && URL_CHARS.test(text[end])) end++
    while (end > m.index && TRAILING_PUNCT.test(text[end - 1])) end--
    if (offset >= m.index && offset <= end && end > m.index + m[0].length) {
      return { url: text.slice(m.index, end), start: m.index, end }
    }
    // 空匹配保护：别让 lastIndex 卡在同一位置
    if (end <= m.index) SCHEME.lastIndex = m.index + 1
  }
  return null
}

/**
 * 屏幕坐标 → 正文里的一段 URL。
 * 只认可编辑区里的文字；超链接元素（<a>）由 Router 的点击拦截负责，这里跳过，
 * 否则一次点击会开出两个标签页。
 */
export function urlHitAtPoint(x: number, y: number): { url: string; node: Text } | null {
  if (typeof document === 'undefined' || !document.caretRangeFromPoint) return null
  const range = document.caretRangeFromPoint(x, y)
  if (!range) return null
  const node = range.startContainer
  if (!(node instanceof Text) || !node.nodeValue) return null
  const parent = node.parentElement
  if (!parent?.closest('[contenteditable="true"]')) return null
  if (parent.closest('a')) return null
  const hit = urlAtOffset(node.nodeValue, range.startOffset)
  return hit ? { url: hit.url, node } : null
}
