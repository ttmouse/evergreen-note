import { Node } from '../../slate.inc'

type ToFunc = (
  m: string,
  result: (string | Node)[],
  i: number,
  item: UnitPersist
) => Node | string

export function md2leaves(
  item: UnitPersist,
  str: string | (string | Node)[],
  regexp: RegExp,
  to: ToFunc
) {
  const parts = Array.isArray(str) ? str : [str]
  const result: (Node | string)[] = []
  for (const [i, p] of parts.entries()) {
    if (Node.isNode(p)) {
      result.push(p)
      continue
    }
    const splited = p.split(regexp)
    for (const s of splited) {
      if (regexp.test(s)) {
        result.push(to(s, result, i, item))
      } else {
        result.push(s)
      }
    }
  }
  return result
}

export type ConvertTextRule = {
  regexp: RegExp
  to: ToFunc
}

export function convertText(
  item: UnitPersist,
  mdStr: string | (string | Node)[],
  rules: ConvertTextRule[]
) {
  for (const rule of rules) {
    mdStr = md2leaves(item, mdStr, rule.regexp, rule.to)
  }
  return (mdStr as (string | Node)[]).map((m) =>
    typeof m === 'string' ? { text: m } : m
  )
}
