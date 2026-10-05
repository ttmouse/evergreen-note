/* eslint-disable @typescript-eslint/no-this-alias */
import { deepClone } from '@/slate-item/utils/object/deepClone'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { Item } from '../../interfaces/item'
import {
  KyItem,
  KyString,
  TimeMilliSecond,
  TimeSecond,
  UnitCrumbs,
  UNIT_STATUS,
} from '../../interfaces/unit'
import { atLater } from '../../utils/atLater'
import { time } from '../../utils/date/time'
import { isEmpty } from '../../utils/isEmpty'
import { deepEqual } from '../../utils/object/deepEqual'
import { pub } from '../../utils/pub'
import { KYS, mkid } from '../../utils/string/mkid'
import { trim } from '../../utils/string/trim'
import { trimSharp } from '../Tag/helper'
import { LogicString } from '../Traits/Logic'
import { normalizeItem } from './helper'
import { ContextLayoutProps } from '@/slate-item/components'
import { ItemWithReminder } from '../DateTool/Reminder/Reminder'

export const SYM_OWNER = Symbol('owner')
export const SYM_REFER = Symbol('refer')

export type ItemMap = {
  [k: KyString]: UnitPersist
}

export type ItemReadingProps = {
  isRecur?: boolean
  skipFoldup?: boolean
  isSort?: boolean
  maxDepth?: number
}

interface MMIndexed {
  asky: ItemMap
  pky: { [pky: KyString]: ItemMap }
  topic: { [topic: string]: UnitPersist }
  mentions: { [topic: string]: ItemMap }
  tags: { [tag: string]: ItemMap }
  referLinked: { [referLinked: string]: ItemMap }
  path: { [pky: KyString]: ItemMap }
  referText: { [ky: KyString]: ItemMap }
  referBlock: { [ky: KyString]: ItemMap }
  referSnippet: { [ky: KyString]: ItemMap }
  SNIPPET: { [cond: LogicString]: UnitPersist }
}

/**
 * 所有用到的索引
 */
declare global {
  interface MemoryIndexed extends MMIndexed {}
}

declare global {
  interface SaveItemOptions {
    shouldVerify?: boolean
    shouldSaveToDatabase?: boolean
    by?: IAddon
    isRecur?: boolean
    saveTime?: TimeSecond
  }
}

export type Indexkey = keyof MemoryIndexed

/**
 * 定义索引的模型
 */
export type MemoryIndexSchema = {
  unique: boolean
  cond?: (item: UnitPersist) => boolean
  affect?: Indexkey
  delayed?: boolean
  indexVal?: (item: UnitPersist) => unknown | void
}

