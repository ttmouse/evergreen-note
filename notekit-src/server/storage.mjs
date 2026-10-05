import { createHash } from 'node:crypto'

export const primaryKeys = { node: 'ky', cached: 'ky', prefer: 'prky', track: 'tid', docver: 'vid' }
export class SqliteStore {
  constructor(db) {
    this.db = db
    db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS storage_migrations (dbid TEXT PRIMARY KEY, source_digest TEXT NOT NULL, report TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS storage_sequences (name TEXT PRIMARY KEY, value INTEGER NOT NULL);`)
  }
  table(dbid, store) {
    if (typeof dbid !== 'string' || !/^[A-Za-z0-9_一-龥-]+$/.test(dbid) || !Object.hasOwn(primaryKeys, store)) throw new Error('非法数据库或表名')
    return `${dbid}-${store}`
  }
  ensure(dbid, store) {
    const name = this.table(dbid, store)
    this.db.exec(`CREATE TABLE IF NOT EXISTS "${name}" (ky TEXT PRIMARY KEY, updated INTEGER, data TEXT NOT NULL, status INTEGER)`)
    // Original Notekit uses prky/tid/vid as SQL column names in some tables.
    // Rename that primary-key column without changing keys or record JSON.
    const columns = this.db.prepare(`PRAGMA table_info("${name}")`).all()
    if (!columns.some(column => column.name === 'ky')) {
      const legacyKey = primaryKeys[store]
      if (!columns.some(column => column.name === legacyKey && column.pk)) {
        throw new Error(`旧表缺少受支持的主键: ${name}`)
      }
      this.db.exec(`ALTER TABLE "${name}" RENAME COLUMN "${legacyKey}" TO "ky"`)
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS "${name}__status_idx" ON "${name}" (status)`)
    if (store === 'node') this.db.exec(`CREATE INDEX IF NOT EXISTS "${name}__pky_idx" ON "${name}" (json_extract(data, '$.pky'))`)
    return name
  }
  jsonPath(key) {
    if (/["\\\u0000-\u001f]/.test(key)) return null
    return '$.' + (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key))
  }
  filterRows(dbid, store, criteriaEntries) {
    const name = this.ensure(dbid, store)
    if (!criteriaEntries.length) return this.db.prepare(`SELECT data FROM "${name}" ORDER BY ky`).all().map(row => JSON.parse(row.data))
    const clauses = []
    const params = []
    for (const [key, value] of criteriaEntries) {
      // SQL narrows candidates; JS below preserves strict equality and JSON types.
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) continue
      if (typeof value === 'number' && !Number.isFinite(value)) continue
      const jsonPath = this.jsonPath(key)
      if (jsonPath === null) continue
      const expression = key === primaryKeys[store] && ['string', 'number'].includes(typeof value)
        ? 'ky'
        : key === 'status' && typeof value === 'number' ? 'status'
        : `json_extract(data, '${jsonPath.replace(/'/g, "''")}')`
      clauses.push(`${expression} IS ?`)
      params.push(typeof value === 'boolean' ? Number(value) : value)
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
    return this.db.prepare(`SELECT data FROM "${name}"${where} ORDER BY ky`).all(...params)
      .map(row => JSON.parse(row.data))
      .filter(row => criteriaEntries.every(([key, value]) => row[key] === value))
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  exists(dbid) {
    return Object.keys(primaryKeys).some(store => this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(this.table(dbid, store)))
  }
  all(dbid, store) {
    const name = this.ensure(dbid, store)
    return this.db.prepare(`SELECT data FROM "${name}" ORDER BY ky`).all().map(row => JSON.parse(row.data))
  }
  get(dbid, store, key) {
    const name = this.ensure(dbid, store)
    const row = this.db.prepare(`SELECT data FROM "${name}" WHERE ky=?`).get(String(key))
    return row ? JSON.parse(row.data) : null
  }
  count(dbid, store) {
    return this.db.prepare(`SELECT count(*) AS n FROM "${this.ensure(dbid, store)}"`).get().n
  }
  write(dbid, store, rows, addOnly = false) {
    const name = this.ensure(dbid, store)
    const field = primaryKeys[store]
    const statement = this.db.prepare(`INSERT INTO "${name}" (ky,updated,data,status) VALUES (?,?,?,?) ${addOnly ? '' : 'ON CONFLICT(ky) DO UPDATE SET updated=excluded.updated,data=excluded.data,status=excluded.status'}`)
    return rows.map(input => {
      const row = { ...input }
      if (store === 'track') {
        const current = this.db.prepare('SELECT value FROM storage_sequences WHERE name=?').get(name)?.value ?? this.db.prepare(`SELECT coalesce(max(CAST(ky AS INTEGER)),0) AS n FROM "${name}"`).get().n
        if (row.tid == null) row.tid = Number(current) + 1
        this.db.prepare('INSERT INTO storage_sequences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=max(value,excluded.value)').run(name, Math.max(Number(current), Number(row.tid)))
      }
      const key = row[field]
      if (key == null || !['string', 'number'].includes(typeof key) || key === '') throw new Error(`缺少有效主键 ${field}`)
      statement.run(String(key), Number(row.updated) || 0, JSON.stringify(row), row.status ?? 1)
      return key
    })
  }
  put(dbid, store, rows, addOnly = false) { return this.transaction(() => this.write(dbid, store, rows, addOnly)) }
  patch(dbid, store, criteria, changes) {
    const field = primaryKeys[store]
    if (Object.hasOwn(changes, field)) throw new Error('不允许通过 update 修改主键')
    return this.transaction(() => {
      const criteriaEntries = Object.entries(criteria)
      const rows = criteriaEntries.length === 1 && criteriaEntries[0][0] === field
        ? [this.get(dbid, store, criteriaEntries[0][1])].filter(row => row && row[field] === criteriaEntries[0][1])
        : this.filterRows(dbid, store, criteriaEntries)
      for (const row of rows) {
        for (const [key, value] of Object.entries(changes)) {
          const parts = key.split('.')
          if (parts.some(part => ['__proto__', 'prototype', 'constructor'].includes(part))) throw new Error('非法字段')
          let target = row
          for (const part of parts.slice(0, -1)) target = target[part] ??= {}
          target[parts.at(-1)] = value
        }
      }
      this.write(dbid, store, rows)
      return rows.length
    })
  }
  remove(dbid, store, keys) {
    const name = this.ensure(dbid, store)
    return this.transaction(() => {
      const statement = this.db.prepare(`DELETE FROM "${name}" WHERE ky=?`)
      return keys.reduce((count, key) => count + Number(statement.run(String(key)).changes), 0)
    })
  }
  backup(target) { this.db.prepare('VACUUM INTO ?').run(target) }
  status() {
    return { mode: 'sqlite', migrations: this.db.prepare('SELECT report FROM storage_migrations ORDER BY dbid').all().map(row => JSON.parse(row.report)) }
  }
  migrate(dbid, tables, refresh = false) {
    if (!Array.isArray(tables) || !tables.length) throw new Error('迁移必须包含旧数据库表')
    const digest = createHash('sha256').update(JSON.stringify(tables)).digest('hex')
    const existing = this.db.prepare('SELECT report FROM storage_migrations WHERE dbid=?').get(dbid)
    if (existing && !refresh) return JSON.parse(existing.report)
    return this.transaction(() => {
      const report = { dbid, sourceDigest: digest, at: new Date().toISOString(), tables: [] }
      const seenTables = new Set()
      for (const table of tables) {
        if (seenTables.has(table.name)) throw new Error('重复迁移表')
        seenTables.add(table.name)
        const name = this.ensure(dbid, table.name)
        const field = primaryKeys[table.name]
        if (!Array.isArray(table.rows)) throw new Error('迁移记录必须是数组')
        const seen = new Set()
        let preservedNewer = 0
        const read = this.db.prepare(`SELECT data FROM "${name}" WHERE ky=?`)
        for (const row of table.rows) {
          const key = row[field]
          if (key == null || seen.has(String(key))) throw new Error(`迁移主键缺失或重复: ${table.name}`)
          seen.add(String(key))
          const old = read.get(String(key))
          if (old && Number(JSON.parse(old.data).updated || 0) > Number(row.updated || 0)) {
            preservedNewer++
          } else {
            this.write(dbid, table.name, [row])
            if (read.get(String(key))?.data !== JSON.stringify(row)) throw new Error(`迁移内容校验失败: ${table.name}/${key}`)
          }
          if (!read.get(String(key))) throw new Error('迁移记录读取校验失败')
        }
        report.tables.push({ name: table.name, sourceCount: table.rows.length, verified: seen.size, preservedNewer, sqliteCount: this.count(dbid, table.name) })
      }
      this.db.prepare('INSERT INTO storage_migrations VALUES (?,?,?) ON CONFLICT(dbid) DO UPDATE SET source_digest=excluded.source_digest, report=excluded.report').run(dbid, digest, JSON.stringify(report))
      return report
    })
  }
}
