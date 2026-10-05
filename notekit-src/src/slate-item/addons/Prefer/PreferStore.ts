import { App } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { KyString, UnitPersist, UNIT_ROLE } from '../../interfaces/unit'
import { time } from '../../utils/date/time'
import { mkid } from '../../utils/string/mkid'
import { NoteDatabase } from '../DbDisk/NoteDatabase'
import { normalizeItem } from '../DbMemory/helper'
import { PreferPersist } from './Prefer'

export type PreferName = keyof AppConf

export class PreferStore {
  conn!: NoteDatabase
  planKy!: KyString
  items: { [ky: KyString]: PreferPersist } = {} as any
  app: App

  constructor(params: { conn: NoteDatabase; planKy: KyString; app: App }) {
    const { conn, planKy, app } = params
    this.conn = conn
    this.planKy = planKy
    this.app = app
  }

  getValues() {
    const values: AppConf = {} as any
    for (const k of Object.keys(this.items)) {
      ;(values as any)[k] = this.getValue(k as PreferName)
    }
    return values
  }

  getValue<T extends PreferName>(cfgItemName: T): AppConf[T] {
    return this.items[cfgItemName]?.value as any
  }

  setValue<T extends PreferName>(cfgItemName: T, value: AppConf[T]) {
    return this.setItem(cfgItemName, { value })
  }

  async setItem(cfgItemName: PreferName, values: Partial<UnitPersist>) {
    const item =
      this.items[cfgItemName] ??
      Item.newItem({
        ky: cfgItemName,
        pky: this.planKy,
        role: UNIT_ROLE.PREFER_ITEM,
        prky: `${cfgItemName}-${this.planKy}`,
      } as any)

    const newItem = {
      ...item,
      ...values,
      updated: time(),
    }

    this.items[cfgItemName] = newItem

    const result = await this.conn.prefer.put(
      normalizeItem(this.items[cfgItemName]) as PreferPersist
    )

    if ((await result) && this.app.isAddonEnabled('sync2')) {
      // this.app.addons.sync.addWaiting(newItem, this.conn.name);
      this.app.addons.sync2
        .getService(this.conn.name, 'prefer')
        ?.addPending(newItem)
    }

    return result
  }

  inject(preferItems: PreferPersist[]) {
    let isPlanExists = false
    for (const cf of preferItems) {
      if (cf.pky === this.planKy && cf.role === UNIT_ROLE.PREFER_ITEM) {
        this.items[cf.ky] = cf
      } else if (cf.ky === this.planKy && cf.role === UNIT_ROLE.PREFER_PLAN) {
        isPlanExists = true
      }
    }
    return isPlanExists
  }
}
