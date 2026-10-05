import { escapeRegExp } from '../../utils/regexp'
import { LogicString } from './Logic'

export function parseNumber(str: LogicString): LogicString | number {
  if (/^\d+$/.test(str)) {
    return Number(str)
  }
  return str
}

// 解析匹配字符串中的 item.property
export function parseVariable(str: LogicString): (v: any) => any {
  if (str.startsWith('item.')) {
    const [, key] = str.split(/\.\s*/)
    return (item: UnitPersist) => parseNumber((item as any)[key])
  }
  return () => parseNumber(str)
}

export function parseVariableLeft(str: LogicString): (v: any) => any {
  if (str.startsWith('item.')) {
    const [, key] = str.split(/\.\s*/)
    return (item: UnitPersist) => parseNumber((item as any)[key])
  }
  return (item: UnitPersist) => {
    if (str in item) {
      return parseNumber((item as any)[str])
    }
    return parseNumber(str)
  }
}

// 对通配符 * 做特殊处理
export function handleWildcard(str: LogicString, char = '.+'): string {
  const asterisk = str.replace(/\*/g, '::asterisk::')
  return escapeRegExp(asterisk).replace(/::asterisk::/g, char)
}

export function extractPair(str: string, s1 = '(', s2 = ')') {
  let count = 0
  let startPos
  let endPos
  for (let pos = 0; pos <= str.length - 1; pos++) {
    const s = str.substr(pos, s1.length)
    if (s === s1) {
      count++
      if (typeof startPos === 'undefined') {
        startPos = pos
      }
      pos += s1.length - 1
    } else if (s === s2) {
      count--
      if (count < 1) {
        endPos = pos
        let func = ''
        let p
        for (
          p = startPos - 1;
          p >= 0 && /^\s+$/.test(str.substr(p, s2.length)) === false;
          p--
        ) {
          func = str.substr(p, 1) + func
        }
        const substr = str.substring(startPos + s1.length, endPos)
        return {
          token: func,
          left: s1,
          right: s2,
          substr,
          rest: str.substr(startPos + s1.length + substr.length + s2.length),
          leftOffset: startPos + s1.length,
          rightOffset: startPos + s1.length + substr.length,
        }
      }
    }
  }
  return null
}

export function trimPair(str: LogicString, s1 = '(', s2 = ')') {
  const info = extractPair(str, s1, s2)
  if (info && info.leftOffset === 1 && info.rightOffset === str.length - 1) {
    return info.substr
  }
  return str
}

export function escapeSpace(str: string) {
  return str.replace(/\s/g, '@@PROTECTED-SPACE@@')
}

export function unEscapeSpace(str: string) {
  return str.replace(/@@PROTECTED-SPACE@@/gi, ' ')
}
