import { AutoCompleteParams } from '../../components/AutoComplete/AutoComplete'
import { App, NewAddonParams, CommandMaps } from '../../engine/App'
import { cover } from '../../engine/helper'
import {
  Node,
  Range,
  Element,
  Editor,
  Transforms,
  ReactEditor,
} from '../../slate.inc'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { pub } from '../../utils/pub'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { InlineElement } from '../Inlines/Inlines'
import {
  filterItems,
  SlashHanlderParams,
  SlashMenuItems,
} from '../SlashMenu/SlashMenu'
import { ZERO_WIDTH_SPACE, StrmapParams } from '../Strmap/Strmap'
import { KyString } from '../../interfaces/unit'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { KeywordProps } from '../Keywords/Keywords'
import { BilinkMenuComp } from './BilinkMenuComp'
import { icons } from '../../../components/SvgIcon'
import './Bilink.less'
import { BilinkElementComp } from './BilinkElementComp'
import { nodeString } from '../../utils/string/nodeString'
import { $t } from '../../../i18n'
import { trim } from '../../utils/string/trim'
import { FORM_EL } from '../Form/Form'
import { Item } from '../../interfaces/item'

export const BLOCK_TYPE_BILINK = 'bilink'

export type BilinkProps = {
  topic?: string
}

declare global {
  interface AppConf {
    bilinkBracketVisible: boolean
  }
}

export type BilinkElement = InlineElement & BilinkProps