const SNIPPET_REG = /\{\{snippet/i

export class DbMemory implements IAddon {
  app!: App
  config = {}

  indexes!: { [k in keyof MMIndexed]: MemoryIndexSchema }
  uniqueIndexes!: Indexkey[]
  indexed!: MemoryIndexed
  indexedReal!: MemoryIndexed
  nodes!: ItemMap
  imported!: boolean
  initFinished!: boolean
  lastId!: number

  get list(): UnitPersist[] {
    return Object.values(this.nodes)
  }

  constructor() {
    this.makeInstance()
  }

  makeInstance() {
    const dbm = this
    this.nodes = new Proxy<ItemMap>(
      {},
      {
        set(allNodes, ky, item, receiver) {
          return Reflect.set(allNodes, ky, item, receiver)
        },

        has(target, ky: string) {
          const has = Reflect.has(target, ky)
          if (!has) {
            return !isEmpty(dbm.getItem(ky))
          }
          return has
        },
      }
    )

    this.indexes = {
      asky: { unique: true },
      pky: { unique: false, affect: 'path' },
      topic: { unique: true },
      mentions: {
        unique: false,
        indexVal(item) {
          if (Array.isArray(item.mentions)) {
            return item.mentions.map((m) => trim(m.toLocaleLowerCase()))
          }
        },
      },
      referText: { unique: false },
      referBlock: { unique: false },
      referSnippet: { unique: false },
      SNIPPET: {
        unique: true,
        cond(item: UnitPersist) {
          return Boolean(typeof item.SNIPPET !== 'undefined')
        },
      },
      path: { unique: false },

      // 以下为已延迟的 Index
      tags: {
        unique: false,
        indexVal(item) {
          if (Array.isArray(item.tags)) {
            return item.tags.map((tag) => trimSharp(tag))
          }
        },
        delayed: true,
      },
      referLinked: { unique: false, delayed: true },
    }

    this.uniqueIndexes = []

    this.indexedReal = new Proxy<MemoryIndexed>({} as MemoryIndexed, {
      get(target, type: Indexkey) {
        target[type as Indexkey] ??= new Proxy(
          {},
          {
            set(obj, key, val, receiver) {
              const result = Reflect.set(obj, key, val, receiver)
              if (that.initFinished)
                pub.emit(pub.evt.dbIndexChanged, {
                  indexName: type as any,
                  indexValue: key as string,
                  item: val,
                })
              return result
            },

            deleteProperty(obj, key) {
              const deletedItem = (obj as any)[key]
              const result = Reflect.deleteProperty(obj, key)
              if (that.initFinished)
                pub.emit(pub.evt.dbIndexChanged, {
                  indexName: type as any,
                  indexValue: key as string,
                  item: deletedItem,
                })
              return result
            },
          }
        )
        return target[type as Indexkey]
      },
    }) as MemoryIndexed

    const that = this

    this.indexed = new Proxy<MemoryIndexed>(this.indexedReal, {
      get(target, type: Indexkey) {
        if (that.indexedTypes.includes(type)) {
          return target[type] || {}
        } else {
          that.delayedIndex(type)
          return target[type] || {}
        }
      },
    })
    this.nodes = {} as ItemMap

    this.imported = false
    this.initFinished = false
    this.lastId = 1
  }

  addItem(item: UnitPersist) {
    // Legacy SQLite roots omit pky. Keep the persisted row intact while
    // supplying the root marker required by the editor's item model.
    if (typeof item.ky === 'string' && !('pky' in item)) {
      item = { ...item, pky: '-' }
    }
    if (!Item.isNormalStatus(item)) {
      return false
    }

    if (isEmpty(item.ori) && isEmpty(item.pky)) {
      return false
    }

    if (!isEmpty(item.topic)) {
      item.isTopic = true
    }

    if (
      (!isEmpty(item.isTopic) && !isEmpty(Item.headString(item))) ||
      !isEmpty(item.topic)
    ) {
      if (item.topic) {
        item.topic = item.topic.toLowerCase()
      }
    }

    if ('subitems' in item) {
      delete (item as any).subitems
    }

    if (item.pky === '~') {
      item.pky = '-'
    }

    const original = this.nodes[item.ky]
    if (original)
      this.clearItemIndex(original, Object.keys(this.indexes) as Indexkey[])
    ;(this.nodes as any)[item.ky] = item
    return true
  }

  syncAddItem(niceItem: UnitPersist) {
    const freshAdd = !(niceItem.ky in this.nodes)
    if (!freshAdd) {
      if (!Item.isNormalStatus(niceItem)) {
        delete this.nodes[niceItem.ky]
      } else {
        this.updateItem(niceItem.ky, niceItem, true)
      }
    } else {
      this.addItem(niceItem)
    }
    if (isEmpty(niceItem.$dbid)) {
      niceItem.$dbid = this.app.addons.libAdmin.current.ky
    }
    this.handle(this.nodes[niceItem.ky] || niceItem)

    if (niceItem.status === UNIT_STATUS.TRASH) {
      this.clearItemIndex(
        this.nodes[niceItem.ky] || niceItem,
        Object.keys(this.indexes) as Indexkey[]
      )
    }
  }

  handleIndex(item: UnitPersist, indexList: Indexkey[]) {
    if (!indexList) {
      indexList = Object.keys(this.indexes) as Indexkey[]
    }
    ;(item as any)[SYM_REFER] = {}

    for (const indexName of indexList) {
      let val = (item as any)[indexName] // index值
      const idx = (this.indexes as any)[indexName] // 一种index规则

      if (typeof idx.indexVal === 'function') {
        // 尝试补齐index值
        val = idx.indexVal?.(item)
      }

      // index值为空，跳过
      if (isEmpty(val)) {
        if (indexName === 'SNIPPET') {
          val = `#${item.ky}`
        } else {
          continue
        }
      }

      // 索引
      if (idx.unique === true && typeof val === 'string') {
        const existing = this.indexedReal[indexName][val] as UnitPersist | undefined
        // A unique index must always contain an item, never a map of items.
        // Prefer the original topic to later automatically generated copies.
        if (existing && existing.ky !== item.ky) {
          if (indexName !== 'topic') continue
          const oldCreated = existing.created ?? Number.MAX_SAFE_INTEGER
          const newCreated = item.created ?? Number.MAX_SAFE_INTEGER
          if (oldCreated < newCreated ||
              (oldCreated === newCreated && existing.ky < item.ky)) continue
        }
        if ('cond' in idx === false || (idx as any).cond(item, val)) {
          this.indexIt(indexName, val, item, true)
          ;(item as any)[SYM_REFER][indexName] = item
        }
      } else if (Array.isArray(val)) {
        for (const indexValue of val as any) {
          if ('cond' in idx === false || (idx as any).cond(item, indexValue)) {
            this.indexIt(indexName, indexValue, item)
            const joinIndexName = `${indexName}:${indexValue}`
            ;(item as any)[SYM_REFER][joinIndexName] =
              this.indexedReal[indexName][indexValue]
          }
        }
      } else {
        this.indexedReal[indexName][val as Indexkey] =
          this.indexedReal[indexName][val as Indexkey] || {}
        if (this.indexedReal[indexName][val as Indexkey] !== item) {
          this.indexIt(indexName, val, item)
        }
        ;(item as any)[SYM_REFER][indexName] =
          this.indexedReal[indexName][val as Indexkey]
      }

      // 处理当前索引会影响的其他索引
      const { affect } = idx as any
      if (
        this.initFinished &&
        !isEmpty(affect) &&
        indexList.includes(affect) === false
      ) {
        this.handleIndex(item, [affect])
      }
    }
  }

  imports(list: UnitPersist[], dbid?: string) {
    for (const item of list) {
      if (dbid) {
        item.$dbid ??= dbid
      }
      this.addItem(item)
    }
    this.imported = true
  }

  /**
   * 读取单个 item
   * @param ky item 的 ID
   * @param options
   * @returns
   */
  getItem(ky: KyItem, options: ItemReadingProps = {}): UnitPersist {
    const { isRecur = false } = options
    let data = ky as UnitPersist
    if (typeof ky === 'string') {
      data = { ...((this.nodes as any)[ky] || {}) }
      if (isEmpty(data)) {
        data = {} as any
        for (const indexName of this.uniqueIndexes) {
          if (ky in this.indexed[indexName] && indexName !== 'topic') {
            data = { ...Object.values(this.indexed[indexName][ky])[0] }
            break
          }
        }
      }
    }
    if (isRecur) {
      if (!isEmpty(data)) {
        const subitems = this.getSubitems(data.ky, options, 1)
        if (!isEmpty(subitems)) {
          data.subitems = subitems
        }
      }
    }
    return data
  }

  itemExist(ky: KyString): boolean {
    return ky in this.nodes
  }

  keyHasValue(keyType: Indexkey, keyVal: string): boolean {
    return (this.indexed as any)?.[keyType]?.[keyVal]
  }

  /**
   * 根据索引值读取所有的 item
   * @param keyType
   * @param keyVal
   * @returns
   */
  getItemsByIndex(keyType: Indexkey, keyVal: string): UnitPersist[] {
    const items = (this.indexed as any)?.[keyType]?.[keyVal]
    return items ? Object.values(items) : []
  }

  hasSubitems(ky: KyString): boolean {
    return !isEmpty(this.indexed.pky[ky])
  }

  /**
   * 读取下级节点
   */
  getSubitems(
    ky: KyString,
    options: ItemReadingProps = {},
    depth = 1
  ): UnitPersist[] {
    const {
      isRecur = false,
      isSort = true,
      skipFoldup = false,
      maxDepth = Infinity,
    } = options

    if (depth > maxDepth) return []

    if (ky in this.indexed.asky) {
      const node = this.getItem(ky)
      ky = node.ky
    }

    const subitems = this.indexed.pky[ky] || {}
    let list = Object.values(subitems) as UnitPersist[]

    if (Array.isArray(list)) {
      if (isSort) {
        list.sort((a, b) => {
          const aw = a.weight || 0
          const bw = b.weight || 0
          return aw - bw
        })
      }
    } else {
      list = []
    }

    // 临时的解决方案
    const result: UnitPersist[] = []
    for (const item of list) {
      if (
        item.pky !== ky ||
        item.pky === item.ky ||
        !Item.isNormalStatus(item)
      ) {
        continue
      }
      const value = { ...item } as UnitPersist
      if (
        !skipFoldup &&
        ky !== item.ky &&
        !isEmpty(this.indexed.pky[item.ky]) &&
        isRecur
      ) {
        value.subitems = this.getSubitems(
          value.ky,
          { isRecur: true },
          depth + 1
        )
      }
      result.push(value)
    }

    return result
  }

  getMaxWeightOfSubitems(ky: KyString): number {
    const items = this.getSubitems(ky)
    let weight = 0
    for (const item of items) {
      if (item.weight && item.weight > weight) {
        weight = item.weight
      }
    }
    return weight
  }

  getParentItems(ky: KyString, maxDepth = 100) {
    const parents: UnitPersist[] = []
    let item = this.getItem(ky)
    let i = 0
    while (item && i <= maxDepth) {
      i++
      item = this.getItem(item.pky)
      if (!isEmpty(item)) {
        parents.unshift(item)
      }
    }
    return parents
  }

  /**
   * 爬虫式检索
   */
  crawl(ky: KyString | UnitPersist, depth = 3) {
    let indexItem = ky as any
    let list: ItemMap = {} as any
    if (typeof ky === 'string') {
      indexItem = this.getItem(ky)
    }

    if (!indexItem) {
      return {}
    }

    list[indexItem.ky] = indexItem

    const entryItem = this.getItem(indexItem.ky, { isRecur: true })

    const recur = (items: UnitPersist[]) => {
      for (const one of items) {
        list[one.ky] = one
        if (!isEmpty(one.subitems)) {
          recur(one.subitems as UnitPersist[])
        }
        if (!isEmpty(one.referText) && depth > 1) {
          for (const rky of (one as any).referText) {
            list = { ...list, ...this.crawl(rky, depth - 1) }
          }
        }
        if (!isEmpty(one.referBlock) && depth > 1) {
          for (const rky of (one as any).referBlock) {
            list = { ...list, ...this.crawl(rky, depth - 1) }
          }
        }
        if (!isEmpty(one.mentions) && depth > 1) {
          for (const m of (one as any).mentions) {
            const theItem = this.getTopic(m)
            if (theItem) {
              list = { ...list, ...this.crawl(theItem, depth - 1) }
            }
          }
        }
      }
    }
    recur([entryItem])
    return list
  }

  /**
   * 根据主题的标题读取 item
   * @param topic 主题的标题
   * @returns
   */
  getTopic(topic: string): UnitPersist | null {
    if (isEmpty(topic)) {
      return null
    }
    const lowerTopic = topic.toLowerCase()
    const topicData = this.indexed.topic[lowerTopic]
    if (!topicData) {
      return null
    }
    return topicData
  }

  /**
   * 对某个 item 建立索引
   */
  indexIt(
    indexName: Indexkey,
    indexValue: string,
    item: UnitPersist,
    unique = false
  ) {
    this.indexedReal[indexName][indexValue] ??= {}
    if (unique) {
      this.indexedReal[indexName][indexValue] = item
    } else {
      ;(this.indexedReal[indexName][indexValue] as any)[item.ky] = item
      // Non-unique buckets are plain objects: their nested writes bypass the
      // index Proxy. Emit after insertion so reference consumers see additions.
      if (this.initFinished) {
        pub.emit(pub.evt.dbIndexChanged, {
          indexName: indexName as any,
          indexValue,
          item,
        })
      }
    }
  }

  /**
   * 将一个 item 的索引信息清除掉
   */
  clearItemIndex(item: UnitPersist, indexes?: Indexkey[]) {
    if (isEmpty((item as any)[SYM_REFER]) || isEmpty(item)) {
      return
    }
    indexes = indexes || (Object.keys(this.indexes) as Indexkey[])
    for (const indexName of indexes) {
      const val = (item as any)[indexName]
      if (
        (this.indexes as any)[indexName].unique &&
        typeof (this.indexedReal[indexName] as any)[val as any] === 'object'
      ) {
        // Editing a duplicate must not remove another item's canonical index.
        if ((this.indexedReal[indexName] as any)[val]?.ky !== item.ky) continue
        delete this.indexedReal[indexName][val as string]
        ;(item as any)[SYM_REFER][indexName] = null
      } else if (Array.isArray(val)) {
        const indexValFn = (this.indexes as any)[indexName]?.indexVal
        const normalizedVals =
          typeof indexValFn === 'function' ? indexValFn(item) : val
        for (let i = 0; i < (val as any[]).length; i++) {
          const idxVal: string = normalizedVals?.[i] ?? (val as any[])[i]
          if (this.indexedReal[indexName][idxVal] as any) {
            const deletedFromIndex = (
              this.indexedReal[indexName][idxVal] as any
            )[item.ky]
            ;(this.indexedReal[indexName][idxVal] as any)[item.ky] = undefined
            delete (this.indexedReal[indexName][idxVal] as any)[item.ky]
            if (this.initFinished && deletedFromIndex !== undefined) {
              pub.emit(pub.evt.dbIndexChanged, {
                indexName: indexName as any,
                indexValue: idxVal as string,
                item: deletedFromIndex,
              })
            }
          }

          ;(item as any)[SYM_REFER][`${indexName}:${idxVal}`] = null
        }
      } else {
        const referObject = (item as any)[SYM_REFER][indexName]
        if (!isEmpty(referObject)) {
          const deletedFromIndex = referObject[item.ky]
          delete referObject[item.ky]
          if (this.initFinished && deletedFromIndex !== undefined) {
            pub.emit(pub.evt.dbIndexChanged, {
              indexName: indexName as any,
              indexValue: (item as any)[indexName] as string,
              item: deletedFromIndex,
            })
          }
        }
        ;(item as any)[SYM_REFER][indexName] = null
      }
    }
  }

  deleteItem(ky: KyString, options: { isRecur: boolean } = {} as any) {
    if (!this.canSave()) {
      alert('cannotsave!!')
      return false
    }
    const { isRecur = false } = options
    if (ky in this.nodes) {
      if (isRecur) {
        for (const subitem of this.getSubitems(ky)) {
          this.deleteItem(subitem.ky, { isRecur: true })
        }
      }
      const item = this.nodes[ky]
      item.status = UNIT_STATUS.TRASH
      this.saveItem(item)
    }
    return ky in this.nodes
  }

  liveDeleteOne(ky: KyString) {
    if (!(ky in this.nodes)) return false
    this.clearItemIndex(this.nodes[ky], Object.keys(this.indexes) as Indexkey[])
    delete this.nodes[ky]
    return true
  }

  /**
   * 更新一个 item 的部分字段数据
   */
  updateItem(ky: KyString, values: Partial<UnitPersist>, fullData = false) {
    if (!this.canSave()) {
      return
    }
    let changedKeys: (keyof UnitPersist)[] = []
    const oriItem = this.nodes[ky]
    if (values.pky && oriItem.pky !== values.pky) {
      if (
        oriItem &&
        oriItem.pky &&
        this.indexed.pky[oriItem.pky] &&
        this.indexed.pky[oriItem.pky][oriItem.ky]
      ) {
        delete this.indexed.pky[oriItem.pky][oriItem.ky]
      }
      if (values.pky) {
        if (!this.indexed.pky[values.pky]) {
          this.indexed.pky[values.pky] = {}
        }
        this.indexed.pky[values.pky][oriItem.ky] = oriItem
      } else {
        throw new Error(`pky is required for ${ky}`)
      }
    }
    for (const [k, v] of Object.entries(values)) {
      if (deepEqual(v, (oriItem as any)[k])) {
        continue
      }
      changedKeys.push(k as keyof UnitPersist)
    }
    if (fullData) {
      for (const key of Object.keys(oriItem)) {
        if (!(key in values)) {
          changedKeys.push(key as keyof UnitPersist)
        }
      }
    }

    changedKeys = changedKeys.filter((e) => !e.startsWith('$'))
    const changedIndexes: Indexkey[] = changedKeys.filter((e) =>
      this.indexedTypes.includes(e as Indexkey)
    ) as Indexkey[]

    if (!isEmpty(changedIndexes)) {
      this.clearItemIndex(oriItem, changedIndexes)
    }

    if (!isEmpty(values)) {
      for (const changedKey of changedKeys) {
        if (!changedKey.startsWith('$')) {
          if (changedKey in values)
            (oriItem as any)[changedKey] = values[changedKey]
          else delete (oriItem as any)[changedKey]
        }
      }
    }

    if (!isEmpty(changedIndexes)) {
      this.handleIndex(oriItem, changedIndexes)
    }
    return changedKeys
  }

  /**
   * 根据 item 的父级 ID 建立面包悄(节点路径)
   */
  handlePath(item: UnitPersist) {
    let { pky } = item
    const path: KyString[] = []
    const cky: any = {}
    while (!isEmpty(pky) && !isEmpty(this.nodes[pky])) {
      const parentItem = this.nodes[pky]
      path.unshift(parentItem.ky)

      // 防止死循环
      if (parentItem.ky in cky) {
        break
      }
      if (path.length > 20) {
        break
      }

      cky[parentItem.ky] = true

      if (!isEmpty(parentItem.topic)) {
        ;(item as any)[SYM_OWNER] = parentItem
      }
      if (pky === parentItem.pky) {
        break
      }
      pky = parentItem.pky
    }
    item.path = path
    return item.path
  }

  handleTopicMentions(item: UnitPersist) {
    const topicItem = { ...(item as any)[SYM_OWNER] }
    if (
      isEmpty(topicItem) ||
      isEmpty(topicItem.topic) ||
      topicItem.ky in this.indexed.path === false
    ) {
      return []
    }
    const mentions: string[] = []
    for (const [ky, theItem] of Object.entries(
      this.indexed.path[topicItem.ky]
    )) {
      if (ky === topicItem.ky) {
        continue
      }

      const m = theItem.mentions || []
      mentions.push(...m.map(trim))
    }
    topicItem.referLinked = Array.from(new Set(mentions))
    this.handleIndex(topicItem, ['referLinked'])
  }

  verifyItem(item: UnitPersist) {
    if (isEmpty(item)) {
      throw new Error('item is empty')
    }
    if (
      isEmpty(item.ky) ||
      ([KYS.UNKNOWN as string].includes(item.ky) === false &&
        item.ky.length < 2)
    ) {
      throw new Error(`ky is required for ${JSON.stringify(item)}`)
    }

    if (item.pky === item.ky) {
      throw new Error("An item's pky can not be its ky")
    }

    if (
      [KYS.UNKNOWN, KYS.ROOT, 'root'].includes(item.pky) === false &&
      item.pky in this.nodes === false
    ) {
      console.error(item)
      throw new Error(`The above item's parent [${item.pky}] does not exist`)
    }

    if (typeof item.weight !== 'number' && !item.topic) {
      throw new Error(`weight is required for ${item.ky}`)
    }
  }

  lockSaving: number = 0
  canSave() {
    return this.lockSaving === 0
  }

  /**
   * 保存 item
   */
  saveItem<T extends UnitPersist>(item: T, options?: SaveItemOptions) {
    if (!this.canSave()) {
      return this.getItem(item.ky)
    }
    let freshAdd = false
    let hasChanged = false

    const {
      shouldVerify = true,
      shouldSaveToDatabase = true,
      isRecur = false,
      saveTime = time(),
    } = options ?? {}
    if (shouldVerify) {
      try {
        this.verifyItem(item)
        this.handlePath(item)
      } catch (e) {
        console.error(e)
      }
    }

    const niceItem = normalizeItem(item)
    const oldItem = deepClone(this.nodes[niceItem.ky] ?? '')

    if (oldItem) {
      if (niceItem.pky !== this.nodes[niceItem.ky]?.pky) {
        const newParentItem = this.nodes[niceItem.pky]
        if (newParentItem?.path?.includes(niceItem.ky)) {
          throw new Error("An item's parent can not be its child")
        }
      }
      if (!Item.isNormalStatus(niceItem)) {
        delete this.nodes[niceItem.ky]
        hasChanged = true
      } else {
        const changedKeys = this.updateItem(niceItem.ky, niceItem, true)
        hasChanged = !isEmpty(changedKeys)
      }
    } else {
      freshAdd = true
      hasChanged = true
      this.addItem(niceItem)
    }

    if (!hasChanged && !isRecur) return

    if (isEmpty(niceItem.$dbid)) {
      niceItem.$dbid = this.app.addons.libAdmin.current.ky
    }

    this.handle(this.nodes[niceItem.ky] || niceItem)

    // 持久化保存到硬盘
    const dbid = niceItem.$dbid as string
    const persistItem = niceItem
    persistItem.created ??= saveTime
    persistItem.updated = saveTime

    if (niceItem.status === UNIT_STATUS.TRASH) {
      this.clearItemIndex(
        this.nodes[niceItem.ky] || niceItem,
        Object.keys(this.indexes) as Indexkey[]
      )
    }

    if (shouldSaveToDatabase) {
      atLater(
        () => {
          this.app.addons.dbDisk.save(persistItem, dbid)
        },
        `save-item-${persistItem.ky}`,
        100
      )
    }

    if (isRecur && Array.isArray(item.subitems)) {
      item.subitems.forEach((subitem) => {
        this.saveItem({ pky: item.ky, ...subitem } as T, options)
      })
    }

    pub.emit(pub.evt.itemChanged, {
      originalData: oldItem,
      newer: persistItem,
      freshAdd,
      sourceId: (item as any)?.$id,
    })

    return persistItem
  }

  withoutSaving(callback: () => void) {
    this.lockSaving++
    try {
      callback()
    } catch (e) {
      console.error(e)
    }
    this.lockSaving--
  }

  /**
   * 检查某个 item 是不是孤儿节点
   */
  isOrphan(item: UnitPersist) {
    return (
      isEmpty(item.pky) ||
      item.pky === item.ky ||
      item.path.find((ky) => ky in this.nodes === false)
    )
  }

  indexedTypes: Indexkey[] = []

  handle(item: UnitPersist) {
    // 以下语句，不要轻易调换位置，会影响数据的处理
    this.handlePath(item)
    this.handleIndex(item, this.indexedTypes as Indexkey[])
  }

  delayedIndex(indexName: Indexkey, list?: UnitPersist[]) {
    if (this.indexedTypes.includes(indexName)) return
    list = list || Object.values(this.nodes)
    list.forEach((item) => {
      if (indexName === 'referLinked') this.handleTopicMentions(item)
      else this.handleIndex(item, [indexName])
    })
    this.indexedTypes.push(indexName)
  }

  init(list?: UnitPersist[]) {
    list = list || Object.values(this.nodes)
    list.forEach((item) => {
      this.handle(item)
    })
    this.initFinished = true
    pub.emit(pub.evt.dbMemoryInitialized)
  }

  prepareData() {
    return this.app.addons.dbDisk.getItemsFromConnections()
  }

  prepareIndexed() {
    for (const [k, info] of Object.entries(this.indexes)) {
      if (info.unique) {
        this.uniqueIndexes.push(k as Indexkey)
      }
    }
  }

  async ready() {
    this.prepareIndexed()
    const allItems = await this.prepareData() // 679 ms used for sync
    if (!isEmpty(allItems)) {
      this.indexedTypes = (Object.keys(this.indexes) as Indexkey[]).filter(
        (k) => {
          return !(this.indexes as any)[k]?.delayed
        }
      )
      for (const [dbid, list] of Object.entries(allItems)) {
        this.imports(list, dbid) // 加一个 await 方便其他插件的异步操作
      }

      this.init()
    } else {
      console.error("Can't find any items from the database(s)")
    }
  }

  addonRun() {}
}

export function createDbMemoryAddon({ app, $ }: NewAddonParams) {
  return new DbMemory()
}
