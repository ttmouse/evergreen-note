import { IAddon, App, NewAddonParams } from '../../engine/App'
import { pub } from '../../utils/pub'
import { ClueWordCountComp } from './ClueWordsCountComp'
import { makeAutoObservable } from 'mobx'
import { ClueStatusBarComp } from './ClueStatusBarComp'
import { KyString, UnitPersist } from '../../interfaces/unit'
import { appendStyle } from '../../utils/dom/appendStyle'
import { cls, colorBase } from '../../styles'
import { $t } from '../../../i18n'

export type ClueStore = {
  type?: string
  words?: number
  subitems?: number
  backlinks?: number
}

export function createClueAddon({ app, $ }: NewAddonParams) {
  class Clue implements IAddon {
    app!: App
    config = {}

    store: ClueStore = {
      type: '',
      words: 0,
      subitems: 0,
    }

    constructor() {
      makeAutoObservable(this)
    }

    update(info: ClueStore) {
      this.store = info
    }

    getItemInfo(item: UnitPersist | KyString) {
      item = $.dbMemory.getItem(item)
      return {
        words: $.counter.countWordsOfTree(item).count,
        subitems: $.counter.countDescendants(item),
      }
    }

    addonInfo() {
      return {
        title: $t`clue.title`,
        quote: $t`clue.quote`,
        type: 'fieldset',
        defaultValue: 'off',
        updated: 20221024,
      }
    }

    addonRun() {
      $.editorView?.addExtraItems({ ClueWordCountComp })

      if (!app.isAddonEnabled('statusBar')) {
        return
      }

      $.statusBar?.pushComponent(ClueStatusBarComp, 'right')

      pub.on(pub.evt.editorMounted, ({ item, info }) => {
        setTimeout(() => {
          if (info.props.fromRouter) {
            this.update({
              type: 'total',
              ...this.getItemInfo(item),
            })
          }
        }, 500)
      })

      // 当编辑器被注销时，清空提示信息
      pub.on(pub.evt.editorUnmounted, ({ info }) => {
        if (info.props.fromRouter) {
          this.update({})
        }
      })

      pub.on(pub.evt.itemFocus, ({ item }) => {
        $.clue.update({
          type: 'item',
          ...$.clue.getItemInfo(item),
        })
      })

      document.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement
        if (target.matches('.element-bilink *')) {
          const el = target.closest('.element-bilink') as HTMLElement
          const topicTitle = el.getAttribute('data-topic')
          if (topicTitle) {
            const topicItem = $.topic.getTopic(topicTitle)
            if (topicItem) {
              $.clue.update({
                type: `topic(${topicTitle})`,
                backlinks: $.backlink.getLinkedItems(topicItem.ky).length,
                ...$.clue.getItemInfo(topicItem),
              })
            } else {
              $.clue.update({
                type: 'topic(not created)',
              })
            }
          }
        }
      })

      document.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement
        if (target.matches('.element-bilink *')) {
          $.clue.update({})
        }
      })

      appendStyle(cls`
        .element-bilink {
          color: ${[colorBase.info, 700]};

          &.bilink-created {
            color: ${[colorBase.primary, 600]};
          }
        }
      `)
    }
  }

  return { clue: new Clue() }
}
