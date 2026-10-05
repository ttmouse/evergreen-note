import { AutoCompleteParams } from '../../components/AutoComplete/AutoComplete'
import { App, NewAddonParams } from '../../engine/App'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { Editor, Element, Node, Transforms } from '../../slate.inc'
import {
  filterItems,
  SlashHanlderParams,
  SlashMenuItems,
} from '../SlashMenu/SlashMenu'
import { KyString } from '../../interfaces/unit'
import { EmbedMenuComp } from './EmbedMenuComp'
import { after, cover } from '../../engine/helper'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import { EmbedElementComp } from './EmbedElementComp'
import { isEmpty } from '../../utils/isEmpty'
import { Item } from '../../interfaces/item'
import React from 'react'
import { deepClone } from '../../utils/object/deepClone'
import {
  ZERO_WIDTH_SPACE,
  StrmapParams,
  StrmapRuleInfo,
} from '../Strmap/Strmap'
import { mkid } from '../../utils/string/mkid'
import { EmbedZoominIcon } from './EmbedZoominIcon'
import { $t } from '../../../i18n'
import { FORM_EL } from '../Form/Form'
import { EmbedToReferIcon } from './EmbedToReferIcon'
import { CustomEditor } from '@/slate-item/custom-types'

const suggestTriggerPattern = /\{\{Embed src="([^)]*)$/

export type EmbedElement = InlineElement & {
  blockType: 'embed'
  method?: 'mirror' | 'inline'
  refky?: KyString
  value: KyString // Same as refky
  isMirror?: boolean // 镜头模式时, 一个 item 只能有一个嵌入块, 而除了这个嵌入块, 也不能有任何其他内容
  children: Node[]
}

/**
 * Block Embedence
 *
 * The syntax of block reference is ((block-id))
 */
export class Embed implements IAddonElement<EmbedElement> {
  app!: App
  config = {}
  counts: { [ky: KyString]: number } = {}

  // fieldset() {
  //   return {
  //     value: {
  //       type: FORM_EL.text,
  //       title: 'Embed ID',
  //     },
  //     method: {
  //       title: '嵌入方式',
  //       type: FORM_EL.select,
  //       options: {
  //         mirror: '镜像',
  //         inline: '行内',
  //       },
  //     },
  //   };
  // }

  isVoid(val: InlineElement) {
    return this.verify(val)
  }

  setCount(ky: KyString, count: number) {
    this.counts[ky] = count
  }

  getCount(ky: KyString) {
    // return this.counts[ky] ?? 0;
    return this.app.addons.indexedCount?.getCount('referBlock', ky) ?? 0
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
      .getItemsByIndex('referBlock', ky)
      .filter((item) => !item.path?.includes(ky))
      .map((item) => {
        return {
          ...item,
          subitems: dbMemory.getSubitems(item.ky, { isRecur: true }),
        }
      })
    return items
  }

  getBacklinkGroupItems(ky: KyString): UnitPersist[] {
    return Item.groupItemsByTopic(this.getBacklinkItems(ky))
  }

  getSuggestMenu({ editor }: { editor: ItemEditor }): AutoCompleteParams {
    const embedAddon = this.app.addons.embed
    const menu = {
      title: 'Embed Menu',
      autoRule: () => suggestTriggerPattern.exec(editor.itemTextBeforeCaret()),
      filter: ({ items }: any) => {
        const kw = suggestTriggerPattern
          .exec(editor.itemTextBeforeCaret())?.[1]
          .toLocaleLowerCase()
        return filterItems(items, kw ?? '', false)
      },
      map: (item: UnitPersist) => ({
        id: item.ky,
        title: Item.headString(item),
        icon: 'svg_embed',
        handle({ editor: itemEditor }: SlashHanlderParams) {
          itemEditor.replaceTextBeforeCaret(suggestTriggerPattern, [
            embedAddon.createElement({ ky: item.ky }),
            {
              text: ZERO_WIDTH_SPACE,
            },
          ])
        },
      }),
      body: () => this.app.addons.dbMemory.list,
    }
    return menu as any
  }

  strmap(): StrmapRuleInfo {
    const { embed } = this.app.addons
    return {
      title: 'Block embed',
      strmapRule: /\{\{Embed src="(.+?)"\}\}$/,
      handle({ match }: StrmapParams) {
        try {
          return embed.createElement({ ky: match[1] })
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
      slashEmbed: {
        title: $t`embed.slash_menu_title`,
        icon: 'svg_embed',
        order: 100,
        versions: {
          pinyin: { v: 'kuai qian ru' },
          py: { v: 'qr' },
          en: { v: 'block embed' },
          cn: { v: '块嵌入' },
        },
        id: 'slashEmbed',
        handle({ editor }: SlashHanlderParams) {
          slashMenu.insertText(editor, '{{Embed src="')
        },
      },
    }
  }

  createElement(props: { ky: KyString }): EmbedElement {
    return {
      inline: true,
      isVoid: true,
      blockType: 'embed',
      value: props.ky,
      iky: mkid(),
      children: [{ text: `{{Embed src="${props.ky}"}}` }],
    } as EmbedElement
  }

  verify(val: any): val is EmbedElement {
    return Element.isElement(val) && (val as any).blockType === 'embed'
  }

  exportString(el: EmbedElement, { rich }: { rich?: boolean }): string {
    const item = this.app.addons.dbMemory.getItem(el.value, { isRecur: true })
    const str = Item.blockString(item, { parseRefer: true, rich })
    // eslint-disable-next-line prefer-template
    return '\n```\n' + str.trim() + '\n```\n'
  }

  inlinesBarAddItems() {
    const $ = this.app.addons;
    const cond = () => $.inlinesBar.getContext().is('embed')
    $.inlinesBar?.addItems({
      embedToRefer: {
        title: `${$t`inlinesBar.turn_into`} ${$t`Inline Reference`}`,
        icon: 'svg_refer',
        cond,
        onClick: () => {
          const ctx = $.inlinesBar.getContext<EmbedElement>()
          const referEl = $.refer.createElement({
            ky: ctx.element.value,
          })
          const pathRef = Editor.pathRef(ctx.editor, $.inlinesBar.getPath())
          Transforms.insertNodes(ctx.editor, referEl as unknown as CustomEditor, {
            at: pathRef.current!,
          })
          Transforms.removeNodes(ctx.editor, {
            at: pathRef.unref()!,
          })
        },
      },
    })
  }

  addonBeforeRun() {
    this.app.addons.indexedCount?.addIndexKey('referBlock')
  }

  getItem(ky: KyString) {
    return this.app.addons.dbMemory.getItem(ky)
  }

  createComponent() {
    return React.memo(EmbedElementComp) as any
  }

  addonInfo() {
    return {
      title: $t`embed.title`,
      quote: $t`embed.quote`,
      type: 'fieldset',
      defaultValue: 'on',
    }
  }

  addonRun() {
    const { editorView, embed, refer, backlink, dbMemory, editorFactory } =
      this.app.addons

    editorFactory.addIsVoidMethod((node) => embed.verify(node))
    editorView?.addMoreComponent(EmbedMenuComp)

    // 给嵌入块添加一个 zoomin 按钮
    editorView?.addExtraItems({
      EmbedZoominIcon,
    })

    // 将 item 所引用过的 ky 保存到它的 referBlock 字段
    const { saveItem } = dbMemory
    cover(saveItem, (item, ...args) => {
      const newItem = deepClone(item)
      const referBlock: { [ky: KyString]: boolean } = {}
      if (Array.isArray(item.leaves)) {
        for (const leaf of item.leaves) {
          if (embed.verify(leaf)) {
            referBlock[leaf.refky ?? leaf.value] = true
          }
        }
      }

      if (!isEmpty(referBlock)) {
        newItem.referBlock = Object.keys(referBlock)
      } else if (!isEmpty(newItem.referBlock)) {
        newItem.referBlock = []
      }

      return saveItem.call(dbMemory, newItem, ...args)
    })

    after(backlink?.getLinkedItems, (result: UnitPersist[], ky: KyString) => {
      return [...result, ...embed.getBacklinkItems(ky)]
    })

    after(refer.getCount, (result: number, ky: KyString) => {
      return result + embed.getCount(ky)
    })

    this.inlinesBarAddItems()
  }
}

export function createEmbedAddon({ app, $ }: NewAddonParams) {
  return new Embed()
}
