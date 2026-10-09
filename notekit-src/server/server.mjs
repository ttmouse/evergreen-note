/**
 * 最小后端（自写，用于取代 Notekit 那个闭源且有到期日的服务二进制）
 *
 * 依据：前端只对服务端有 **9 个接口** 的需求（115 个 addon 里仅 12 个碰网络）。
 * 其中真正不可省的只有「取库 / 存库 / 上传」三件事，其余按需占位。
 *
 * 协议来源（全部从还原出的前端源码读出，非猜测）：
 *   src/slate-item/addons/Sync2/Sync2.ts        login / get-server-data / get-need-sync
 *   src/slate-item/addons/Sync2/SyncService.ts  handle-sync2
 *
 * 存储：SQLite（node:sqlite），表结构照搬原版 —— `<dbid>-<tbName>(ky, updated, data, status)`，
 * 与实测的 Notekit 库 `db-1-v2main-node` / `HOME-1-node` / `HOME-1-prefer` 一致。
 *
 * 启动：node --experimental-sqlite server/server.mjs
 * 数据目录：命令行默认 <repo>/.server-data/；已安装应用沿用
 * ~/Library/Application Support/Notekit/library/，由外壳显式指定。
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { SqliteStore } from './storage.mjs'
import { callNoteCommand, verifySaved } from './note-command.mjs'
import { createAiAcpService } from './ai-acp-routes.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
// 数据目录可由外壳通过 NOTEKIT_DATA_DIR 指定（桌面模式下放在 Electron 的 userData 下）
const DATA_DIR = process.env.NOTEKIT_DATA_DIR || path.join(ROOT, '.server-data')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 11814)

for (const d of [DATA_DIR, path.join(DATA_DIR, 'files'), path.join(DATA_DIR, 'images')]) {
  mkdirSync(d, { recursive: true })
}

const db = new DatabaseSync(path.join(DATA_DIR, 'notekit.db'))
const storage = new SqliteStore(db)

// AI 侧边栏：把 dsh --profile acp 拉成子进程，事件经 /api/ai/acp/stream 以 SSE 推给渲染层。
// 方案正本：notes/AI侧边栏ACP接入方案-20261009.md
const aiAcp = createAiAcpService({
  dataDir: DATA_DIR,
  readBody,
  writeJson: sendJson,
  log: (m) => console.log(m),
})
// 应用退出时先收干净子进程（SIGTERM → 宽限 → SIGKILL），避免留僵尸
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      await aiAcp.stop()
    } catch {}
    process.exit(0)
  })
}
process.on('exit', () => {
  try {
    aiAcp.stop()
  } catch {}
})

/** 表名规则与实测原版一致：`<dbid>-<tbName>` */
function tableName(dbid, tbName) {
  return `${dbid}-${tbName}`
}

function ensureTable(name) {
  // 标识符来自请求，用引号包裹并拒绝异常字符，避免注入
  if (!/^[A-Za-z0-9_一-龥-]+$/.test(name)) {
    throw new Error(`非法表名: ${name}`)
  }
  db.exec(
    `CREATE TABLE IF NOT EXISTS "${name}" (ky TEXT PRIMARY KEY, updated INT, data TEXT, status INT)`
  )
}

const now = () => Math.floor(Date.now() / 1000)

/**
 * HOME 库 dbid。前端固定 USER_ID=1（dist/index.html 注入），
 * LibAdmin 的 HOME_DBID = `HOME-${id.toString(32)}` 即 `HOME-1`。
 * 文件管理（FileManager addon）从服务端 `HOME-1-file` 表读取上传登记，
 * 因此上传/删除必须同步维护这张表。
 */
const HOME_DBID = 'HOME-1'

/** 把上传的文件登记进 `<HOME_DBID>-file` 表，供 FileManager 列表读取 */
function registerUpload(row) {
  const table = tableName(HOME_DBID, 'file')
  ensureTable(table)
  db.prepare(
    `INSERT INTO "${table}" (ky, updated, data, status) VALUES (?, ?, ?, ?)
     ON CONFLICT(ky) DO UPDATE SET updated = excluded.updated, data = excluded.data, status = excluded.status`
  ).run(String(row.ky), Number(row.updated), JSON.stringify(row), 1)
}

/**
 * 统一处理 /api/handle-upload 与 /api/saveB64Image：
 * - multipart File（附件 file0）或 base64 字段（图片 uri/content/data）都读出真实字节
 * - 按 FileManager 的缓存匹配约定落盘到 files/ 或 images/，逻辑路径为 data/<sub>/<name>
 * - 登记 file 表并按前端 AttachmentResponse 契约返回 node.fileInfo
 */
