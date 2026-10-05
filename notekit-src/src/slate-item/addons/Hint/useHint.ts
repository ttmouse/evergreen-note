import React from 'react'
import { NodeEntry, Range, Text } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { escapeRegExp } from '../../utils/regexp'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { useAddons } from '../../hooks/useAddons'
import { ContextKeywords } from '../Search/SearchContexts'

export function useHint(params: { decorateKey: string; editor: ItemEditor }) {
  const $ = useAddons()
  const { decorateKey, editor } = params
  const [keywords, setKeywords] = React.useState<string[]>([])
  const ctxKeywords = React.useContext(ContextKeywords)
  const allKeywords = [...keywords, ...ctxKeywords]
  const allTrieResult = $.hint.all[editor.editorId]

  const decorate = React.useCallback(
    ([node, path]: NodeEntry) => {
      const ranges: Range[] = []

      if (!isEmpty(keywords) && Text.isText(node)) {
        if ((node as any).tag === true || (node as any).code === true) {
          return []
        }

        const pattern = new RegExp(
          allKeywords
            .map((kw) => {
              if (/^[a-zA-Z0-9_-]+$/.test(kw)) {
                return `\\b${escapeRegExp(kw)}\\b`
              }
              return escapeRegExp(kw)
            })
            .join('|'),
          'gi'
        )
        const matches = node.text.matchAll(pattern)
        const arr = {} as any
        for (const match of matches) {
          const kw = match[0]
          if (match.index === undefined || kw.trim().length < 1 || arr[kw]) {
            continue
          }
          const [item, itemSlPath] = editor.itemEntry(path)
          if (item.$isTmp || $.traits.match(`link(${kw})`, item)) {
            continue
          }

          // 检查节点级别所忽略的关键字
          const ps = item.path ?? []
          const found = [...ps, item.ky].find((pky) => {
            // const pItem: ItemWithHint = $.dbMemory.getItem(pky);
            try {
              const pItem = editor.itemParent(itemSlPath)
              if (pItem && Array.isArray(pItem.hint?.ignore)) {
                return pItem.hint?.ignore.find((v: string) => v === kw)
              }
            } catch (e) {
              // console.warn(e);
            }
            return false
          })
          if (found) {
            continue
          }

          const dkey = ctxKeywords.includes(kw) ? 'search' : 'hint'

          const trieResult = allTrieResult[item.$id]
          if (
            trieResult &&
            kw in trieResult &&
            trieResult[kw].type === 'refer' &&
            trieResult[kw].payload === item.ky
          ) {
            continue
          }

          ranges.push({
            anchor: { path, offset: match.index },
            focus: { path, offset: match.index + kw.length },
            // [decorateKey]: true,
            [dkey]: kw,
          })
          arr[kw] = true
        }
      }

      return ranges
    },
    [$.traits, allKeywords, allTrieResult, ctxKeywords, editor, keywords]
  )
  return [decorate, setKeywords]
}
