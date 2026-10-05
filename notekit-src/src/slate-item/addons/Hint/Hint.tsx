/* eslint-disable no-restricted-syntax */
/* eslint-disable no-labels */
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { before } from '../../engine/helper'
import { Item, ItemNode } from '../../interfaces/item'
import { AllFoundResult, Trie } from './Trie'
import { pub } from '../../utils/pub/pub'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { atLater } from '../../utils/atLater'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import './hint.less'
import {
  FloatMenuComp,
  FloatMenuItems,
  FloatMenuProps,
  setMenuVisible,
} from '../FloatMenu/FloatMenuComp'
import { ItemDOM } from '../../components/ItemView'
import { obj2list } from '../EditorView/helper'
import React from 'react'
import { NodeEntry, ReactEditor, Transforms } from '../../slate.inc'
import { getPubState } from '../../hooks/usePubState'
import { showSnack } from '../../utils/msg/showSnack'
import { $t } from '../../../i18n'
import { trim } from '../../utils/string/trim'
import { until } from '../../utils/until'

export type ItemWithHint = UnitPersist & { hint?: { ignore: string[] } }

export type HintMenuContext = {
  item: ItemNode
  editor: ItemEditor
  app: App
  leafEntry: NodeEntry
  text: string
  hintDom: HTMLElement
}

declare global {
  interface AppConf {
    hintIgnore?: string[]
  }
}

const MENU_NAME = 'hint'
function includes(arr: string[] | null | undefined, str: string) {
  if (!Array.isArray(arr)) {
    return false
  }
  const lower = str.toLowerCase()
  return arr.some((s) => s.toLowerCase() === lower)
}

