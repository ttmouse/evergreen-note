import { AutoCompleteParams } from '../../components/AutoComplete/AutoComplete'
import { App, NewAddonParams } from '../../engine/App'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { Editor, Element, Range, Transforms } from '../../slate.inc'
import { SlashHanlderParams, SlashMenuItems } from '../SlashMenu/SlashMenu'
import { KyString } from '../../interfaces/unit'
import { ReferMenuComp } from './ReferMenuComp'
import { after, cover } from '../../engine/helper'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import { ReferComp } from './ReferComponent'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { Item, ItemNode } from '../../interfaces/item'
import { ReferIcon } from './ReferIcon'
import { deepClone } from '../../utils/object/deepClone'
import {
  ZERO_WIDTH_SPACE,
  StrmapParams,
  StrmapRuleInfo,
} from '../Strmap/Strmap'
import { isValidKy, mkid } from '../../utils/string/mkid'
import { icons } from '../../../components/SvgIcon'
import { $$ } from '../../utils/lang'
import { $t } from '../../../i18n'
import { FORM_EL } from '../Form/Form'
import React from 'react'
import { WordHighlight } from '../../components/WordHighlight/WordHighlight'
import { cls, px } from '../../styles'
import { getRangeText } from '../EditorFactory/helper'

const suggestTriggerPattern = /.*\(\((.*)$/

const referCountTitleStyle = cls`
  display: inline-flex;
  align-items: center;
  gap: ${px(8)};
  width: 100%;
  min-width: 0;

  .refer-subitem-count {
    flex-shrink: 0;
    margin-left: auto;
    border-radius: ${px(100)};
    display: inline-flex;
    min-width: ${px(20)};
    height: ${px(20)};
    padding: 0 ${px(6)};
    justify-content: center;
    align-items: center;
    font-size: ${px(12)};
    color: var(--cl-slate-600);
    background-color: var(--cl-slate-100);
    user-select: none;
  }
`

export type ReferElement = InlineElement & {
  blockType: 'refer'
  refky?: KyString
  value: KyString // Same as refky
  note?: string // Alias text (legacy data only; display always mirrors the source)
  pick?: 'leaves' | 'background' | 'layout'
  children: Node[]
}

/** Include the remaining query and closing brackets when choosing a new target. */
export function getReferQueryRange(editor: ItemEditor): Range | null {
  const selection = editor.selection
  if (!selection || !Range.isCollapsed(selection)) return null
  const match = suggestTriggerPattern.exec(editor.itemTextBeforeCaret())
  if (!match) return null
  const anchor = Editor.before(editor, selection.anchor, {
    unit: 'character',
    distance: 2 + match[1].length,
  })
  if (!anchor) return null
  const remaining = Editor.string(editor, {
    anchor: selection.anchor,
    focus: Editor.end(editor, editor.itemPathText(selection.anchor.path)),
  })
  const closing = remaining.indexOf('))')
  const nextOpening = remaining.indexOf('((')
  const focus = closing >= 0 && (nextOpening < 0 || closing < nextOpening)
    ? Editor.after(editor, selection.anchor, { unit: 'character', distance: closing + 2 })
    : selection.anchor
  return focus ? { anchor, focus } : null
}

/**
 * Block Reference
 *
 * The syntax of block reference is ((block-id))
 */

export function createReferAddon({ app, $ }: NewAddonParams) {
  class Refer implements IAddonElement<ReferElement> {
    app!: App
    config = {}
    counts: { [ky: KyString]: number } = {}

    blockType = 'refer'

    fieldset() {
      return {
        value: {
          title: $t`refer.refky`,
          type: FORM_EL.text,
        },
        note: {
          title: $t`refer.alias_text`,
          type: FORM_EL.text,
        },
      }
    }

    getLinearLeaves(refky: KyString): Node[] {
      const item = $.dbMemory.getItem(refky)
      const result: Node[] = []
      if (item) {
        const { leaves } = item
        for (const leaf of leaves) {
          if ($.refer.verify(leaf)) {
            result.push(...$.refer.getLinearLeaves(leaf.value))
          } else {
            result.push({ ...leaf, refFrom: refky } as any)
          }
        }
      }
      return result
    }

    exportString(el: ReferElement, { item, rich }: { item: UnitPersist, rich?: boolean }) {
      const linkedItem = $.dbMemory.getItem(el.value)

      // to avoid circular reference
      if (el.value === item.ky) {
        return ''
      }
      if (el.note) {
        return `${el.note}`
      }
      if (!isEmpty(linkedItem)) {
        const str = $.exports.getString('plain', {
          data: linkedItem,
          item: linkedItem as any,
          rich: rich || false,
        })
        return `${str.trim()}`
        // return str.trim()
      }
      return ''
    }

    isVoid(_val: InlineElement) {
      return false
    }

    setCount(ky: KyString, count: number) {
      this.counts[ky] = count
    }

    getCount(ky: KyString) {
      // return this.counts[ky] ?? 0;
      return $.indexedCount?.getCount('referText', ky) ?? 0
    }

    /**
     * Count how many items have referred to an item
     * @param ky
     */
    getBacklinkCount(ky: KyString): number {
      return this.getBacklinkItems(ky).length
    }

    /**
     * Get the items who have referred to an item
     * @param ky
     */
    getBacklinkItems(ky: KyString): UnitPersist[] {
      if (isEmpty(ky)) {
        console.error(`ky is empty`)
        return []
      }
      const { dbMemory } = this.app.addons
      const items = this.app.addons.dbMemory
        .getItemsByIndex('referText', ky)
        .filter((item) => !item.path?.includes(ky))
        .map((item) => {
          return {
            ...item,
            subitems: dbMemory.getSubitems(item.ky, { isRecur: true }),
          }
        })
      const theItem = $.dbMemory.getItem(ky)
      const topicItem = $.topic.getTopic(Item.headString(theItem))
      if (!isEmpty(topicItem) && theItem.ky !== topicItem!.ky) {
        items.push(topicItem as any)
      }
      return items
    }

    getBacklinkGroupItems(ky: KyString): UnitPersist[] {
      return Item.groupItemsByTopic(this.getBacklinkItems(ky))
    }

    getSuggestMenu({ editor }: { editor: ItemEditor }): AutoCompleteParams {
      let theKeyword = ''
      const menu = {
        title: $$`Reference menu`,
        autoRule: () =>
          suggestTriggerPattern.exec(editor.itemTextBeforeCaret()),
        filter: ({ items }: any) => {
          const text = editor.itemTextBeforeCaret()
          const kw = suggestTriggerPattern
            .exec(text)?.[1]
            .toLocaleLowerCase()

          theKeyword = kw!

          let list = items as UnitPersist[]
          if (typeof kw === 'string' && kw.length > 0) {
            list = $.search.findAll(kw, {
              items: list,
              limit: 50,
            })
          }

          return $.sorter.sortByCglEvaluate(list, kw)
        },
        map: (item: any) => ({
          id: item.ky,
          title: (
            <span className={referCountTitleStyle}>
              <WordHighlight
                content={Item.headString(item)}
                keyword={theKeyword}
                limitLength={20}
              />
              {(() => {
                const count = $.dbMemory.getSubitems(item.ky).length
                return count > 0 ? (
                  <span className="refer-subitem-count">{count}</span>
                ) : null
              })()}
            </span>
          ),
          crumbs: $.crumbs.getCrumbs(item),
          // icon: item.isTopic ? 'svg_document' : 'svg_paragraph',
          extra: [
            {
              icon: item.isTopic ? 'svg_document' : 'svg_paragraph',
            },
          ],
          handle({ editor: itemEditor }: SlashHanlderParams) {
            const queryRange = getReferQueryRange(itemEditor)
            if (queryRange) {
              Transforms.select(itemEditor, queryRange)
              itemEditor.insertFragment([
                $.refer.createElement({ ky: item.ky }) as unknown as Node,
                { text: ZERO_WIDTH_SPACE },
              ])
            }
          },
        }),
        body: () => {
          const subitems = this.getSuggestItems() as any
          return subitems
        },
      }
      return menu as any
    }

    /**
     * Create a block reference element with the selected text
     * @param editor
     * @returns
     */
    linkSelection(editor: ItemEditor) {
      const { inlines, refer, dbMemory, daily } = this.app.addons
      const selection = editor.selection as Range
      if (
        selection &&
        !Range.isCollapsed(selection) &&
        !editor.itemSelection().isMulti
      ) {
        // const selectedText = getSelectionText()
        const selectedText = getRangeText(editor)

        if (!notEmpty<string>(selectedText)) {
          return true
        }

        // find if there is a topic with the same text
        const targetItem =
          $.topic.getTopic(selectedText) ||
          dbMemory.list.find((item) => Item.headString(item) === selectedText)

        if (!isEmpty(targetItem) && targetItem!.ky !== editor.item().ky) {
          inlines.toggle(editor, refer.createElement({ ky: targetItem!.ky }))
          editor.insertFragment([{ text: ZERO_WIDTH_SPACE }])
          return false
        }

        // otherwise, create a new item in the daily note, then link it
        const todayItem = daily.getTodayItem()
        const newItem = Item.newItem({
          ori: selectedText,
          pky: todayItem?.ky,
        })
        dbMemory.saveItem(newItem)
        inlines.toggle(editor, refer.createElement({ ky: newItem.ky }))
        editor.insertFragment([{ text: ZERO_WIDTH_SPACE }])
        return false
      }
      return true
    }

    getSuggestItems() {
      return this.app.addons.dbMemory.list
    }

    strmap(): StrmapRuleInfo {
      const { refer } = this.app.addons
      return {
        title: 'Block reference',
        strmapRule: /\(\((.+?)\)\)$/,
        handle({ match }: StrmapParams) {
          try {
            const ky = match[1]
            if (isValidKy(ky) && ky in $.dbMemory.nodes) {
              return refer.createElement({ ky })
            }
            return match[0]
          } catch (e) {
            return match[0]
          }
        },
      } as any
    }

    fromMarkdown(md: string) {
      return undefined
    }

    slashMenu(): SlashMenuItems {
      const { slashMenu } = this.app.addons
      return {
        slashRefer: {
          title: $t`refer.slash_menu_title`,
          icon: 'svg_document',
          order: 100,
          versions: {
            pinyin: { v: 'wen ben ying yong' },
            py: { v: 'wbyy' },
            en: { v: 'reference' },
            cn: { v: '文本块引用' },
          },
          id: 'slashRefer',
          handle({ editor }: SlashHanlderParams) {
            slashMenu.insertText(editor, '((')
          },
        },
      }
    }

    /**
     * 创建一个包含着块引用的 item
     * @param props
     * @returns
     */
    makeItem(props: { refky: KyString; editor: ItemEditor }): ItemNode {
      const { refky, editor } = props
      return Item.make(
        {
          ori: `((${refky}))`,
          leaves: [
            { text: '' },
            this.createElement({ ky: refky }) as unknown as Node,
            { text: '' },
          ],
        },
        { editor }
      )
    }

    createElement(props: { ky: KyString; note?: string }): ReferElement {
      const el = {
        inline: true,
        blockType: 'refer',
        value: props.ky,
        iky: mkid(),
        children: [{ text: '' }],
      } as ReferElement
      if (props.note) {
        el.note = props.note
      }
      return el
    }

    verify(val: any): val is ReferElement {
      return Element.isElement(val) && (val as any).blockType === 'refer'
    }

    handleReferIconClick(item: UnitPersist) {
      $.refer.route(item)
    }

    route(info: { ky: KyString }, extraInfo = {}, itemEditor?: ItemEditor) {
      $.router.to(info, extraInfo, itemEditor) // todo zoomin place
    }

    /**
     * 从一个列表中找到引用了某个块的 item
     * @param refky
     * @param items
     * @returns
     */
    find(refky: KyString, items: UnitPersist[]) {
      return items.find((item) => item.referText?.includes(refky)) ?? false
    }

    /**
     * 从某一个节点的子节点中找到引用了某个块的 item
     * @param refky
     * @param underKy
     * @returns
     */
    findUnder(refky: KyString, underKy: KyString) {
      return $.refer.find(refky, $.dbMemory.getItemsByIndex('path', underKy))
    }

    makeReferUnder(refky: KyString, underKy: KyString) {
      const newItem = Item.newItem({
        leaves: [
          { text: '' },
          $.refer.createElement({ ky: refky }),
          { text: '' },
        ],
        pky: underKy,
        referText: [refky],
        weight: $.dbMemory.getMaxWeightOfSubitems(underKy) + 1000,
      })
      $.dbMemory.saveItem(newItem)
    }

    addonBeforeRun() {
      $.indexedCount?.addIndexKey('referText')

      // const { dbMemory, refer } = this.app.addons;

      // // 更新引用的计数
      // const setCount = (ky: string) => {
      //   const count = Object.values(dbMemory.indexed.referText[ky]).filter(
      //     (item) => Item.isNormalStatus(item)
      //   ).length;
      //   refer.setCount(ky, count);
      // };

      // after(dbMemory.indexIt, (_, indexName, indexValue) => {
      //   if (indexName !== 'referText') {
      //     return;
      //   }
      //   atLater(() => {
      //     setCount(indexValue);
      //   }, `${indexName}-${indexValue}`);
      // });

      // after(dbMemory.clearItemIndex, (_, item, indexes) => {
      //   if (indexes.includes('referText') && !isEmpty(item.referText)) {
      //     item.referText.forEach((ky) => {
      //       setCount(ky);
      //     });
      //   }
      // });

      $.floatBar?.addItems({
        refer: {
          order: 1000,
          icon: icons.svg_refer,
          title: $t`refer.float_bar_title`,
          onClick: () => {
            const { editor } = $.floatBar.getContext()
            $.refer.linkSelection(editor)
          },
        },
      })
    }

    getItem(ky: KyString) {
      if (!this.app.addons.dbMemory.itemExist(ky)) {
        throw new Error(`Item ${ky} not exist`)
      }
      return this.app.addons.dbMemory.getItem(ky)
    }

    createComponent() {
      return ReferComp
    }

    addonInfo() {
      return {
        title: $t`refer.title`,
        type: 'fieldset',
        defaultValue: 'on',
        quote: $t`refer.quote`,
      }
    }

    addonRun() {
      $.editorView?.addMoreComponent(ReferMenuComp)

      // 引用展示为源块的只读镜像（Roam 模式）：预览是 contentEditable=false 的，
      // 光标不会进入引用内部，方向键由浏览器/编辑器按普通 inline 单元处理。

      // const { renderElement } = $.editorView
      // cover(renderElement, (props) => {
      //   const { element } = props
      //   if ('refFrom' in element) {
      //     console.log(element)
      //   }
      //   return renderElement.call($.editorView, props)
      // })

      // 将 item 所引用过的 ky 保存到它的 referText 字段
      const { saveItem } = $.dbMemory
      cover(saveItem, (item, options) => {
        const newItem = deepClone(item)
        const referText: { [ky: KyString]: boolean } = {}
        if (Array.isArray(item.leaves)) {
          for (const leaf of item.leaves) {
            if ($.refer.verify(leaf)) {
              referText[leaf.refky ?? leaf.value] = true
            }
          }
        }

        if (!isEmpty(referText)) {
          newItem.referText = Object.keys(referText)
        } else if (!isEmpty(newItem.referText)) {
          newItem.referText = []
        }

        return saveItem.call($.dbMemory, newItem, options)
      })

      $.editorView?.addExtraItems({ ReferIcon })

      after($.backlink?.getLinkedItems, (result, ky) => {
        return [...result, ...$.refer.getBacklinkItems(ky)]
      })

      const cond = () => {
        return $.inlinesBar.getContext().is('refer')
      }
      $.inlinesBar?.addItems({
        referToEmbed: {
          icon: 'svg_embed',
          title: `${$t`inlinesBar.turn_into`} ${$t`embed.title`}`,
          cond,
          onClick() {
            try {
              const ctx = $.inlinesBar.getContext<ReferElement>()
              const pathRef = Editor.pathRef(ctx.editor, $.inlinesBar.getPath())
              const embedEl = $.embed.createElement({ ky: ctx.element.value })
              Transforms.insertNodes(ctx.editor, embedEl, {
                at: pathRef.current!,
              })
              Transforms.removeNodes(ctx.editor, { at: pathRef.unref()! })
            } catch (e) {
              console.error(e)
            }
          },
        },
        referToText: {
          cond,
          icon: 'svg_text',
          title: `${$t`inlinesBar.turn_into`} Text`,
          onClick() {
            try {
              const ctx = $.inlinesBar.getContext<ReferElement>()
              const pathRef = Editor.pathRef(ctx.editor, $.inlinesBar.getPath())
              const referItem = $.dbMemory.getItem(ctx.element.value)
              const textList = referItem.leaves ?? [
                { text: Item.headString(referItem) },
              ]
              Transforms.insertNodes(ctx.editor, textList, {
                at: pathRef.current!,
              })
              Transforms.removeNodes(ctx.editor, { at: pathRef.unref()! })
            } catch (e) {
              console.error(e)
            }
          },
        },
        referToBilink: {
          icon: 'svg_bilink',
          title: `${$t`inlinesBar.turn_into`} ${$t`bilink.title`}`,
          cond: () => {
            if (!cond()) {
              return false
            }
            const ctx = $.inlinesBar.getContext<ReferElement>()
            const referItem = $.dbMemory.getItem(ctx.element.value)
            return notEmpty(referItem?.topic)
          },
          onClick() {
            try {
              const ctx = $.inlinesBar.getContext<ReferElement>()
              const referItem = $.dbMemory.getItem(ctx.element.value)
              const pathRef = Editor.pathRef(ctx.editor, $.inlinesBar.getPath())
              const bilinkEl = $.bilink.createElement({
                topic: Item.headString(referItem),
                alias: ctx.element.note,
              })
              Transforms.insertNodes(ctx.editor, bilinkEl, {
                at: pathRef.current!,
              })
              Transforms.removeNodes(ctx.editor, { at: pathRef.unref()! })
            } catch (e) {
              console.error(e)
            }
          },
        },
        // referEllipsis: {
        //   icon: 'svg_ellipsis',
        //   cond() {
        //     if (!cond()) {
        //       return false;
        //     }
        //     const ctx = $.inlinesBar.getContext<ReferElement>();
        //     return ctx.element.note !== '...';
        //   },
        //   title: 'Ellipsis',
        //   onClick() {
        //     try {
        //       $.inlinesBar.setProps<ReferElement>({ note: '...' });
        //     } catch (e) {
        //       console.error(e);
        //     }
        //   },
        // },
      })
    }
  }

  return new Refer()
}
