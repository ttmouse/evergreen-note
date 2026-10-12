import { Element, Node, Text } from '../../slate.inc'

const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** 整段文字是否就是一张 GFM 管道表格（表头行 + 分隔行 + 若干数据行，每行都含 |） */
export function isTableText(s: string) {
  const lines = s.replace(/\u200b/g, '').trim().split('\n')
  return lines.length >= 2 && SEP.test(lines[1]) && lines.every((l) => l.includes('|'))
}

/**
 * 节点正文若只由纯文字组成且整段是表格，返回表格源码；否则 null。
 * 带行内元素（双链、公式等）的正文不当表格渲染，避免丢信息。
 */
export function tableSourceOf(el: Element): string | null {
  if (!el.children.every((c) => Text.isText(c))) return null
  const s = Node.string(el)
  return isTableText(s) ? s.replace(/\u200b/g, '').trim() : null
}

function splitRow(line: string) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return s.split(/(?<!\\)\|/).map((c) => c.trim())
}

/**
 * 把 GFM 表格文字转成 Roam 式节点表格（layout=tablesimple）：
 * 每行一个子节点，行的正文是第一格，其余各格依次是这一行的子节点；表头就是第一行。
 * 不是表格时返回 null。
 */
export function tableTextToOutline(s: string): { ori: string; layout: string; subitems: any[] } | null {
  if (!isTableText(s)) return null
  const lines = s.replace(/\u200b/g, '').trim().split('\n')
  const rows = [lines[0], ...lines.slice(2)].map(splitRow)
  const width = Math.max(...rows.map((r) => r.length))
  return {
    ori: '',
    layout: 'tablesimple',
    subitems: rows.map((r) => ({
      ori: r[0] ?? '',
      subitems: Array.from({ length: width - 1 }, (_, i) => ({ ori: r[i + 1] ?? '', subitems: [] })),
    })),
  }
}
