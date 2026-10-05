import { TRANSFER_BATCH_SIZE } from '@/slate-item/constants'
import { App } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { atLater } from '../../utils/atLater'
import { time } from '../../utils/date/time'
import { isEmpty } from '../../utils/isEmpty'
import { showSnack } from '../../utils/msg/showSnack'
import { until } from '../../utils/until'
import { ItemMap } from '../DbMemory/DbMemory'
import { diffItems, getSyncStatus, setSyncStatus } from './helper'

type SyncResponse = {
  saved: { [ky: KyString]: 'success' | 'fail' }
  result: boolean
  error: string
  msg: string
}

type CloudRow = { id: number; data: UnitPersist }

function priKey(item: UnitPersist): KyString {
  if ('prky' in item) {
    return item.prky as KyString
  }
  return item.ky
}

export type SyncServiceOptions = {
  dbid: string
  tbName: string
  app: App
}


export class SyncService {
  dbid!: string
  tbName = 'node'
  app!: App

  pending: ItemMap = {}
  primaryKeyName = 'ky'
  
  // 防止当时正在传输，传输完上一个版本下一个版本没有传输
  transferring = false
  pending2: ItemMap = {}

  constructor(options: SyncServiceOptions) {
    Object.assign(this, options)
    this.primaryKeyName = (this.app.addons.dbDisk.connections as any)[
      this.dbid
    ][this.tbName].schema.primKey.name
  }

  async addPending(item: UnitPersist) {
    if (this.app.addons.dbDisk.storageMode === 'sqlite') { setSyncStatus('done'); return }
    if (isEmpty(item)) {
      return
    }
    if (isEmpty(item.ky) || /(data:\s*image\/(\w+);base64,)/i.test(Item.headString(item))) return;
    const prky = priKey(item)
    this.pending2[prky] = item
    await until(()=>!this.transferring)
    atLater(
      () => {
        for (const [k, v] of Object.entries(this.pending2)) {
          this.pending[k] = v
          delete this.pending2[k]
        }
        setSyncStatus('todo')
        this.transfer()
      },
      'sync-service-transfer',
      3000
    )
  }

  /**
   * Sync items between browser and server
   */
  async transfer() {
    if (isEmpty(this.pending)) {
      return
    }

    const slicePending = this.normalize(
      Object.values(this.pending).sort((a, b) => a.updated - b.updated).slice(0, TRANSFER_BATCH_SIZE)
    )

    setSyncStatus('up')
    this.transferring = true
    const res: SyncResponse = await this.app.addons.http.post(
      '/api/handle-sync2',
      {
        storename: this.tbName,
        pk: this.primaryKeyName,
        uploadList: JSON.stringify(slicePending),
        dbname: this.dbid,
      }
    )

    if (res.error) {
      showSnack({
        content: `Sync error: ${res.error}`,
        severity: 'error',
      })
      setSyncStatus('fail')
      this.transferring = false
      if (this.app.addons.sync2?.handleSyncError) {
        this.app.addons.sync2.handleSyncError()
      }
      return
    }

    let maxUpdated = 0;

    if (!isEmpty(res?.saved)) {
      for (const [k, status] of Object.entries(res.saved)) {
        if (isEmpty(k) || isEmpty(this.pending[k])) {
          continue
        }
        if (status === 'success' && this.pending[k].status === -2) {
          try {
            const db = await this.app.addons.dbDisk.open(this.dbid);
            (db as any)[this.tbName].delete(this.pending[k].ky);
          } catch(e) {
            console.error(e);
          }
        }
        maxUpdated = Math.max(maxUpdated, this.pending[k].updated)
        delete this.pending[k]
      }
    }
    if (!isEmpty(this.pending)) {
      setTimeout(() => this.transfer(), 100)
    } else {
      const lastUploadTime = localStorage.getItem(`${this.dbid}-lastUploadTime`);
      if ((!lastUploadTime) || maxUpdated > parseInt(lastUploadTime)) {
        localStorage.setItem(`${this.dbid}-lastUploadTime`, maxUpdated.toFixed(0));
      } // lastUploadTime 存的是我传到服务器的节点最新新到什么程度
      setSyncStatus('done');
      if (this.app.addons.sync2) {
        ;this.app.addons.sync2.syncErrorCount = 0;
      }
      this.transferring = false;
    }
  }

  normalize(list: UnitPersist[]) {
    list = list.filter(
      (item) =>
        !isEmpty(item.ky) &&
        /(data:\s*image\/(\w+);base64,)/i.test(Item.headString(item)) === false
    )

    const items = list.map((data) => {
      const willReturn = {}
      for (const [k, v] of Object.entries(data)) {
        if (
          (!isEmpty(v) && typeof v === 'object' && 'ky' in v) ||
          // || isEmpty(data.ori) && isEmpty(data.pky)
          /(data:\s*image\/(\w+);base64,)/i.test(data.ori)
        ) {
          delete this.pending[data.ky]
          continue
        }
        if ('child' in data) {
          delete (data as any).child
        }
        if (
          k.startsWith('$') ||
          k.includes('.') ||
          ['ver', 'text', 'crumbs'].includes(k) ||
          (['foldup'].includes(k) && !v) ||
          (isEmpty(v) &&
            [
              'referText',
              'referBlock',
              '__v',
              'asky',
              'path',
              'mentions',
            ].includes(k))
        ) {
          continue
        }
        ;(willReturn as any)[k] = v
      }
      
      return willReturn
    })

    return items
  }

  async merge<T extends UnitPersist>(
    localList: T[],
    serverList: T[],
    handler?: (toMap1: ItemMap, toMap2: ItemMap) => any,
    keyName = 'ky'
  ): Promise<T[]> {
    // SQLite 已是本机唯一主库，不再把增量同步结果当成另一份数据来合并或删除。
    if (this.app.addons.dbDisk.storageMode === 'sqlite') return localList
    const diff = diffItems(localList, serverList, keyName)

    // Handle local-only items that should have been deleted on server (tombstone gone)
    // Condition: Item is local-only AND updated <= lastUploadTime
    try {
      const lastUploadTime = parseInt(localStorage.getItem(`${this.dbid}-lastUploadTime`) ?? '0');
      if (lastUploadTime > 0 && this.app?.addons?.dbDisk) {
        const db = await this.app.addons.dbDisk.open(this.dbid);
        const table = (db as any)[this.tbName];
        

        for (const [key, item] of Object.entries(diff.toMap2)) {
          // If item is not in server list (map2) but in local list (map1/toMap2)
          if (!diff.map2[key]) {
            // If local updated timestamp is older or equal to last successful upload time,
            // it means this item was synced before, but now it's gone from server.
            // Since server keeps tombstones for 30 days usually, absence means it's really gone.
            if ((item.updated || 0) <= lastUploadTime) {
              // Delete from local DB immediately
              await table.delete(item.ky);
              // Remove from memory maps to prevent re-adding/uploading
              delete diff.map1[key];
              delete diff.toMap2[key];
            }
          }
        }
      }
    } catch (e) {
      console.error("[SyncService] Error handling local-only deletions:", e);
    }

    await handler?.(diff.toMap1, diff.toMap2)

    const result = Object.values({
      ...diff.map1,
      ...diff.toMap1,
    }) as T[]
    return result
  }

  writeItemsToLocal(items: UnitPersist[]) {
    this.app.addons.imports.writeItems(items, this.dbid, {
      showProgress: true,
      tbName: this.tbName,
    })
  }
}
