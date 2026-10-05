import { App, NewAddonParams, IAddon } from '../../engine/App'
import { DocverPersist, NoteDatabase, SqlTable, TrackPersist, ensureSqliteReady, flushSqlite } from './NoteDatabase'

/**
 * 浏览器数据库处理
 */
export class DbDisk implements IAddon {
  app!: App
  config = {}
  readonly storageMode = 'sqlite'
  readonly ready = ensureSqliteReady()
  flush = flushSqlite

  connections: { [id: string]: NoteDatabase } = {} as any
  node!: SqlTable<UnitPersist>
  track!: SqlTable<TrackPersist>
  docver!: SqlTable<DocverPersist>

  /**
   * 当创建新节点时, 需要将它保存到主数据库
   * 所以,  defaultDBID 将以第一个打开的数据库作为主数据库
   */
  dbids: string[] = []

  get primaryId() {
    return this.dbids[0]
  }

  open(dbid: string) {
    if (!this.connections[dbid]) {
      this.connections[dbid] = new NoteDatabase(dbid)
    }
    const conn = this.connections[dbid]
    this.node = conn.node
    this.track = conn.track
    this.docver = conn.docver
    return conn
  }

  /**
   * 打开数据库
   * @param dbids
   */
  async openAll(dbids: string[]) {
    for (const id of dbids) {
      if (!this.dbids.includes(id)) this.dbids.push(id)
      const conn = this.open(id)
      await conn.ready
    }
  }

  /**
   * 读取所有已经打开链接的数据库的笔记
   * @returns
   */
  async getItemsFromConnections(): Promise<{ [dbid: string]: UnitPersist[] }> {
    const allResult = {} as any
    for (const [dbid, conn] of Object.entries(this.connections)) {
      allResult[dbid] = await this.getItems(dbid)
    }
    return allResult
  }

  getConnection(dbid?: string) {
    dbid ??= this.primaryId
    return this.connections[dbid] as NoteDatabase
  }

  /**
   * 读取某个数据库的笔记
   * @param dbid
   * @returns
   */
  getItems(dbid?: string, tbName = 'node') {
    dbid ??= this.primaryId
    return (this.connections[dbid] as any)[tbName].toArray()
  }

  save(item: UnitPersist, dbid: string | undefined, tbName = 'node') {
    dbid ??= this.primaryId
    const db = this.connections[dbid] // ?? this.connections[this.primaryId];
    if (!db) {
      console.error('Can not save item', item)
      throw new Error(`Connection doesn't exist: dbid(${dbid})`)
    }
    return (db as any)[tbName].put(item)
  }

  addonRun() {}
}

export function createDbDiskAddon({ app, $ }: NewAddonParams): DbDisk {
  return new DbDisk()
}
