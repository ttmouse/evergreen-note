import type { KyString, TimeMilliSecond } from '../../interfaces/unit'
import type { PreferPersist } from '../Prefer/Prefer'
import type { ItemMap } from '../DbMemory/DbMemory'
import { flushLater } from '../../utils/atLater'
import { showSnack } from '../../utils/msg/showSnack'
import type { SnackHanlder } from '../../utils/msg/showSnack'
import type { DiffResult } from '../Track/helper'

export interface TrackPersist extends UnitPersist { tid: number; tracked: number; topicKy: string }
export type ItemDiff = DiffResult & { ky: KyString; time: number }
export interface DocverPersist {
  vid: KyString; ky: KyString; tracked: TimeMilliSecond; items: ItemMap; diff: ItemDiff[]; revertFrom?: DocverPersist['vid']
}

type Row = Record<string, any>
const keys = { node: 'ky', cached: 'ky', prefer: 'prky', track: 'tid', docver: 'vid' }
const api = (dbid: string, table: string) => `/api/local-db/${encodeURIComponent(dbid)}/${table}`
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(`SQLite 请求失败: ${detail.error || response.status}`)
  }
  return response.json()
}
function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 读取失败'))
  })
}
let migration: Promise<void> | undefined
/** 全部旧库在启动编辑器前复制，任何一库失败都阻止进入编辑器。 */
export function ensureSqliteReady(): Promise<void> {
  return migration ??= migrateLegacyDatabases()
}
async function migrateLegacyDatabases() {
  const status = await request<{ mode: string; migrations: Array<{ dbid: string }> }>('/api/storage/status')
  if (status.mode !== 'sqlite') throw new Error('SQLite 主库服务尚未就绪')
  if (!indexedDB.databases) throw new Error('当前 Chromium 无法枚举旧数据库，迁移已停止')
  const migrated = new Set(status.migrations.map(entry => entry.dbid))
  const databases = await indexedDB.databases()
  for (const info of databases) {
    if (!info.name || migrated.has(info.name)) continue
    const openReq = indexedDB.open(info.name)
    // 此处绝不创建或升级源库。
    openReq.onupgradeneeded = () => openReq.transaction?.abort()
    const legacy = await idbRequest(openReq)
    try {
      const names = Array.from(legacy.objectStoreNames)
      if (!names.some(name => name in keys)) continue
      if (names.some(name => !(name in keys))) throw new Error(`旧库 ${info.name} 包含尚未支持的表`)
      const tx = legacy.transaction(names, 'readonly')
      const completed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('旧库读取事务失败'))
      })
      const tables = await Promise.all(names.map(async name => {
        const store = tx.objectStore(name)
        const rowsReq = store.getAll()
        const keysReq = store.getAllKeys()
        const [rows, primary] = await Promise.all([idbRequest(rowsReq), idbRequest(keysReq)])
        const field = keys[name as keyof typeof keys]
        return { name, rows: (rows as Row[]).map((row, index) => {
          if (row[field] == null) row[field] = primary[index]
          return row
        }) }
      }))
      await completed
      const bytes = new TextEncoder().encode(JSON.stringify(tables))
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('')
      const report = await request<{ sourceDigest: string; tables: Array<{ sourceCount: number; verified: number }> }>(`/api/storage/migrate/${encodeURIComponent(info.name)}`, {
        method: 'POST', body: JSON.stringify({ tables }),
      })
      if (report.sourceDigest !== digest || report.tables.some(table => table.sourceCount !== table.verified)) throw new Error(`旧库 ${info.name} 迁移校验失败`)
      console.info('[storage] IndexedDB -> SQLite 校验完成', info.name, report.tables)
    } finally { legacy.close() }
  }
}

const pendingWrites = new Set<Promise<unknown>>()
let writeError: unknown

// 写库失败必须让用户看见（OP-013）：编辑器是内存态，静默失败等于重启丢稿。
// 单条持久错误条（autoClose 0）承载全部失败提示，恢复后原地转为成功并自动收起，
// 避免连续失败每键弹一条。文案沿用存储层既有中文硬编码惯例。
let storageAlert: SnackHanlder | undefined
function notifyWriteFailure(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  const content = `笔记保存失败，改动尚未保存：${detail}`
  if (storageAlert) storageAlert.update({ open: true, severity: 'error', content, autoClose: 0 })
  else storageAlert = showSnack({ content, severity: 'error', autoClose: 0, vertical: 'bottom', horizontal: 'center', clickAway: false })
}
function notifyWriteRecovered() {
  storageAlert?.update({ open: true, severity: 'success', content: '笔记保存已恢复', autoClose: 4000 })
  storageAlert = undefined
}

export async function flushSqlite() {
  await ensureSqliteReady()
  await flushLater(['checkSave-', 'editor-save-item-', 'save-item-'])
  while (pendingWrites.size) await Promise.all([...pendingWrites])
  if (writeError) throw writeError
}

