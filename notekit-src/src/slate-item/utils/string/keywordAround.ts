import { escapeRegExp } from '../regexp'

/**
 * 以一个关键字为圆心，截取周围的字符串
 * @param content
 * @param keyword
 * @param totalLen 截取后的字符串长度
 * @returns
 */
export function keywordAround(
  content: string,
  keyword: string,
  totalLen: number
) {
  const reg = new RegExp(`(.*?)(${escapeRegExp(keyword)})(.*)`, 'ig')
  const match = reg.exec(content)
  if (!match) {
    return [content]
  }
  // const [left, ...rest] = content.split(reg);
  const [, lf, kw, rg] = match
  const leftLen = Math.floor((totalLen - kw.length) / 2)
  const pos = lf.length > leftLen ? lf.length - leftLen : 0
  let leftStr = lf.slice(pos)
  if (leftStr !== lf) {
    leftStr = `...${leftStr}`
  }
  const rightLen = leftLen + (leftLen - leftStr.length)
  let rightStr = rg.slice(0, rightLen)
  if (rightStr !== rg) {
    rightStr = `${rightStr}...`
  }
  return [leftStr, kw, rightStr]
}
