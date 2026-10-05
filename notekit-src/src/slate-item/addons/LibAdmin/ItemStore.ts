import { LibraryPersist } from './LibAdmin'
import { makeAutoObservable } from 'mobx'
import { NoteDatabase } from '../DbDisk/NoteDatabase'
import { KyString, UNIT_STATUS } from '../../interfaces/unit'
import { deepClone } from '../../utils/object/deepClone'
import { Item } from '../../interfaces/item'
import { time } from '../../utils/date/time'
import { Table } from 'dexie'
import { MEMBER_ID } from '../../constants'
import { $$ } from '../../utils/lang'
import { App } from '../../engine/App'

export class ItemStore<T extends UnitPersist> {
  items: { [ky: KyString]: T } = {}
  table: string
  dbTable!: Table<any>
  conn!: NoteDatabase
  _filter: (item: T) => boolean = () => true
  _save!: (item: T) => any
  app: App

  constructor(params: {
    conn: NoteDatabase
    filter?: (item: T) => boolean
    save?: (item: T) => any
    table?: string
    app: App
  }) {
    const { conn, filter, save, table = 'node', app } = params
    this.table = table
    this.conn = conn
    this.dbTable = (this.conn as any)[this.table] as Table<any>
    this.app = app
    if (filter) {
      this._filter = filter
    }
    if (save) {
      this._save = save
    }
    this.load()
    makeAutoObservable(this)
  }

  setItems(list: T[]) {
    for (const item of list) {
      if (Item.isNormalStatus(item) && this._filter(item)) {
        this.items[item.ky] = item
      }
    }
  }

  get(ky: KyString): T | null {
    return this.items[ky] || null
  }

  getList() {
    return Object.values(this.items)
      .filter(
        (item) =>
          Item.isNormalStatus(item) &&
          this._filter(item) &&
          item.ky !== this.conn.name &&
          (item.ky !== 'docs' || MEMBER_ID === 521183)
      )
      .sort((a, b) => {
        const t1 = a.created ?? 1
        const t2 = b.created ?? 1
        return t1 - t2
      })
  }

  async update(ky: KyString, info: Partial<T>) {
    let lib = this.get(ky)
    if (lib) {
      lib = { ...lib, ...info }
      return this.save(lib)
    }
    return null
  }

  async save(info: T) {
    const newItem = {
      ...info,
      updated: time(),
    }
    this.items[info.ky] = newItem
    let result: any
    if (this._save) {
      result = this._save(this.items[info.ky])
    }
    result = this.dbTable.put(deepClone(this.items[info.ky]))
    if ((await result) && this.app.isAddonEnabled('sync2')) {
      // this.app.addons.sync.addWaiting(newItem, this.conn.name);
      this.app.addons.sync2
        .getService(this.conn.name, this.dbTable.name as any)
        ?.addPending(newItem)
    }
    return Boolean(result)
  }

  async delete(ky: KyString) {
    const item = this.get(ky)
    if (item) {
      this.save({
        ...item,
        status: UNIT_STATUS.TRASH,
      })
      delete this.items[ky]
      this.dbTable.where({ pky: item.ky }).modify({ status: UNIT_STATUS.TRASH })
    }
  }

  async load() {
    const list = await this.dbTable.toArray()
    // if (this.app.isAddonEnabled('sync2')) {
    //   this.app.addons.sync2
    //     .getService(this.conn.name, this.dbTable.name)
    //     ?.merge(list);
    // }
    this.setItems(list as any)
  }
}