class SqlCollection<T extends Row> {
  constructor(private table: SqlTable<T>, private predicate: (row: T) => boolean) {}
  async toArray() { return (await this.table.toArray()).filter(this.predicate) }
  async count() { return (await this.toArray()).length }
  async first() { return (await this.toArray())[0] }
  async modify(changes: Partial<T> | ((row: T) => void)) {
    const rows = await this.toArray()
    for (const row of rows) {
      if (typeof changes === 'function') changes(row)
      else Object.assign(row, changes)
    }
    await this.table.bulkPut(rows)
    return rows.length
  }
  async delete() { const rows = await this.toArray(); await this.table.bulkDelete(rows.map(row => this.table.key(row))); return rows.length }
}
class SqlWhere<T extends Row> {
  constructor(private table: SqlTable<T>, private criteria: Record<string, any> | string) {}
  equals(value: any) {
    if (typeof this.criteria !== 'string') throw new Error('equals 需要指定索引字段')
    const field = this.criteria
    return new SqlCollection(this.table, row => row[field] === value)
  }
  toArray() { return new SqlCollection(this.table, row => Object.entries(this.criteria).every(([k,v]) => row[k] === v)).toArray() }
  async modify(changes: Partial<T>) {
    if (typeof this.criteria === 'string') throw new Error('where 索引字段尚未提供比较值')
    const result = await this.table.mutate<{ count: number }>({ method: 'PATCH', body: JSON.stringify({ where: this.criteria, changes }) })
    return result.count
  }
  async delete() { return new SqlCollection(this.table, row => Object.entries(this.criteria).every(([k,v]) => row[k] === v)).delete() }
}
export class SqlTable<T extends Row> {
  readonly schema: { primKey: { name: string; auto: boolean } }
  constructor(readonly db: NoteDatabase, readonly name: string, private keyField: string) {
    this.schema = { primKey: { name: keyField, auto: name === 'track' } }
  }
  key(row: T) { return row[this.keyField] }
  async query<R>(op: string, params?: Record<string, string>): Promise<R> {
    await this.db.ready
    return request(api(this.db.name, this.name) + '?' + new URLSearchParams({ op, ...params }))
  }
  mutate<R>(init: RequestInit, op = ''): Promise<R> {
    const promise = this.db.ready.then(() => request<R>(api(this.db.name, this.name) + op, init))
    pendingWrites.add(promise)
    promise.then(
      () => {
        pendingWrites.delete(promise)
        writeError = undefined
        if (storageAlert) notifyWriteRecovered()
      },
      error => {
        pendingWrites.delete(promise)
        writeError = error
        notifyWriteFailure(error)
      },
    )
    return promise
  }
  toArray(): Promise<T[]> { return this.query('all') }
  async get(key: any): Promise<T | undefined> { return (await this.query<T | null>('get', { key: String(key) })) ?? undefined }
  async put(row: T) { const result = await this.mutate<{ keys: any[] }>({ method: 'PUT', body: JSON.stringify({ row }) }); return result.keys[0] }
  async add(row: T) { const result = await this.mutate<{ keys: any[] }>({ method: 'PUT', body: JSON.stringify({ row }) }, '?op=add'); return result.keys[0] }
  async bulkPut(rows: T[]) { const result = await this.mutate<{ keys: any[] }>({ method: 'PUT', body: JSON.stringify({ rows }) }); return result.keys[result.keys.length - 1] }
  async bulkDelete(keys: any[]) { await this.mutate({ method: 'DELETE', body: JSON.stringify({ keys }) }) }
  async delete(key: any) { await this.bulkDelete([key]) }
  async update(key: any, changes: Partial<T>) { return (await this.mutate<{ count: number }>({ method: 'PATCH', body: JSON.stringify({ where: { [this.keyField]: key }, changes }) })).count }
  where(criteria: Record<string, any> | string) { return new SqlWhere(this, criteria) }
  toCollection() { return new SqlCollection(this, () => true) }
  count(): Promise<number> { return this.query('count') }
  async clear() { await this.bulkDelete((await this.toArray()).map(row => this.key(row))) }
}
export class NoteDatabase {
  readonly ready = ensureSqliteReady()
  readonly node = new SqlTable<UnitPersist>(this, 'node', 'ky')
  readonly track = new SqlTable<TrackPersist>(this, 'track', 'tid')
  readonly docver = new SqlTable<DocverPersist>(this, 'docver', 'vid')
  readonly cached = new SqlTable<UnitPersist>(this, 'cached', 'ky')
  readonly prefer = new SqlTable<PreferPersist>(this, 'prefer', 'prky')
  constructor(readonly name: string) {}
  static async exists(dbid: string) { await ensureSqliteReady(); return request<boolean>(api(dbid, 'node') + '?op=exists') }
}