async function saveUpload(req, res, p, body) {
  const isImage = p.includes('Image')
  const sub = isImage ? 'images' : 'files'
  let name = String(body.filename || body.name || '')
  let type = String(body.type || body.filetype || '')
  let buf = null
  const formFile = body.file0 || body.file
  if (formFile && typeof formFile === 'object' && typeof formFile.arrayBuffer === 'function') {
    buf = Buffer.from(await formFile.arrayBuffer())
    if (!name) name = String(formFile.name || '')
    if (!type) type = String(formFile.type || '')
  }
  if (!buf) {
    const raw = String(body.uri || body.content || body.data || '')
    if (raw) {
      buf = Buffer.from(raw.replace(/^data:[^,]+,/, ''), 'base64')
      if (!type) {
        const m = raw.match(/^data:([^;,]+)[;,]/)
        if (m) type = m[1]
      }
    }
  }
  // Buffer.from('', 'base64') 仍是 length-0 对象（!buf === false），
  // 只判 !buf 会让「字段名不匹配」静默落成 0 字节文件并返回成功。
  if (!buf || buf.length === 0) {
    return sendJson(res, { code: 1, error: '上传内容为空：未能从请求中读出文件数据' }, 400)
  }
  if (!name) name = `upload-${Date.now()}`
  const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
  if (isImage && !path.extname(name)) name += '.' + (IMG_EXT[type] || 'png')
  const safe = path.basename(name)
  if (!safe || safe === '.' || safe === '..') {
    return sendJson(res, { code: 1, error: '非法文件名' }, 400)
  }
  writeFileSync(path.join(DATA_DIR, sub, safe), buf)
  const fileInfo = {
    ext: (path.extname(safe).slice(1) || '').toLowerCase(),
    name: safe,
    path: `data/${sub}/${safe}`,
    size: buf.length,
    type: type || 'application/octet-stream',
    md5: createHash('md5').update(buf).digest('hex'),
  }
  const node = { ky: fileInfo.path, fileInfo, created: now(), updated: now() }
  registerUpload(node)
  console.log(`[api] upload -> ${fileInfo.path} (${buf.length}B)`)
  return sendJson(res, {
    code: 0,
    url: `/${sub}/${safe}`,
    urlname: safe,
    filename: safe,
    node,
  })
}

/* ------------------------------- 接口实现 ------------------------------- */

/** POST /api/handle-sync2  { storename, pk, uploadList, dbname } -> { saved, result, error, msg } */
function handleSync2(body) {
  const { storename = 'node', pk = 'ky', dbname } = body
  const list = JSON.parse(body.uploadList || '[]')
  const table = tableName(dbname, storename)
  ensureTable(table)

  const saved = {}
  // 原版用 prepare + 逐个 upsert；这里同样逐条，便于精确回报每条结果
  const stmt = db.prepare(
    `INSERT INTO "${table}" (ky, updated, data, status) VALUES (?, ?, ?, ?)
     ON CONFLICT(ky) DO UPDATE SET updated = excluded.updated, data = excluded.data, status = excluded.status`
  )
  for (const row of list) {
    // 主键可能是 ky，也可能是 prky（prefer 表）——与原版 priKey() 逻辑一致
    const key = row[pk] ?? row.ky ?? row.prky
    try {
      stmt.run(String(key), Number(row.updated) || now(), JSON.stringify(row), row.status ?? 1)
      saved[key] = 'success'
    } catch (e) {
      saved[key] = 'fail'
    }
  }
  return { saved, result: true, error: '', msg: '' }
}

/** POST /api/get-server-data  { conds, shareId } -> { '<dbid>-<tb>': { result, hasMore } } */
function getServerData(body) {
  const conds = JSON.parse(body.conds || '[]')
  const out = {}
  for (const cond of conds) {
    const { dbid, tbName = 'node', date = 0, offset = 0, limit = 300 } = cond
    const table = tableName(dbid, tbName)
    const key = `${dbid}-${tbName}`
    try {
      ensureTable(table)
      const rows = db
        .prepare(
          `SELECT ky, updated, data FROM "${table}"
           WHERE updated > ? ORDER BY updated ASC LIMIT ? OFFSET ?`
        )
        .all(Number(date) || 0, Number(limit), Number(offset))
      const total = db.prepare(`SELECT COUNT(*) AS c FROM "${table}" WHERE updated > ?`).get(Number(date) || 0).c
      out[key] = {
        // data 列存的是节点 JSON，按原版语义还原成对象返回
        result: rows.map((r) => {
          try {
            return JSON.parse(r.data)
          } catch {
            return r
          }
        }),
        hasMore: Number(offset) + rows.length < total,
      }
    } catch (e) {
      out[key] = { result: [], hasMore: false, error: String(e) }
    }
  }
  return out
}

