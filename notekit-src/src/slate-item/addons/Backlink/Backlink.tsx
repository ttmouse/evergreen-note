import { $t } from '../../../i18n'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { mkid } from '../../utils/string/mkid'
import { layoutStyleBacklink } from './backlink.style'
import { LinkedReferenceComp } from './LinkedReferenceComp'
import { UnlinkedReferenceComp } from './UnlinkedReferenceComp'
import './backlink.less'
import { browser } from '@/slate-item/utils/browser'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'

/**
 * Backlink
 *
 * Display linked references and unlinked references for a topic item
 */
export function createBacklinkAddon({ app, $ }: NewAddonParams) {
  class Backlink implements IAddon {
    app!: App
    config = {}

    getLinkedItemsByTopic(topic: string): UnitPersist[] {
      const foldSubitems = ['ai responses']
      return $.dbMemory
        .getItemsByIndex('mentions', $.topic.refine(topic))
        .map((item) => {
          const res = {
            ...item,
            subitems: foldSubitems.includes(topic) ? [] : $.dbMemory.getSubitems(item.ky, { isRecur: true }),
          }
          if (foldSubitems.includes(topic)) res.foldup = true
          return res
        })
    }

    getUnlinkedItemsByTopic(...keywords: string[]): UnitPersist[] {
      const condition = keywords.map((kw) => `unlink(${kw})`).join(' OR ')
      return $.search.findAll(condition, {
        isRecur: true,
        foldupEach: true,
      })
    }

    /**
     * Get a topic item's linked references
     * @param ky
     * @returns
     */
    getLinkedItems(ky: KyString): UnitPersist[] {
      const topicItem = $.dbMemory.getItem(ky)
      return !topicItem?.topic
        ? []
        : $.backlink
            .getLinkedItemsByTopic(topicItem.topic)
            .filter((item) => !item.path?.includes(ky))
    }

    /**
     * Get a topic item's unlinked references
     * @param ky
     * @returns
     */
    getUnlinkedItems(ky: KyString): UnitPersist[] {
      const topicItem = $.dbMemory.getItem(ky)
      return isEmpty(topicItem.topic)
        ? []
        : $.backlink
            .getUnlinkedItemsByTopic(topicItem.topic!)
            .filter((item) => !item.path?.includes(ky))
    }

    /**
     * 避免节点重复显示
     *
     * 在反向链接中，有时节点A和它的父级节点会同时出现，
     * 而父级节点在显示的时候又包含了节点A，这时就会出现重复显示的情况，
     * 这个函数就是用来避免这种情况的，让节点A不再单独显示
     * @param theItems
     * @returns
     */
    preventDuplicate(theItems: UnitPersist[]) {
      const list: UnitPersist[] = []
      const items: { [ky: KyString]: UnitPersist } = {}
      for (const one of theItems) {
        items[one.ky] = one
      }
      for (const item of Object.values(items)) {
        let flag = true
        if (Array.isArray(item.path)) {
          for (const k of item.path) {
            if (k in items) {
              if (!items[k].foldup && isEmpty(items[k].subitems)) {
                items[k].subitems = $.dbMemory.getSubitems(k, { isRecur: true })
              }
              flag = false
              break
            }
          }
        }

        if (flag) {
          list.push(item)
        }
      }
      return list
    }

    makeElement(props: {
      subitems: UnitPersist[]
      title?: string
      foldup?: boolean
      foldupTopics?: boolean
      foldupSome?: string[]
      ky: KyString,
      groupBy?: string,
      layout?: string
    }): UnitPersist {
      const { subitems, title, foldup, ky, foldupTopics, foldupSome, layout } = props
      const layoutUsed = layout || 'result'
      const groupBy = props.groupBy || 'topic'
      const theItem = {
        ky,
        ori: title,
        subitems: $.grouphelper.getGroupFunc(groupBy)(subitems, {
          foldupAll: foldupTopics,
          foldupSome,
          parentLayout: layoutUsed,
        }),
        $isTmp: true,
        layout: layoutUsed,
        icon: 'svg_arrow_down',
        $readonly: true,
        foldup,
        clickHeadToFold: true,
      } as any;
      if (groupBy === 'none') {
        theItem.$crumbsContext = 'result';
      }
      return {
        ky: mkid(),
        ori: '',
        layout: 'result-container',
        subitems: [
          theItem,
        ],
        $isTmp: true,
      } as any
    }

    addComponentToEditorView() {
      $.editorView?.addMoreComponent(LinkedReferenceComp)
      $.editorView?.addMoreComponent(UnlinkedReferenceComp)
    }

    addonInfo() {
      return {
        title: $t`backlink.title`,
        quote: $t`backlink.quote`,
        defaultValue: 'on',
        type: 'fieldset',
      }
    }

    addonRun() {
      $.layoutFactory?.registerStyles({
        result: layoutStyleBacklink,
      })

      $.backlink.addComponentToEditorView()
    }
  }
  return { backlink: new Backlink() }
}
