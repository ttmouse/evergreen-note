import { App, NewAddonParams } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { Element } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { mkid } from '../../utils/string/mkid'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { CounterElementComp } from './CounterElementComp'
import { $t } from '../../../i18n'
import { FORM_EL } from '../Form/Form'
import { ItemTransforms } from '@/slate-item'
import { $$ } from '@/slate-item/utils/lang'

function countWords(text: string) {
  // 处理英文字符数字，连续字母、数字、英文符号视为一个单词
  text = text
    .replace(/\[\[|\]\]/g, '')
    .replace(/([x00-xff]|[-_]|[a-z\.,'&"?;_!@#$%\[\]\(\)])+/gi, (e)=>{
      return "m".repeat(e.split(/([-_]|[\.,'&"?;_!@#$%\[\]\(\)])/).filter(e=>/[a-z0-9]/i.test(e)).length);
    })
  // x`将回车换行符做特殊处理
  text = text.replace(/(\r|\n|\s| |&nbsp;)+/g, '')
  return text.length
}

export type CounterNeededProps = {
  value: number
  target?: 'subitems' | 'enditems' | 'customized' | 'descendant'
  customized?: string
}

export type CounterElement = InlineElement & CounterNeededProps

export function createCounterAddon({ app, $ }: NewAddonParams) {
  class Counter implements IAddonElement<CounterElement> {
    app!: App
    config = {}

    fieldset() {
      return {
        target: {
          type: FORM_EL.select,
          title: $t`counter.inline_form_title`,
          options: {
            subitems: $t`counter.subitems`,
            descendant: $t`counter.descendant`,
            enditems: $t`counter.enditems`,
            customized: $t`counter.customized`,
          },
        },
        customized: {
          type: FORM_EL.logicString,
          title: $t`counter.customized_title`,
          when: { target: 'customized' },
          quote: $t`counter.customized_quote`,
        },
      }
    }

    isVoid(val: CounterElement) {
      return this.verify(val)
    }

    createComponent() {
      return CounterElementComp
    }

    exportString(el: CounterElement): string {
      return el.value
    }

    fromMarkdown(md: string) {
      return undefined
    }

    verify(val: any): val is CounterElement {
      return Element.isElement(val) && (val as any).blockType === 'counter'
    }

    strmap(): StrmapRuleInfo {
      const { counter } = this.app.addons
      return {
        title: 'Counter',
        strmapRule: /\{\{counter\s+?(.+?)\}\}$/,
        handle({ match }: StrmapParams) {
          return counter.createElement({ value: match[1] })
        },
      } as any
    }

    createElement(props: { value: string }): CounterElement {
      return {
        inline: true,
        isVoid: true,
        iky: mkid(),
        blockType: 'counter',
        ...props,
        children: [{ text: `{{counter ${props.value}}}` }],
      } as CounterElement
    }

    slashMenu(): SlashMenuItems {
      const { slashMenu, counter } = this.app.addons
      return {
        slashItemCount: {
          icon: 'svg_counter',
          title: $t`counter.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'Item count' },
            cn: { v: '统计节点数' },
            pingyin: { v: 'tong ji jie dian shu' },
            py: { v: 'tjjds' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, [counter.createElement({ value: '' })])
          },
        },

        // slashShowWordCount: {
        //   icon: 'svg_number',
        //   title: $$`Word count`,
        //   order: slashMenu.order.inline,
        //   versions: {
        //     en: { v: 'Word count' },
        //     cn: { v: '统计字数' },
        //     pingyin: { v: 'tong ji zi shu' },
        //     py: { v: 'tjzs' },
        //   },
        //   handle({ editor }) {
        //     ItemTransforms.setItems(editor, {
        //       at: editor.itemPath(),
        //       props: {
        //         counter: { showWordCount: true },
        //       },
        //     });
        //     slashMenu.insertText(editor, '');
        //   },
        // },
      }
    }

    countCharsOfTree(
      rootItem: UnitPersist | KyString,
      countSelf = true
    ): number {
      const { dbMemory } = this.app.addons
      if (typeof rootItem === 'string') {
        rootItem = dbMemory.getItem(rootItem)
      }
      let count = 0
      if (countSelf) {
        count += Item.headString(rootItem).length
      }
      const items = dbMemory.getItemsByIndex('path', rootItem.ky)
      for (const item of items) {
        count += (Item.headString(item) ?? '').length
      }
      return count
    }

    countWordsOfTree(
      rootItem: UnitPersist | KyString,
      countSelf = true,
      needRefer = false
    ): { count: number, rootItemCount: number, rootItemCountRefer: number, countRefer: number } {
      const { dbMemory } = this.app.addons
      if (typeof rootItem === 'string') {
        return this.countWordsOfTree(dbMemory.getItem(rootItem))
      }
      let count = 0
      let rootItemCount = 0
      let countRefer = 0
      let rootItemCountRefer = 0
      if (countSelf) {
        count += (rootItemCount = this.countWordsOfItem(rootItem))
        if (needRefer) countRefer += (rootItemCountRefer = this.countWordsOfItem(rootItem, true))
      }
      const list = dbMemory.getSubitems(rootItem.ky, {
        isSort: false,
      })
      for (const item of list) {
        count += this.countWordsOfTree(item, true).count
        if (needRefer) countRefer += this.countWordsOfTree(item, true, true).countRefer!
      }
      return { count, rootItemCount, rootItemCountRefer, countRefer }
    }

    countWordsOfItem(item: UnitPersist, parseRefer = false): number {
      const headString = Item.headString(item, { parseRefer })
      if (!isEmpty(headString) && Item.isNormalStatus(item)) {
        return countWords(headString)
      }
      return 0
    }

    countDescendants(rootItem: UnitPersist): number {
      const { dbMemory } = this.app.addons
      if (dbMemory.indexed.path[rootItem.ky]) {
        return Object.values(dbMemory.indexed.path[rootItem.ky]).length
      }
      return 0
    }

    addonInfo() {
      return {
        title: $t`counter.title`,
        quote: $t`counter.quote`,
        defaultValue: 'on',
        type: 'fieldset',
      }
    }

    addonRun() {}
  }

  return new Counter()
}
