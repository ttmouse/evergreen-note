/* eslint-disable prettier/prettier */
import { isEmpty, notEmpty } from '@/slate-item/utils/isEmpty'
import { Item, ItemEditor, ItemTransforms } from '../..'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { ItemNode } from '../../interfaces/item'
import { Node, Path } from '../../slate.inc'
import { StrmapRuleInfo } from '../Strmap/Strmap'
import './OrderedList.less'
import { nodeString } from '@/slate-item/utils/string/nodeString'

const stylePrefix = 'orderedlist'

const styName = (name: string) => `${stylePrefix}_${name}`

export type OrderedRuleInfo = StrmapRuleInfo & { rule: RegExp }

/**
 * 有序列表
 */
export function createOrderedListAddon({ app, $ }: NewAddonParams) {
  const applyIt = (editor: ItemEditor, path: Path, counterType: string): string => {
    // 如果节点是第一个节点，则将它的父级节点转换为有序列表容器
    // 否则创建一个 headless 节点作为列表容器
    if (editor.itemIndex() === 0) {
      const item = editor.itemPathParent(path)
      $.orderedList.setStyle(editor, item, counterType)
    } else {
      // 如果当前节点本身已经处于有序列表容器中，则不再任何操作
      if ($.orderedList.isOrderedList(editor.itemParent())) {
        return ''
      }
      setTimeout(() => {
        $.blockStyle.wrap(editor, ['headless_col', styName(counterType)], {
          at: path,
        })
      }, 0)
    }
    return ''
  }



  class OrderedList implements IAddon {
    app!: App;
    config = {};
    counters: { [counterType: string]: OrderedRuleInfo } = {};

    setStyle(editor: ItemEditor, item: ItemNode | Path, counterType: string, isTrimCounter = true) {
      const theItem = Array.isArray(item) ? editor.item(item) : item
      $.blockStyle.setStyle(editor, item, styName(counterType))
      if (isTrimCounter) {
        const ruleInfo = $.orderedList.counters[counterType]
        $.orderedList.trimCounter(editor, theItem, ruleInfo)
      }
    }

    addStrmapRules() {
      $.strmap.addRules($.orderedList.counters)
    }

    detect(item: UnitPersist) {
      for (const [name, info] of Object.entries($.orderedList.counters)) {
        if (info.rule.test(Item.headString(item))) {
          return [name, info]
        }
      }
      return null
    }

    convert(editor: ItemEditor, item: ItemNode, options?: { recur: boolean }) {
      const {
        recur = false
      } = options ?? {}
      if (!$.orderedList.isOrderedList(item)) {
        const subitems = editor.itemSubitems(item.GetSlPath())
        let theRule: any
        for (const sub of subitems) {
          theRule = $.orderedList.detect(sub)
          if (!theRule) {
            break
          }
        }
        if (theRule) {
          const [type] = theRule as [string, OrderedRuleInfo]
          $.orderedList.setStyle(editor, item, type, true)
        }
        if (recur) {
          for (const sub of editor.itemSubitems(item.GetSlPath())) {
            $.orderedList.convert(editor, sub, { recur })
          }
        }
      }
    }

    trimCounter(editor: ItemEditor, item: ItemNode, ruleInfo: OrderedRuleInfo) {
      for (const sub of editor.itemSubitems(item.GetSlPath())) {
        const str = Item.headString(sub)
        if (ruleInfo.rule.test(str) && !ruleInfo.strmapRule.test(str)) {
          let leaves: string | Node[] = Item.headString(sub).replace(ruleInfo.rule, '')
          if (notEmpty(sub.leaves)) {
            leaves = []
            for (const lf of sub.leaves) {
              if (nodeString(lf).length > 0 && leaves.length < 1) {
                leaves.push({ text: `${nodeString(lf)} `.replace(ruleInfo.rule, '') })
              } else {
                leaves.push(lf)
              }
            }
          }
          ItemTransforms.replaceText(editor, {
            at: sub.GetSlPath(),
            text: leaves,
          })
        }
      }
    }

    /**
     * Check if an item has been applied ordered-list
     * @param item
     * @returns 
     */
    isOrderedList(item: UnitPersist) {
      return $.blockStyle.hasStyle(item, stylePrefix)
    }

    addonInfo() {
      return {
        title: $t`orderedList.title`,
        quote: $t`orderedList.quote`,
        type: 'fieldset',
        defaultValue: 'off',
        updated: 20221024,
        depend: ['style', 'blockStyle'],
      }
    }

    addonBeforeRun() {
      const isHeadless = (item: UnitPersist) => $.blockStyle.hasStyle(item, 'headless')
      $.is.addRules({
        orderedlist: (item: UnitPersist) => {
          return $.orderedList.isOrderedList(item)
        },

        headless: (item: UnitPersist) => {
          return isHeadless(item)
        }
      })
    }

    addonRun() {
      $.orderedList.counters = {
        'nested': {
          title: $t`orderedList.nested`,
          strmapRule: /^[1]\.\.(\s|&nbsp;)/,
          rule: /^[0-9]\.\.(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'nested')
          }
        },
        'n': {
          title: $t`orderedList.number`,
          // strmapRule: /^[0-9](\s|&nbsp;)/,
          strmapRule: /^@NEVER_TRIGGER_ME@/,
          rule: /^@NEVER_TRIGGER_ME@/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'n')
          },
        },
        'n.': {
          title: $t`orderedList.number_dot`,
          strmapRule: /^[1]\.(\s|&nbsp;)/,
          rule: /^[0-9]+\.(\s|&nbsp;)+/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'n.')
          },
        },
        'n)': {
          title: $t`orderedList.number_right_bracket`,
          strmapRule: /^[1]{1,2}\)(\s|&nbsp;)/,
          rule: /^[0-9]+\)(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'n)')
          },
        },
        '(n)': {
          title: $t`orderedList.(number)`,
          strmapRule: /^\([1]{1,2}\)(\s|&nbsp;)/,
          rule: /^\([0-9]+\)(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, '(n)')
          }
        },
        'a': {
          title: $t`orderedList.lower`,
          // strmapRule: /^[a-z](\s|&nbsp;)/,
          strmapRule: /^@NEVER_TRIGGER_ME@/,
          rule: /^@NEVER_TRIGGER_ME@/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'a')
          }
        },
        'a.': {
          title: $t`orderedList.lower_dot`,
          strmapRule: /^[a]\.(\s|&nbsp;)/,
          rule: /^[a-z]\.(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'a.')
          }
        },
        'a)': {
          title: $t`orderedList.lower)`,
          strmapRule: /^[a]\)(\s|&nbsp;)/,
          rule: /^[a-z]\)(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'a)')
          }
        },
        '(a)': {
          title: $t`orderedList.(lower)`,
          strmapRule: /^\([a]\)(\s|&nbsp;)/,
          rule: /^\([a-z]\)(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, '(a)')
          }
        },
        // 'A': {
        //   title: $t`orderedList.upper`,
        //   strmapRule: /^[A](\s|&nbsp;)/,
        //   handle({ path, editor }) {
        //     return applyIt(editor, path, 'A');
        //   }
        // },
        'A.': {
          title: $t`orderedList.upper_dot`,
          strmapRule: /^[A]\.(\s|&nbsp;)/,
          rule: /^[A-Z]\.(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'A.')
          }
        },
        'roman': {
          title: $t`orderedList.roman`,
          strmapRule: /^ii(\s|&nbsp;)/,
          rule: /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii)(\.?\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'roman')
          }
        },
        'ROMAN': {
          title: $t`orderedList.roman`,
          strmapRule: /^II(\s|&nbsp;)/,
          rule: /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)(\.?\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, 'ROMAN')
          }
        },
        '一、': {
          title: '中文数字、',
          strmapRule: /^[一]、(\s|&nbsp;)/,
          rule: /^[一二三四五六七八九十]、(\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, '一、')
          }
        },
        '一)': {
          title: '中文数字)',
          strmapRule: /^[一][)）](\s|&nbsp;)/,
          rule: /^[一二三四五六七八九十][)）](\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, '一)')
          }
        },
        '(一)': {
          title: '(中文数字)',
          rule: /^[(（][一][）)](\s|&nbsp;)/,
          strmapRule: /^[(（][一二三四五六七八九十][）)](\s|&nbsp;)/,
          handle({ path, editor }) {
            return applyIt(editor, path, '(一)')
          }
        },
      }

      $.orderedList.addStrmapRules()

      const subitems = {} as any
      for (const [counterType, info] of Object.entries($.orderedList.counters)) {
        subitems[counterType] = {
          title: info.title,
          icon: 'svg_dot',
          onClick() {
            const { editor, item } = $.floatMenu.getContext()
            $.orderedList.setStyle(editor, item, counterType)
          },
        }
      }

      $.floatMenu.addItems({
        orderedList: {
          title: $t`orderedList.item_menu_title`,
          icon: 'svg_ordered_list',
          order: 6000,
          subitems: {
            ul: {
              title: $t`orderedList.item_menu_undered_list`,
              icon: 'svg_list',
              onClick() {
                const { editor, item } = $.floatMenu.getContext()
                $.orderedList.setStyle(editor, item, 'ul')
              },
            },
            ...subitems,
          }
        },
      })
    }
  }
  return { orderedList: new OrderedList() }
}