/** GET /api/get-need-sync -> { code, needSync } */
function getNeedSync() {
  // 最小实现：本机单端使用，服务端不需要主动推送；客户端有 pending 时会自行上传。
  return { code: 0, needSync: false }
}

/** SQLite 主库直接读写；与原同步表共用唯一的数据源。 */
function handleLocalDb(req, res, url, body) {
  const parts = url.pathname.split('/')
  const dbid = decodeURIComponent(parts[3] || '')
  const table = decodeURIComponent(parts[4] || '')
  storage.table(dbid, table)
  const op = url.searchParams.get('op') || 'all'
  if (req.method === 'GET') {
    if (op === 'get') return sendJson(res, storage.get(dbid, table, url.searchParams.get('key')))
    if (op === 'count') return sendJson(res, storage.count(dbid, table))
    if (op === 'exists') return sendJson(res, storage.exists(dbid))
    return sendJson(res, storage.all(dbid, table))
  }
  if (req.method === 'PUT') return sendJson(res, { keys: storage.put(dbid, table, body.rows || [body.row], op === 'add') })
  if (req.method === 'PATCH') return sendJson(res, { count: storage.patch(dbid, table, body.where || {}, body.changes || {}) })
  if (req.method === 'DELETE') return sendJson(res, { count: storage.remove(dbid, table, body.keys || [body.key]) })
  return sendJson(res, { error: '不支持的方法' }, 405)
}

/* ------------------------------- HTTP 层 ------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(readFileSync(file))
}

function readRaw(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/**
 * 解析请求体。
 *
 * ⚠️ 关键：前端的 HTTP 层（`addons/Http/helper.ts` 的 progress()）**用的是 FormData**
 * —— 无论 post 还是 get，都 `new FormData()` 逐字段 append，multipart/form-data 发送。
 * 一开始按 JSON 解析导致字段全空、客户端每秒重试。这里用 Node 内置的 Request.formData() 解析。
 */