export function createBilinkAddon({ $ }: NewAddonParams) {
  class Bilink implements IAddonElement<BilinkElement> {
    app!: App
    config = {}
    suggestTriggerPattern = /.*\[\[(.*)$/

    valueKey = 'topic' // BilinkProps['topic']

    fieldset() {
      return {
        text: {
          type: FORM_EL.text,
          title: $t`bilink.link_text`,
          required: true,
        },
        topic: {
          type: FORM_EL.text,
          title: $t`bilink.link_target`,
          quote: $t`bilink.link_target_quote`,
        },
      }
    }

    isVoid(_val: InlineElement) {
      // Link text is editable, including legacy nodes carrying isVoid: true.
      return false
    }

    exportString(
      el: BilinkElement,
      options: { item: UnitPersist; rich?: boolean }
    ): string {
      return `[[${nodeString(el)}]]${isEmpty(el.topic) ? '' : `(${el.topic})`}`
    }

    getSuggestMenu({ editor }: { editor: ItemEditor }): AutoCompleteParams {
      const { suggestTriggerPattern } = this

      const menu = {
        title: 'Bidirectional Link Menu',
        autoRule: () =>
          suggestTriggerPattern.exec(editor.itemTextBeforeCaret()),
        filter: ({ items }: any) => {
          const kw = suggestTriggerPattern
            .exec(editor.itemTextBeforeCaret())?.[1]
            .toLocaleLowerCase()
          return filterItems(items, kw ?? '', false)
        },
        map: (item: KeywordProps) => ({
          id: item.title,
          title: item.title,
          icon: 'svg_document',
          handle: ({ editor: itemEditor }: SlashHanlderParams) => {
            const text = itemEditor.itemTextBeforeCaret()
            const match = this.suggestTriggerPattern.exec(text)
            if (match) {
              Transforms.delete(itemEditor, {
                unit: 'character',
                reverse: true,
                distance: 2 + match[1].length,
              })
              itemEditor.insertFragment([
                this.createElement({ topic: item.title }),
                { text: ZERO_WIDTH_SPACE },
              ])
            }
          },
        }),

        body: () => {
          const kw = suggestTriggerPattern
            .exec(editor.itemTextBeforeCaret())?.[1]
            .toLocaleLowerCase()
          return this.app.addons.keywords.getList(kw ?? '')
        },
      }

      return menu as any
    }

    fromMarkdown(markdown: string) {
      const match = /\[\[([^\]]*)\]\]/.exec(markdown)
      if (match) {
        return this.createElement({ topic: match[1] })
      }
    }

    /**
     * 检查某个值是不是属于双向链接行内元素
     * @param node
     * @returns
     */
    verify(node: any): node is BilinkElement {
      return (
        Element.isElement(node) &&
        (node as BilinkElement).blockType === BLOCK_TYPE_BILINK
      )
    }

    string(bilinkElement: BilinkElement) {
      return trim(
        !isEmpty(bilinkElement.topic)
          ? bilinkElement.topic!
          : nodeString(bilinkElement)
      )
    }

    /**
     * 从笔记中提取出链接过的主题关键词
     * @param item
     * @returns
     */
    getBilinksFromItem(item: UnitPersist): string[] {
      return item.leaves?.filter($.bilink.verify).map($.bilink.string) ?? []
    }

    /**
     * 注册快捷键
     * @returns
     */
    addonCommands(): CommandMaps {
      return {
        bilink: {
          title: $t`bilink.title`,
          icon: icons.svg_bilink,
          hotkey: ['[', ']', '【', '】'],
          handle({ editor }) {
            return $.bilink.linkSelection(editor)
          },
        },
      }
    }

    linkSelection(editor: ItemEditor, linkTargetTopic?: string) {
      const { bilink } = this.app.addons
      const selection = editor.selection as Range
      if (
        selection &&
        !Range.isCollapsed(selection) &&
        !editor.itemSelection().isMulti
      ) {
        ReactEditor.focus(editor as any)
        const selectedText = Editor.string(editor, selection)
        const topic = linkTargetTopic ?? selectedText
        const el = bilink.createElement({ topic })
        Transforms.insertNodes(editor, el, { at: selection })
        return false
      }
      return true
    }

    /**
     * 创建一个 bilink Slate 元素
     * @param topic
     * @returns
     */
    createElement(props: BilinkProps & { alias?: string }): BilinkElement {
      const { topic, alias } = props
      if (isEmpty(alias)) {
        return $.inlines.createElement('bilink', topic, {})
      }
      return {
        ...$.inlines.createElement('bilink', alias, { topic }),
      } as BilinkElement
    }

    createComponent() {
      return BilinkElementComp
    }

    strmap() {
      return {
        strmapRule: /\[\[(.+?)\]\]/,
        title: '双向链接',
        handle({ match }: StrmapParams) {
          return $.bilink.createElement({ topic: match[1] })
        },
      }
    }

    slashMenu(): SlashMenuItems {
      return {}
    }

    /**
     * 将双向链接提取出来以便建立索引
     * @param item
     * @returns
     */
    extractMentions(item: UnitPersist) {
      const bilinks = this.getBilinksFromItem(item)
      if (notEmpty(bilinks)) {
        item.mentions = bilinks
      } else if (notEmpty(item.mentions)) {
        delete item.mentions
      }
      return item
    }

    replace(item: UnitPersist, oldTopic: string, newTopic: string) {
      const refinedOldTopic = $.topic.refine(oldTopic)
      const nodeList: Node[] = []
      for (const node of item.leaves) {
        let newNode = node
        if ($.bilink.verify(node)) {
          const theTopic = $.topic.refine($.bilink.string(node))
          if (theTopic === refinedOldTopic) {
            newNode = $.bilink.createElement({ topic: newTopic })
          }
        }
        nodeList.push(newNode)
      }
      return {
        ...item,
        leaves: nodeList,
        ori: Node.string({ children: nodeList }),
      }
    }

    /**
     * 当一个主题的标题修改了后，它原本所有的 page reference 也要修改过来
     * @param oldTopic
     * @param newTopic
     * @returns
     */
    replaceAll(oldTopic: string, newTopic: string) {
      const refinedTopic = $.topic.refine(oldTopic)
      const items = $.dbMemory.indexed.mentions[refinedTopic]
      if (isEmpty(items)) {
        return
      }
      for (const item of Object.values(items)) {
        const newItem = $.bilink.replace(item, oldTopic, newTopic)
        $.dbMemory.saveItem(newItem)
      }
    }

    inlinesBarAddItems() {
      const cond = () => $.inlinesBar.getContext().is('bilink')
      $.inlinesBar?.addItems({
        extArea: {
          title: $t`extArea.title`,
          icon: 'svg_extarea',
          cond,
          onClick: () => {
            const topic = $.bilink.string(
              $.inlinesBar.getContext<BilinkElement>().element
            )
            const topicItem = $.topic.createTopic(topic)
            if (topicItem) {
              $.extArea?.add({
                type: 'topic',
                key: topicItem.ky,
              })
            }
          },
        },
        bilinkToRefer: {
          title: `${$t`inlinesBar.turn_into`} ${$t`refer.title`}`,
          icon: 'svg_refer',
          cond,
          onClick: () => {
            const ctx = $.inlinesBar.getContext<BilinkElement>()
            const topicItem = $.topic.createTopic($.bilink.string(ctx.element))
            if (topicItem) {
              const referEl = $.refer.createElement({
                ky: topicItem.ky,
                note: ctx.element.topic
                  ? nodeString(ctx.element)
                  : ctx.element.topic,
              })
              const pathRef = Editor.pathRef(ctx.editor, $.inlinesBar.getPath())
              Transforms.insertNodes(ctx.editor, referEl, {
                at: pathRef.current!,
              })
              Transforms.removeNodes(ctx.editor, {
                at: pathRef.unref()!,
              })
            }
          },
        },
      })
    }

    handleClick(
      e: MouseEvent,
      params: { topicTitle: string; element: BilinkElement; editor: ItemEditor }
    ) {
      // 如果存在选区，则不处理
      const sel = window.getSelection()
      if (!sel?.isCollapsed) {
        return
      }
      const { topicTitle } = params
      // The clicked DOM node identifies the actual column, even when the same
      // editor is rendered in a backlink, mirror, or another open viewer.
      $.topic.route(topicTitle, {}, e.target instanceof HTMLElement ? e.target : params.editor)
    }

    /**
     * 从一个列表中找到引用了某个块的 item
     * @param refky
     * @param items
     * @returns
     */
    find(topic: string, items: UnitPersist[]) {
      const lower = topic.toLowerCase()
      return items.find((item) => item.mentions?.includes(lower)) ?? false
    }

    /**
     * 从某一个节点的子节点中找到引用了某个块的 item
     * @param refky
     * @param underKy
     * @returns
     */
    findUnder(topic: string, underKy: KyString) {
      return $.bilink.find(topic, $.dbMemory.getItemsByIndex('path', underKy))
    }

    addonInfo() {
      return {
        title: $t`bilink.title`,
        quote: $t`bilink.quote`,
        defaultValue: 'on',
      }
    }

    addonBeforeRun() {
      $.prefer.addCfgItems('ui', {
        bilinkBracketVisible: {
          title: $t`bilink.bracket_visible`,
          defaultValue: false as any,
          type: 'switch',
        },
      })

      const { addItem } = $.dbMemory
      cover(addItem, (item) => {
        if (
          'mentions' in item === false &&
          (Array.isArray(item.ikys) ||
            (Array.isArray(item.leaves) && item.leaves.length > 1))
        ) {
          item.mentions = $.bilink.getBilinksFromItem(item)
        }
        return addItem.call($.dbMemory, item)
      })

      $.floatBar?.addItems({
        bilink: {
          order: 1000,
          icon: icons.svg_bilink,
          title: $t`bilink.title`,
          onClick: () => {
            const { editor } = $.floatBar.getContext()
            $.bilink.linkSelection(editor)
          },
        },
      })
    }

    addonRun() {
      const { saveItem } = $.dbMemory
      cover(saveItem, (item: UnitPersist, ...args: any) => {
        if (!isEmpty(item.topic)) {
          const oldItem = $.dbMemory.getItem(item.ky)
          if (oldItem?.topic && oldItem.topic !== item.topic) {
            $.bilink.replaceAll(oldItem.topic, Item.headString(item))
          }
        }
        const niceItem = $.bilink.extractMentions(item)
        return saveItem.call($.dbMemory, niceItem, ...args)
      })

      // 支持 [别名](主题) 的方式创建双向链接
      const { createElement } = $.hyperlink
      cover(createElement, (props) => {
        const { url: theTopic, title: alias } = props
        if (
          !theTopic.includes('/') &&
          !theTopic.startsWith('http') &&
          !theTopic.startsWith('mailto') &&
          notEmpty(theTopic) &&
          ($.topic.getTopic(theTopic) || theTopic in $.dbMemory.nodes === false) // theTopic 不是一个 ID
        ) {
          return $.bilink.createElement({ topic: theTopic, alias }) as any
        }
        return createElement.call($.hyperlink, props)
      })

      $.editorView?.addMoreComponent(BilinkMenuComp)

      // 当光标处于双向链接元素上时, 按下 Enter 键则进入对应的主题页面
      pub.on(pub.evt.editorEnterInline, ({ inlineElement, editor }) => {
        if ($.bilink.verify(inlineElement)) {
          $.topic.route($.bilink.string(inlineElement), {}, editor)
        }
      })

      $.bilink.inlinesBarAddItems()
    }
  }

  return new Bilink()
}
