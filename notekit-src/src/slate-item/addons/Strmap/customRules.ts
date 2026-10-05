import type { StrmapParams, StrmapRuleInfo } from './Strmap'

export const DEFAULT_STRMAP_CONTENT = String.raw`{
  '>=': '≥', '》=': '≥', '<=': '≤', '!=': '≠',
  '<<': '《{:caret}》', ',,': '《{:caret}》', '，，': '《{:caret}》',
  '···': '\u0060\u0060\u0060',
  ';yw': '∵', ';sy': '∴', ';yy': '✓', ';xx': '✘', '；': ';',
  ';/': '÷', ';union': '∪', ';join': '∩', ';sub': '⊂',
  ';=sub': '⊆', ';=contain': '⊇', ';contain': '⊃', ';empty': 'Φ',
  ';in;': '∈', ';in!': '∉', ';infinite': '∞',
  ';and': '∧', ';or': '∨', ';not': '┐', ';get': '⇒', ';same': '⇔',
  ';star': '✭', ';2star': '✭✭', ';3star': '✭✭✭', ';4star': '✭✭✭✭', ';5star': '✭✭✭✭✭',
  ';down': '↓', ';up': '↑', ';left': '←', ';right': '→', ';ydy': '≈', '；ydy': '≈',
  ';;1': '➀', ';;2': '➁', ';;3': '➂', ';;4': '➃', ';;5': '➄',
  ';;6': '➅', ';;7': '➆', ';;8': '➇', ';;9': '➈', ';;10': '➉',
  ';now': () => {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ';
  },
  '^+': '⁺', '_-': '⁻',
  '/\\^([0-9]+)s/': ({match}) => [...match[1]].map(n => '⁰¹²³⁴⁵⁶⁷⁸⁹'[n]).join(''),
  '/_([0-9]+)s/': ({match}) => [...match[1]].map(n => '₀₁₂₃₄₅₆₇₈₉'[n]).join(''),
  '/;(-?[0-9]+)d$/': ({match}) => {
    const d = new Date(); d.setDate(d.getDate() + Number(match[1]));
    return '[[' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0') + ']]';
  }
}`

export function compileCustomRules(content: string): Record<string, StrmapRuleInfo> {
  if (!content.trim()) return {}
  // Deliberately matches the old user-script format, including function values.
  const maps = new Function('"use strict"; return (' + content + '\n);')()
  if (!maps || typeof maps !== 'object' || Array.isArray(maps)) {
    throw new Error('规则必须是对象，例如 {";yy": "✓"}')
  }
  const rules: Record<string, StrmapRuleInfo> = {}
  for (const [from, to] of Object.entries(maps)) {
    if (!from || (typeof to !== 'string' && typeof to !== 'function')) {
      throw new Error(`规则 ${JSON.stringify(from)} 的目标必须是字符串或函数`)
    }
    const regex = from.match(/^\/(.*)\/([imsu]*)$/s)
    if (from.startsWith('/') && !regex) throw new Error(`正则格式错误：${from}`)
    const pattern = regex ? regex[1] : from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const strmapRule = new RegExp('(?:' + pattern + ')$', regex ? regex[2] || 'i' : 'i')
    if (strmapRule.test('')) throw new Error(`规则不能匹配空字符串：${from}`)
    rules[from] = {
      strmapRule,
      handle(params: StrmapParams) {
        const result = typeof to === 'function'
          ? to({ ...params, fromStr: from, caret: params.editor.selection?.anchor.offset })
          : to
        if (typeof result !== 'string') throw new Error(`规则 ${from} 必须返回字符串`)
        return result.replaceAll('{:caret}', '{%caret}').replaceAll('{:enter}', '{%enter}')
      },
    }
  }
  return rules
}
