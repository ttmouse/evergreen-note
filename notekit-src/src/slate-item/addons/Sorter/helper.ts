import { YYYY_MM_DD } from '@/slate-item/utils/date/datekit'
import { NewAddonParams } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { $t } from '@/i18n'
import { escapeRegExp } from '../../utils/regexp'
import { getPlan } from '../DateTool/Reminder/helper'

export const getSortHandlers = ({ $ }: NewAddonParams) => {
  return {
    $reminder: {
      title: $t('sorter.reminder'),
      handle(item: UnitPersist, cur: YYYY_MM_DD | undefined) {
        const plan = getPlan(item)
        if (!plan) return -Infinity
        return $.reminder.getTimeStamp(plan, cur ?? plan.dueDate)
      }
    },

    updated: {
      title: $t('sorter.updated'),
      handle(item: UnitPersist) {
        return item.updated ?? 0
      },
    },

    created: {
      title: $t('sorter.created'),
      handle(item: UnitPersist) {
        return item.created ?? 0
      },
    },
    
    $textLength: {
      title: $t('sorter.word_count_self'),
      handle(item: UnitPersist) {
        const text = Item.headString(item) ?? ''
        return text.length
      },
    },

    $subWordCount: {
      title: $t('sorter.word_count_sub'),
      handle(item: UnitPersist) {
        if (!item.childWordCount) {
          item.childWordCount = $.counter.countWordsOfTree(item).count
        }
        return item.childWordCount
      },
    },

    $mentionCount: {
      title: $t('sorter.mention_count'),
      handle(item: UnitPersist) {
        return notEmpty<string[]>(item.mentions)
          ? Number(item.mentions.length)
          : 0
      },
    },

    $items: {
      title: $t('sorter.items_count'),
      handle(item: UnitPersist) {
        return $.counter.countDescendants(item)
      },
    },

    $text: {
      title: $t('sorter.a_to_z'),
      handle(item: UnitPersist) {
        const text = Item.headString(item) ?? ''
        return text.toLowerCase()
      },
    },

    $number: {
      title: $t('sorter.included_number'),
      handle(item: UnitPersist) {
        const text = Item.headString(item)
        const num = parseFloat(text.replace(/(.*?)([0-9]+)(.*)/, '$2'))
        if (Number.isNaN(num)) {
          return -Infinity
        }
        return num
      },
    },

    $repeat: {
      title: $t('sorter.char_repetition'),
      handle(item: UnitPersist, char: string) {
        const text = Item.headString(item) ?? ''
        const chars = text.replace(
          new RegExp(`(.*?)(${escapeRegExp(char)}+)(.*)`),
          '$2'
        )
        if (!chars.includes(char)) {
          return 0
        }
        return chars.length
      },
    },

    $comprehensive: {
      title: $t('sorter.comprehensive'),
      handle(item: UnitPersist) {
        return $.sorter.evaluate(item)
      },
    },

    $customizedMethod: {
      title: $t('sorter.customized_method'),
      handle(item: UnitPersist, fnStr: string) { 
        const fn: (item: UnitPersist) => number = new Function('item', `try {return ${fnStr}}catch(e){return -Infinity}`) as unknown as (item: UnitPersist) => number
        return fn(item)
      },
    }, 
  }
}