async function readBody(req) {
  const buf = await readRaw(req)
  const ct = req.headers['content-type'] || ''
  if (ct.includes('multipart/form-data') || ct.includes('urlencoded')) {
    const r = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': ct },
      body: buf,
    })
    const form = await r.formData()
    const o = {}
    for (const [k, v] of form.entries()) o[k] = v
    return o
  }
  const raw = buf.toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const o = {}
    for (const [k, v] of new URLSearchParams(raw)) o[k] = v
    return o
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname
  const log = (extra = '') => console.log(`[api] ${req.method} ${p} ${extra}`)

  try {
    if (p === '/api/note-command') {
      if (!process.env.NOTEKIT_NOTE_TOKEN || req.headers.authorization !== `Bearer ${process.env.NOTEKIT_NOTE_TOKEN}`) return sendJson(res, { error: '笔记命令未授权' }, 403)
      if (req.method !== 'POST') return sendJson(res, { error: '笔记命令需要 POST' }, 405)
      const result = await callNoteCommand(await readBody(req))
      verifySaved(result, (dbid, store, key) => storage.get(dbid, store, key))
      return sendJson(res, result)
    }
    // ---------- 数据接口 ----------
    if (p === '/api/storage/backup' && req.method === 'POST') {
      const body = await readBody(req)
      if (typeof body.filename !== 'string' || !/^notekit-[0-9-]+\.db$/.test(body.filename)) throw new Error('非法备份文件名')
      const directory = process.env.NOTEKIT_BACKUP_DIR || path.resolve(DATA_DIR, '..', 'backups')
      mkdirSync(directory, { recursive: true })
      const target = path.join(directory, body.filename)
      storage.backup(target)
      return sendJson(res, { ok: true, path: target })
    }
    if (p === '/api/storage/status' && req.method === 'GET') return sendJson(res, storage.status())
    if (p.startsWith('/api/storage/migrate/') && req.method === 'POST') {
      const dbid = decodeURIComponent(p.slice('/api/storage/migrate/'.length))
      const body = await readBody(req)
      return sendJson(res, storage.migrate(dbid, body.tables, body.refresh === true))
    }
    if (p === '/storage-audit.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end('<!doctype html><title>Notekit storage migration</title><p>正在检查笔记存储…</p>')
    }
    if (p.startsWith('/api/local-db/')) {
      const body = req.method === 'GET' ? {} : await readBody(req)
      return handleLocalDb(req, res, url, body)
    }
    if (p === '/api/handle-sync2' && req.method === 'POST') {
      const out = handleSync2(await readBody(req))
      log(`-> ${Object.keys(out.saved).length} 条`)
      return sendJson(res, out)
    }
    if (p === '/api/get-server-data' && req.method === 'POST') {
      const out = getServerData(await readBody(req))
      const n = Object.values(out).reduce((a, v) => a + (v.result?.length || 0), 0)
      log(`-> ${n} 行`)
      return sendJson(res, out)
    }
    if (p === '/api/get-need-sync' && req.method === 'GET') {
      log()
      return sendJson(res, getNeedSync())
    }
    if (p === '/api/login') {
      // 原版在此下发登录页。本地单用户无需登录，直接回到应用。
      res.writeHead(302, { Location: '/static/' })
      return res.end()
    }
    if (p === '/api/logout') {
      res.writeHead(302, { Location: '/static/' })
      return res.end()
    }

    // ---------- 文件与图片 ----------
    if (p === '/api/handle-upload' || p === '/api/saveB64Image') {
      const body = await readBody(req)
      // 必须 await：saveUpload 内部抛错时返回 500，而不是变成未处理的 Promise 拒绝把服务进程杀掉
      return await saveUpload(req, res, p, body)
    }
    if (p === '/api/delete-file') {
      const body = await readBody(req)
      // 客户端 FileManagerDeleteIcon 传的是 { ky, path }
      const safe = path.basename(String(body.filename || body.url || body.path || ''))
      for (const sub of ['files', 'images']) {
        const f = path.join(DATA_DIR, sub, safe)
        if (existsSync(f) && statSync(f).isFile()) unlinkSync(f)
      }
      try {
        const table = tableName(HOME_DBID, 'file')
        db.prepare(`DELETE FROM "${table}" WHERE ky = ? OR json_extract(data, '$.fileInfo.path') = ?`)
          .run(String(body.ky ?? ''), String(body.path ?? ''))
      } catch {}
      log(`-> ${safe}`)
      return sendJson(res, { code: 0 })
    }

    // ---------- AI 侧边栏（必须在下面的 /api/* 兜底之前） ----------
    if (await aiAcp.handle(req, res, p)) return

    // ---------- 其余接口：占位但不报错 ----------
    if (p.startsWith('/api/')) {
      if (req.method === 'POST') await readBody(req)
      log('-> 占位')
      return sendJson(res, { code: 0, result: true })
    }

    // ---------- 静态资源 ----------
    // OP-002：path.join 不消除 ..，decode 后可逃出 DATA_DIR（穿越拖走任意本机文件）；
    // 且仅钳在 DATA_DIR 仍可用 ..%2Fnotekit.db 拖走主库，故按 saveUpload 落盘布局
    // 分别钳制在 DATA_DIR/files/ 与 DATA_DIR/images/ 子目录内部
    if (p.startsWith('/files/') || p.startsWith('/images/')) {
      const sub = p.startsWith('/files/') ? 'files' : 'images'
      const root = path.resolve(DATA_DIR, sub)
      const f = path.resolve(root, '.' + decodeURIComponent(p.slice(sub.length + 1)))
      if (f.startsWith(root + path.sep) && existsSync(f) && statSync(f).isFile()) return sendFile(res, f)
      res.writeHead(404)
      return res.end('not found')
    }
    // 上传文件逻辑路径 data/files|images/<name>（fileInfo.path），供 <img src>/附件打开直接命中
    if (p.startsWith('/data/files/') || p.startsWith('/data/images/')) {
      const f = path.resolve(DATA_DIR, decodeURIComponent(p.slice('/data/'.length)))
      if (f.startsWith(path.resolve(DATA_DIR) + path.sep) && existsSync(f) && statSync(f).isFile()) return sendFile(res, f)
      res.writeHead(404)
      return res.end('not found')
    }

    let rel = p
    if (rel === '/' || rel === '') rel = '/static/'
    if (rel.startsWith('/static/')) {
      rel = rel.slice('/static/'.length) || 'index.html'
    }
    const file = path.join(DIST, rel)
    if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) {
      return sendFile(res, file)
    }
    // SPA 回退
    const index = path.join(DIST, 'index.html')
    if (existsSync(index)) return sendFile(res, index)
    res.writeHead(404)
    res.end('dist/ 不存在，请先 pnpm build')
  } catch (e) {
    console.error('[api] 错误:', e)
    sendJson(res, { code: 1, error: String(e && e.message) }, 500)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Notekit 本地服务已启动: http://127.0.0.1:${PORT}/static/`)
  console.log(`数据目录: ${DATA_DIR}`)
})
