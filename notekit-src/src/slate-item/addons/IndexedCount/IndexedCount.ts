import { makeAutoObservable } from 'mobx'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { atLater } from '../../utils/atLater'
import { Indexkey } from '../DbMemory/DbMemory'
import { pub } from '@/slate-item/utils/pub'

/**
 * 索引计数器
 */
export function createIndexedCountAddon({ app, $ }: NewAddonParams) {
  class IndexedCount implements IAddon {
    app!: App
    config = {}

    counts: { [k in Indexkey]?: { [indexValue: string]: number } } = {
      // referText: {} as any,
      // referLinked: {} as any,
    }

    constructor() {
      makeAutoObservable(this)
    }

    addIndexKey(k: Indexkey) {
      if ($.dbMemory.indexes[k].unique) {
        throw new Error(
          `dbMemory.indexed[${k}] is not an array, so it should not be counted`
        )
      }
      this.counts[k] = {} as any
    }

    setCount(indexName: Indexkey, indexValue: string) {
      const items = Object.values(
        $.dbMemory.indexed[indexName]?.[indexValue] ?? {}
      )
      const count = items.filter((item) => Item.isNormalStatus(item)).length
      this.counts[indexName] ??= {}
      ;(this.counts[indexName] as any)[indexValue] = count
    }

    getCount(indexName: Indexkey, indexValue: string) {
      return this.counts[indexName]?.[indexValue] ?? 0
    }

    addonBeforeRun() {
      const { indexedCount, dbMemory } = this.app.addons

      let tmpCache: any = {}
      after(dbMemory.indexIt, (_, indexName, indexValue) => {
        if (indexName in this.counts === false) {
          return
        }
        if (dbMemory.initFinished) {
          atLater(
            () => {
              indexedCount.setCount(indexName, indexValue)
            },
            `${indexName}-${indexValue}`,
            10
          )
        } else {
          // 这里是初始化阶段
          if (tmpCache[indexValue] === undefined) tmpCache[indexValue] = [indexName]
          else tmpCache[indexValue].push(indexName)
        }
      })
      pub.once(pub.evt.dbMemoryInitialized, () => {
        for (const indexValue in tmpCache) {
          for (const indexName of tmpCache[indexValue]) {
            indexedCount.setCount(indexName, indexValue)
          }
        }
        tmpCache = null;
      })


      after(dbMemory.clearItemIndex, (_, item, indexes) => {
        const persistItem = this.app.addons.dbMemory.getItem(item.ky) as any
        if (Array.isArray(indexes)) {
          for (const indexName of indexes) {
            if (
              indexName in indexedCount.counts &&
              Array.isArray(persistItem[indexName])
            ) {
              persistItem[indexName].forEach((indexValue: any) => {
                indexedCount.setCount(indexName, indexValue)
              })
            }
          }
        }
      })
    }

    addonRun() {
      // Initialization for this IndexedCount
    }
  }

  return new IndexedCount()
}
