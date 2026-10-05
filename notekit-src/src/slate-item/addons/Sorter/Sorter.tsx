import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { UnitProps } from '../../interfaces/unit'
import { time } from '../../utils/date/time'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { $t } from '@/i18n'
import { getSortHandlers } from './helper'
import { SortBtnComp } from './SorterBtn'
import { after } from '../../engine/helper'
import { recur } from '../../utils/recur'
import './sorter.less'
import { omit } from '../../utils/object/omit'
import { Item, ItemNode } from '../../interfaces/item'

export const SYM_SCORE = Symbol.for('score')
export const SYM_SCORE_TIME = Symbol.for('score-time')

export type EvaluateOptions = {
  desc?: boolean
  asc?: boolean
  keyword?: string
  calc?: (one: UnitPersist) => number
}
export type SorterField = keyof ReturnType<typeof getSortHandlers>
export type SorterDirection = 'desc' | 'asc'
export type Orderby = [SorterField, SorterDirection, ...any[]]

export type SorterProps = {
  orderby: Orderby
}

export type UnitWithSorter = UnitPersist & {
  sorter: SorterProps
}

export function createSorterAddon({ app, $ }: NewAddonParams) {
  class Sorter implements IAddon {
    app!: App
    config = {}

    getFields() {
      return getSortHandlers({ $, app })
    }

    evaluate(item: UnitPersist, opt: EvaluateOptions = {} as any): number {
      const { counter, dbMemory, star } = this.app.addons

      // 缓存排序权重得分
      if (
        (item as any)[SYM_SCORE_TIME] &&
        time() - (item as any)[SYM_SCORE_TIME] < 60
      ) {
        ;(item as any)[SYM_SCORE_TIME] = time() // 每次读取时，都以本次读取时间为准
        return (item as any)[SYM_SCORE] as number
      }

      const text = Item.headString(item)

      if (isEmpty(text)) {
        return 0
      }

      let score = text.length

      score += counter.countDescendants(item) * 10

      // score += plugin.counter.blockChars(item);

      if (item.topic) {
        score += 100
      } else if (isEmpty(item.pky)) {
        score -= 30
        // 新鲜度，保质期30天
        score += 30 - Math.round((time() - item.updated) / 86400)
      }

      if (star.isStar(item.ky)) {
        score += 30
      }

      const referBlock = dbMemory.indexed.referBlock[item.ky]
      if (!isEmpty(referBlock)) {
        score += Object.keys(referBlock).length * 10
      }
      const referText = dbMemory.indexed.referText[item.ky]
      if (!isEmpty(referText)) {
        score += Object.keys(referText).length * 10
      }

      /*
    const keywords = plugin.keywords.getAll();
    if (Item.headString(item).toLowerCase() in keywords) {
        //keywords
    }
    */

      if (opt && typeof opt.keyword === 'string') {
        const pos = text.toLowerCase().indexOf(opt.keyword)
        if (pos < 0) {
          score -= 1000000
        } else {
          score +=
            (1 - pos / text.length) * 50 +
            (200 * opt.keyword.length) / text.length
        }
      }

      if (opt.calc) {
        const s = opt.calc(item)
        if (s) {
          score += s
        }
      }

      ;(item as any)[SYM_SCORE_TIME] = time() // 每次读取时，都以本次读取时间为准
      ;(item as any)[SYM_SCORE] = score

      // delayonClick(() => console.log({score, text}), 1000 - score, item.ky)

      return score
    }

    sortItems(list: UnitPersist[], copy = true, ...fields: Orderby[]): UnitPersist[] {
      if (isEmpty(list)) {
        return []
      }
      const sorterFields = $.sorter.getFields() as any
      const lst = copy ? [...list] : list
      lst.sort((a: any, b: any) => {
        for (const [by, dir = 'asc', ...args] of fields) {
          let v1
          let v2
          if (by in sorterFields) {
            try {
              v1 = sorterFields[by].handle(a, ...args)
            } catch (e) {
              console.error(e)
              v1 = -Infinity
            }
            try {
              v2 = sorterFields[by].handle(b, ...args)
            } catch (e) {
              console.error(e)
              v2 = -Infinity
            }
          } else {
            v1 = isEmpty(a[by]) ? 0 : a[by]
            v2 = isEmpty(b[by]) ? 0 : b[by]
          }

          if (typeof v1 === 'string' || typeof v2 === 'string') {
            v1 = v1.toString()
            v2 = v2.toString()
            let result = 0
            if (v1 < v2) {
              result = -1
            } else if (v1 > v2) {
              result = 1
            }
            if (dir === 'desc') {
              result *= -1
            }
            return result
          }

          if (v1 !== v2) {
            const flag = dir === 'asc' ? 1 : -1
            return flag * (v1 - v2)
          }
        }
        return 0
      })
      return lst
    }

    sortByEvaluate(
      list: UnitPersist[],
      opt: EvaluateOptions = {} as any
    ): UnitPersist[] {
      opt = { asc: isEmpty(opt.desc), ...opt }
      list.forEach((item: any) => {
        item[SYM_SCORE] = $.sorter.evaluate(item, opt)
      })
      list.sort((a: any, b: any) => {
        const result = a[SYM_SCORE] - b[SYM_SCORE]
        return opt.asc ? result : -result
      })
      return list
    }

    sortByCglEvaluate(list: UnitPersist[], kw: string | undefined) {
      // 简单匹配度计算函数
      const getMatchScore = (item: UnitPersist): number => {
        if (!kw) return 0;
        
        const headStr = Item.headString(item).toLowerCase();
        const quoteStr = Item.quoteString(item).toLowerCase();
        const keyword = kw.toLowerCase();

        if (headStr === keyword) return 1000;
        if (headStr.startsWith(keyword)) return 90;
        if (quoteStr.startsWith(keyword)) return 60;
        if (headStr.includes(keyword)) return 30;
        if (quoteStr.includes(keyword)) return 10;
        return 0;
      };

      // 计算时间权重，越新的权重越高
      const now = Math.floor(Date.now() / 1000);
      const getTimeScore = (item: UnitPersist): number => {
        if (!item.updated) return 0;
        const daysPassed = (now - item.updated) / (24 * 60 * 60); // 相差天数
        // 使用指数衰减，最近更新的项目获得更高权重
        // 1天内权重100，7天内权重50，30天内权重25，以此类推
        return Math.max(0, 100 * Math.exp(-daysPassed / 7));
      };

      if (!kw || /([:()]| OR |-|NOT)/.test(kw)) {
        // 如果没有关键词，或者关键词包含特殊字符（可能是搜索命令），则只按时间排序
        return list.sort((a, b) => {
          const scoreA = getTimeScore(a);
          const scoreB = getTimeScore(b);
          return scoreB - scoreA; // 时间新优先
        });
      }

      return list.sort((a, b) => {
        // topic 优先级最高
        if (a.topic && !b.topic) return -1;
        if (!a.topic && b.topic) return 1;
        
        // 按匹配度排序
        const scoreA = getMatchScore(a) * .6 + getTimeScore(a) * .4;
        const scoreB = getMatchScore(b) * .6 + getTimeScore(b) * .4;
        
        return scoreB - scoreA;
      })
    }

    itemHasSorter(item: UnitPersist): item is UnitWithSorter {
      if (Array.isArray((item as any)?.sorter?.orderby)) {
        return true
      }
      return false
    }

    sortRecursively(item: UnitPersist) {
      recur(item as any, (one) => {
        if ($.sorter.itemHasSorter(one as any)) {
          const { orderby } = (one as any as UnitWithSorter).sorter
          if (Array.isArray(orderby) && orderby[0] in $.sorter.getFields()) {
            const subitems = $.sorter.sortItems(one.subitems, true, orderby)
            one.subitems = subitems
          }
        }
      })
      return item
    }

    /**
     * Save sorter config
     * @param item
     * @param newOrderby
     */
    saveItem(item: UnitWithSorter, newOrderby: Orderby) {
      const { sorter = {} } = item
      const newSubitems = $.sorter.sortItems(
        (item.subitems ?? []) as any,
        true,
        newOrderby
      )
      $.dbMemory.saveItem({
        ...item,
        sorter: {
          ...sorter,
          orderby: newOrderby,
        },
        subitems: newSubitems,
        $id: Date.now().toString(), // 定义一个新的id，触发重新渲染
      })
    }

    /**
     * Clear the sorter info to restore the default order
     * @param item
     */
    clear(item: UnitWithSorter) {
      $.dbMemory.saveItem({
        ...item,
        sorter: {},
        subitems: [...$.dbMemory.getSubitems(item.ky, { isRecur: true })],
        $id: Date.now().toString(), // 定义一个新的id，触发重新渲染
      })
    }

    getSchemeGetter(doSort: (k: Orderby | undefined) => any) {
      const wrappedDoSort = (k: Orderby | undefined) => {
        if (k && k[0] === '$repeat') {
          k[2] =
            (prompt($t('sorter.input_repeat_char')) as string)
        } else if (k && k[0] === '$customizedMethod') {
          k[2] =
            (prompt($t('sorter.input_customized_sorter')) as string)
        }
        doSort(k)
      }
      const menu: { [k: string]: Partial<UnitProps> } = {
        default: {
          title: $t('sorter.default'),
          icon: 'svg_dot',
          onClick: () => {
            wrappedDoSort(undefined)
          },
        }
      }
      for (const [k, v] of Object.entries($.sorter.getFields())) {
        menu[k] = {
          title: v.title,
          icon: 'svg_dot',
          onClick() {
            wrappedDoSort([k as SorterField, 'asc'])
          },
          extra: [
            {
              icon: 'svg_asc',
              title: $t('sorter.asc'),
              onClick() {
                wrappedDoSort([k as SorterField, 'asc'])
              },
            },
            {
              icon: 'svg_desc',
              title: $t('sorter.desc'),
              onClick() {
                wrappedDoSort([k as SorterField, 'desc'])
              },
            },
          ],
        }
      }
      return menu
    }

    getMenu(ctxItem?: ItemNode) {
      const doSort = (by: SorterField, dir: SorterDirection) => {
        const item = ctxItem ?? $.floatMenu.getContext()?.item
        const orderby: Orderby = [by, dir]
        if (by === '$repeat') {
          orderby[2] =
            item.sorter?.orderby?.[2] ??
            (prompt($t('sorter.input_repeat_char')) as string)
        }
        $.sorter.saveItem(item as any, orderby)
      }

      const menu: { [k: string]: Partial<UnitProps> } = {
        $default: {
          title: $t('sorter.default'),
          icon: 'svg_dot',
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            $.sorter.clear(ctxItem ?? ($.floatMenu.getContext().item as any))
          },
        },
      }

      for (const [k, v] of Object.entries($.sorter.getFields())) {
        menu[k] = {
          title: v.title,
          icon: 'svg_dot',
          onClick() {
            doSort(k as SorterField, 'asc')
          },
          extra: [
            {
              icon: 'svg_asc',
              title: $t('sorter.asc'),
              onClick() {
                doSort(k as SorterField, 'asc')
              },
            },
            {
              icon: 'svg_desc',
              title: $t('sorter.desc'),
              onClick() {
                doSort(k as SorterField, 'desc')
              },
            },
          ],
        }
      }
      return menu
    }

    addonRun() {
      // $.editorView.addExtraItems({ SortBtnComp });
      // $.floatMenu?.addItems({
      //   sort: {
      //     title: $$`Sort subitems by`,
      //     icon: 'svg_sort',
      //     subitems: $.sorter.getMenu(),
      //     order: 6500,
      //   },
      // });
      // after($.editorView?.getItem, $.sorter.sortRecursively);
      // after($.refresh?.getItem, $.sorter.sortRecursively);
    }
  }

  return { sorter: new Sorter() }
}
