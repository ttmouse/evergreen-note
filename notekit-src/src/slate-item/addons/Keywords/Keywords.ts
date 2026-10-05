import { IAddon, App, NewAddonParams } from '../../engine/App'
import { before } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { KyString, UnitPersist } from '../../interfaces/unit'
import { time } from '../../utils/date/time'
import { isEmpty } from '../../utils/isEmpty'
import { trim } from '../../utils/string/trim'
import { atLater } from '../../utils/atLater'
import { pub } from '@/slate-item/utils/pub'

export type KeywordProps = {
  title: string
  linked: { [ky: KyString]: UnitPersist }
  heat: number
  recent: number
  firstTime: number
  lastTime: number
  linkedChars: number
  linkedCount: number
  score: number
}

const IS_NUMBER = /^[0-9]{1,2}$/

export function createKeywordsAddon({ app, $ }: NewAddonParams) {
  class Keywords implements IAddon {
    app!: App
    config = {}

    all: { [kw: string]: KeywordProps } = {}

    add(kw: string) {
      const lower = trim(kw.toLowerCase())
      if (lower in this.all) {
        return
      }
      this.all[lower] = {
        title: trim(kw),
        linked: {},
        heat: 0,
        recent: 0,
        firstTime: time(),
        lastTime: 0,
        linkedChars: 0,
        linkedCount: 1,
      } as any
      return this.all[lower]
    }

    getAll() {
      return Object.values(this.all)
    }

    getList(keyword = '') {
      const result: any = []

      const { dbMemory, counter } = this.app.addons

      /*
      权重计算：
      - 字数
      - 引用次数
      - 是否 snippet
      - 是否为主题
      - 最后修改时间
      - 最后7天的使用次数
      */
      for (const [kw, kwObj] of Object.entries(this.all)) {
        let score = (kwObj.linkedCount * 10 + kwObj.linkedChars) / 2

        if (keyword.length > 0) {
          const pos = kw.indexOf(keyword)
          if (pos < 0) {
            continue
          } else {
            score +=
              (1 - pos / keyword.length) * 1000 +
              (1000 * keyword.length) / kw.length
          }
        }

        // 关键词若已创建了主题，权重 +30
        const topicItem = dbMemory.indexed.topic[kw]
        if (topicItem && counter) {
          score += 30
          score += counter.countDescendants(topicItem) * 10
        }

        // 关键词若创建了snippet 权重 + 30
        if (
          kw in dbMemory.indexed.SNIPPET
        ) {
          score += 30
        }

        // 按最后更新时间计算权重，7天内最近修改过的
        score += 24 * 10 - (time() - kwObj.lastTime) / 3600

        // 根据最近7天使用热度
        // score += kwObj.recent * 50;
        score += kwObj.heat * 20

        kwObj.score = Math.round(score)
        result.push(kwObj)
      }
      result.sort((a: any, b: any) => b.score - a.score)
      return result
    }

    indexAddLinked(kw: string, newItem: UnitPersist, oldItem?: UnitPersist) {
      if (isEmpty(kw) || !Item.isNormalStatus(newItem)) {
        return
      }
      const lower = trim(kw.toLowerCase())
      const kwInfo = this.all[lower] ?? this.add(kw)

      oldItem = oldItem ?? newItem

      if (kwInfo.firstTime > newItem.updated) {
        kwInfo.firstTime = newItem.updated
      }

      if (kwInfo.lastTime < newItem.updated) {
        kwInfo.lastTime = newItem.updated
      }

      if (newItem.ky in kwInfo.linked) {
        kwInfo.linkedChars =
          kwInfo.linkedChars -
          (Item.headString(oldItem) ?? '').length +
          (Item.headString(newItem) ?? '').length
      } else {
        kwInfo.linked[newItem.ky] = newItem
        kwInfo.linkedChars += (Item.headString(newItem) ?? '').length
        kwInfo.linkedCount++

        if (!isEmpty(newItem.updated)) {
          const gap = Math.round((time() - newItem.updated) / 60)
          const within = 24 * 60
          if (gap < within) {
            kwInfo.recent += 1
            kwInfo.heat += within - gap
          }
        }
      }
    }

    indexRemoveLinked(kw: string, item: UnitPersist) {
      if (isEmpty(kw)) {
        return
      }
      const lower = trim(kw.toLowerCase())
      const info = this.all[lower]
      if (info && info.linked[item.ky]) {
        info.linkedCount -= 1
        info.linkedChars -= Item.headString(item).length
        delete info.linked[item.ky]
        if (isEmpty(info.linked)) {
          delete this.all[lower]
        }
      }
    }

    extractKeywords(item: UnitPersist): string[] {
      const kwList: { [kw: string]: boolean } = {}
      if (!isEmpty(item.leaves)) {
        for (const leaf of item.leaves) {
          if (this.app.addons.bilink?.verify(leaf)) {
            const kw = $.bilink.string(leaf)
            kwList[kw] = true
            if (kw.includes('/')) {
              const splitKw = kw.split('/')
              for (const k of splitKw) {
                if (!IS_NUMBER.test(k)) {
                  kwList[k] = true
                }
              }
            }
          }
        }
      }
      return Object.keys(kwList)
    }



    watchItem(item: UnitPersist) {
      const { dbMemory } = this.app.addons
      const headString = Item.headString(item)
      if (item.isTopic) {
        this.indexAddLinked(headString, item)
        return
      }

      if (headString && headString.startsWith('```')) {
        return
      }

      const newKwList = this.extractKeywords(item)
      let oriItem: UnitPersist = dbMemory.nodes[item.ky]
      if ($.dbMemory.initFinished && !isEmpty(oriItem)) {
        const oriKwList = oriItem.mentions as string[]
        if (!Item.isNormalStatus(item)) {
          oriKwList?.forEach((kw) => this.indexRemoveLinked(kw, item))
          return
        }

        oriKwList?.forEach((kw) => {
          if (!isEmpty(kw) && !newKwList.includes(kw)) {
            this.indexRemoveLinked(kw, item)
          }
        })
      }

      // item.mentions = newKwList;
      newKwList?.forEach((kw) => this.indexAddLinked(kw, item, oriItem))
      const cleanNow = () => {
        if (newKwList.length < 1) {
          return
        }
        for (const [k, info] of Object.entries(this.all)) {
          if (
            item.ky in info.linked &&
            !newKwList.includes(k) &&
            Object.keys(info.linked).length === 1
          ) {
            this.indexRemoveLinked(k, item)
          }
        }
      };
      if($.dbMemory.initFinished) atLater(cleanNow, `clear-keyword-${item.ky}`, 5000)
    }

    addonBeforeRun() {
      const { keywords, dbMemory } = this.app.addons
      // Initialization for this Keywords

      before(dbMemory.addItem, (item) => {
        keywords.watchItem(item)
      })

      before(dbMemory.updateItem, (ky) => {
        const item = dbMemory.getItem(ky)
        keywords.watchItem(item)
      })
    }

    addonRun() {
      // after(this.app.addons.bilink.handleMentions, (item: UnitPersist) => {
      //   if (item.isTopic) {
      //     keywords.indexAddLinked(Item.headString(item), item);
      //     return;
      //   }
      //   if (Array.isArray(item.mentions)) {
      //     const newKwList = keywords.extractKeywords(item);
      //     newKwList.forEach(kw => {
      //       keywords.indexAddLinked(kw, item);
      //     });
      //   }
      // });
    }
  }

  return new Keywords()
}