export function createHintAddon({ app, $ }: NewAddonParams) {
  const trie = new Trie()

  class Hint implements IAddon {
    app!: App
    config = {
      hintIgnore: [] as string[],
    }

    trie = trie

    menu: FloatMenuItems = {}

    async handleAddLink(type: 'refer' | 'bilink') {
      const { editor, hintDom } = $.hint.getContext()
      const domRange = document.createRange()
      domRange.selectNodeContents(hintDom)

      const slRange = ReactEditor.toSlateRange(editor as any, domRange, {
        exactMatch: false,
        suppressThrow: false,
      })
      ReactEditor.focus(editor as any)
      Transforms.select(editor, slRange)
      $.hint.linkSelection(editor, type)
    }

    linkSelection(editor: ItemEditor, type: 'refer' | 'bilink') {
      if (type === 'bilink') {
        $.bilink.linkSelection(editor)
      } else if (type === 'refer') {
        $.refer.linkSelection(editor)
      }
    }

    handleViewNotes() {
      const { text, hintDom } = $.hint.getContext()
      const topicItem = $.topic.getTopic(text)
      if (notEmpty<UnitPersist>(topicItem)) {
        $.floatViewer.show({
          item: $.dbMemory.getItem(topicItem!.ky, { isRecur: true }),
          DialogProps: {
            SnapProps: {
              targetBox: hintDom,
              place: ['right-out', 'middle'],
            },
          },
        })
      } else {
        $.search.showDialog({
          keyword: text,
        })
      }
    }

    ignoreInItem(keyword: string, item: ItemWithHint, editor: ItemEditor) {
      const ignore = item.hint?.ignore.slice(0) || []
      const lower = keyword.toLowerCase()
      if (!ignore.includes(lower)) {
        ignore.push(lower)
        const hint = { ...(item.hint ?? {}), ignore }
        $.dbMemory.saveItem({ ...item, hint })
        $.hint.addHighlight({
          item: item as any,
          editor,
        })
      }
    }

    ignoreGlobally(keyword: string) {
      const ignore = app.cfg.hintIgnore ?? []
      const lower = keyword.toLowerCase()
      if (!ignore.includes(lower)) {
        const nextIgnore = [...ignore, lower]
        $.prefer.setValue('hintIgnore', nextIgnore)
        if (app.cfg.hintIgnore?.includes(lower)) {
          showSnack($t(`hint.ignore_success`, { keyword }))
        }
      }
    }

    detect(item: ItemNode): AllFoundResult {
      const content = Item.headString(item)
      if (content.length < 3 || item.topic) {
        return {}
      }
      const all = trie.findAllInSentence(content)
      const detectedKeywords: AllFoundResult = {}

      loop1: for (const [kw, result] of Object.entries(all)) {
        const lower = kw.trim().toLowerCase()
        if (lower.length < 2 || $.traits.match(`link(${lower})`, item)) {
          continue
        }
        const kyPath = [...(item?.path ?? []), item.ky]
        for (const pky of kyPath) {
          const pItem = $.dbMemory.getItem(pky) as ItemWithHint
          if (
            typeof pItem === 'object' &&
            ((Array.isArray(pItem?.hint?.ignore) &&
              includes(pItem.hint?.ignore, lower)) ||
              includes(app.cfg.hintIgnore, lower) ||
              pItem.topic === lower)
          ) {
            continue loop1
          }
        }
        detectedKeywords[kw] = result
      }
      return detectedKeywords
    }

    createMenuComponent() {
      return function ItemFloatMenu() {
        const name = MENU_NAME
        const props: FloatMenuProps<HintMenuContext> = {
          name,
          targetSelector:
            '.mark-hint:not(.element-bilink *,.node-topic > .node-head *)',
          context(el) {
            const { $editor, $item } = el.closest('.node') as ItemDOM
            const slNode = ReactEditor.toSlateNode($editor as any, el)
            const slPath = ReactEditor.findPath($editor as any, slNode)

            return {
              editor: $editor,
              item: $item,
              text: el.textContent!.trim(),
              leafEntry: [slNode, slPath],
              hintDom: el,
              app,
            }
          },
          items: obj2list($.hint.menu, (item) => {
            const { onClick } = item
            if (onClick) {
              item.onClick = (e: React.MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                onClick(e)
                setMenuVisible(name, false)
              }
            }
            return item
          }),
        }
        return <FloatMenuComp {...props} place={['left-in', 'bottom-out']} />
      }
    }

    getContext() {
      return {
        ...getPubState(`float-menu-context-${MENU_NAME}`),
        app,
      } as HintMenuContext
    }

    all: { [editorId: string]: { [itemId: string]: AllFoundResult } } = {}
    addHighlight({ editor, item }: { editor: ItemEditor; item: ItemNode }) {
      const kws = $.hint.detect(item)
      $.hint.all[editor.editorId] ??= {}
      if (!isEmpty(kws)) {
        $.hint.all[editor.editorId][item.$id] = kws
      }

      atLater(
        () => {
          if (!isEmpty($.hint.all[editor.editorId])) {
            const keywords: string[] = []
            for (const [, allFoundResult] of Object.entries($.hint.all[editor.editorId])) {
              for (const [kw, result] of Object.entries(allFoundResult)) {
                if (!keywords.includes(kw)) {
                  keywords.push(kw)
                }
              }
            }
            const kwSet = new Set(keywords)
            editor.highlight([...kwSet])
          }
        },
        `hint-${editor.editorId}`,
        500
      )
    }

    addonInfo() {
      return {
        title: $t`hint.title`,
        quote: $t`hint.quote`,
        type: 'fieldset',
        defaultValue: 'on',
        updated: 20221022,
        subitems: {
          hintIgnore: {
            title: $t`hint.ignore_globally`,
            type: 'tags',
            quote: $t`hint.ignore_globally_quote`,
          },
        },
      }
    }

    addonBeforeRun() {
      before($.keywords.add, (kw) => {
        trie.insert(kw)
      })

      before($.keywords.indexRemoveLinked, (kw) => {
        trie.remove(kw)
      })

      const caches = new Map<string, string[]>()
      pub.on(pub.evt.dbIndexChanged, async ({ indexName, indexValue }) => {
        if (indexName === 'referText') {
          if (!caches.has(indexValue)) {
            const targetItem = $.dbMemory.getItem(indexValue)
            trie.insert({
              text: Item.headString(targetItem),
              type: 'refer',
              payload: indexValue,
            })
          }
        }
      })
    }

    addonRun() {
      $.hint.menu = {
        bilink: {
          title: $t`hint.make_link`,
          icon: 'svg_bilink',
          size: 10,
          cond() {
            const { text } = $.hint.getContext()
            const lower = text.toLowerCase()
            return lower in $.keywords?.all ?? {}
          },
          onClick: () => {
            $.hint.handleAddLink('bilink')
          },
        },

        refer: {
          title: $t`refer.title`,
          icon: 'svg_refer',
          size: 10,
          cond() {
            const { text } = $.hint.getContext()
            const lower = text.toLowerCase()
            return (lower in $.keywords?.all ?? {}) === false
          },
          onClick: () => {
            $.hint.handleAddLink('refer')
          },
        },

        open: {
          title: $t`hint.view_notes`,
          icon: 'svg_zoomin',
          onClick: () => {
            $.hint.handleViewNotes()
          },
        },

        ignore: {
          title: $t`hint.ignore`,
          icon: 'svg_ignore',
          subitems: {
            currentItem: {
              title: $t`hint.in_current_item`,
              icon: 'svg_ignore',
              onClick() {
                const { text, item, editor } = $.hint.getContext()
                $.hint.ignoreInItem(text, item, editor)
              },
            },
            currentTopic: {
              title: $t`hint.in_current_topic`,
              icon: 'svg_ignore',
              onClick: () => {
                const { text, item, editor } = $.hint.getContext()
                const crumbs = $.crumbs.getCrumbs(item)
                const found = crumbs?.find((crumb) => crumb.isTopic)
                if (found) {
                  const topicItem = $.dbMemory.getItem(found.ky)
                  $.hint.ignoreInItem(text, topicItem, editor)
                }
              },
            },
            currentDbAdmin: {
              title: $t`hint.globally`,
              icon: 'svg_ignore',
              onClick: () => {
                $.hint.ignoreGlobally($.hint.getContext().text)
              },
            },
          },
        },
      }

      pub.on(pub.evt.editorItemMounted, $.hint.addHighlight)
      // pub.on(pub.evt.itemBlur, $.hint.addHighlight);
      pub.on(pub.evt.editorUnmounted, ({ editor }) => {
        delete $.hint.all[editor.editorId]
      })

      // pub.on(pub.evt.editorNormalized, (editor, entry) => {
      //   const [item] = entry
      //   atLater(
      //     () => {
      //       $.hint.addHighlight({ editor, item })
      //     },
      //     `hint-item-${item.$id}`,
      //     500
      //   )
      // })

      $.ui.pushComponent(this.createMenuComponent())

      document.addEventListener('dblclick', (e) => {
        const el = e.target as HTMLElement
        if (el.matches('.mark-hint, .mark-hint *')) {
          const text = trim(el.textContent!)
          $.topic.route(text, {}, e.target)
        }
      })
    }
  }

  return { hint: new Hint() }
}
