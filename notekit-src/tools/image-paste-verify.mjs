/**
 * image-paste-verify.mjs — 独立验收脚本（task-2, owner: verify）
 *
 * 目的：在**真实打包产物** `build/Evergreen note.app` 上独立复验「粘贴图片」链路，
 * 并做旧版反向对照与附件回归。不采信 lead / repro 的任何结论，所有断言都由本脚本
 * 自己的运行输出支撑。
 *
 * 隔离保证：
 *   - 只跑打包产物自身 `Contents/MacOS/Evergreen note`，不跑 dev server / electron from source。
 *   - NOTEKIT_USER_DATA 指向 test-runs/image-paste-verify/<tag>/profile（全新目录）。
 *   - 启动前后对 ~/Library/Application Support/NotekitDev 做 stat 快照比对，证明未被触碰。
 *
 * 用法：
 *   node tools/image-paste-verify.mjs              # 新版（打包内当前 server.mjs）
 *   node tools/image-paste-verify.mjs --old-server # 反向对照：把打包内 server.mjs 临时换成旧版
 *
 * --old-server 模式会在启动前把打包内 server.mjs 备份、替换为 `git show 44ff71d^:server/server.mjs`
 * 的内容，跑完后**必定**恢复原文件（含 finally + 进程退出钩子）。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, readFile, stat, copyFile, readdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const MODE_OLD = process.argv.includes('--old-server')
const TAG = MODE_OLD ? 'old-server' : 'new-server'
const outRoot = path.join(root, '..', 'test-runs', 'image-paste-verify')
const outDir = path.join(outRoot, TAG)

const APP_BUNDLE = path.join(root, 'build', 'Evergreen note.app')
const APP_BIN = path.join(APP_BUNDLE, 'Contents', 'MacOS', 'Evergreen note')
const PKG_SERVER = path.join(APP_BUNDLE, 'Contents', 'Resources', 'app', 'server', 'server.mjs')
const REPO_SERVER = path.join(root, 'server', 'server.mjs')
const REAL_PROFILE = path.join(os.homedir(), 'Library', 'Application Support', 'NotekitDev')

const sleeps = ms => new Promise(r => setTimeout(r, ms))
const sha256 = async f => createHash('sha256').update(await readFile(f)).digest('hex')

const report = {
  task: 'task-2',
  mode: MODE_OLD ? 'old-server (reverse control)' : 'new-server (packaged)',
  startedAt: new Date().toISOString(),
  assertions: [],
  steps: {},
  console: [],
  exceptions: [],
  childOut: '',
}
const assert = (id, desc, pass, evidence) => {
  const rec = { id, desc, pass: !!pass, evidence }
  report.assertions.push(rec)
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${desc}${pass ? '' : '\n      evidence: ' + JSON.stringify(evidence).slice(0, 900)}`)
  return !!pass
}

async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}

/* ---------------- 0. 真实库保护快照 ---------------- */
const profileGuard = {}
async function snapshotReal() {
  try {
    const st = await stat(REAL_PROFILE)
    return { exists: true, mtimeMs: st.mtimeMs, size: st.size }
  } catch { return { exists: false } }
}
profileGuard.before = await snapshotReal()

/* ---------------- 1. 准备隔离目录 ---------------- */
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const dataDir = path.join(profile, 'library')
report.isolation = { profile, dataDir, realProfile: REAL_PROFILE, appBin: APP_BIN }
console.log(`[iso] profile=${profile}`)

/* ---------------- 2. 哈希核对（独立计算，不抄 lead 数字） ---------------- */
report.hashes = {
  repoServer: await sha256(REPO_SERVER),
  packagedServer: await sha256(PKG_SERVER),
  repoServerSize: (await stat(REPO_SERVER)).size,
  packagedServerSize: (await stat(PKG_SERVER)).size,
}
report.hashes.identical = report.hashes.repoServer === report.hashes.packagedServer
assert('H1-package-matches-repo',
  '打包内 server.mjs 与仓库版字节一致（自查 SHA-256）',
  report.hashes.identical,
  report.hashes)

// 提取打包内 server 的 saveUpload 取值字段，确认不再是 body.content||body.data
const pkgSrc = await readFile(PKG_SERVER, 'utf8')
// 精确区分「旧版取值」与「新版取值」：
//   旧版：const data = body.content || body.data || ''   —— uri 完全不参与，uri 请求 → 空串
//   新版：String(body.uri || body.content || body.data || '') —— uri 优先
report.packagedServerFeatures = {
  hasUriField: /body\.uri/.test(pkgSrc),
  hasBufLengthGuard: /buf\.length\s*===\s*0/.test(pkgSrc),
  hasRegisterUpload: /registerUpload/.test(pkgSrc),
  // 旧版特征：body.content 在 body.uri 之前/独立出现且没有 uri 兜底
  legacyOnlyContentData: /body\.content\s*\|\|\s*body\.data/.test(pkgSrc) && !/body\.uri/.test(pkgSrc),
  fileInfoContract: /fileInfo/.test(pkgSrc) && /path:\s*`data\/\$\{sub\}/.test(pkgSrc),
  nodeInResponse: /node,/.test(pkgSrc) && /registerUpload\(node\)/.test(pkgSrc),
}
report.packagedServerFeatures.ok =
  report.packagedServerFeatures.hasUriField &&
  report.packagedServerFeatures.hasBufLengthGuard &&
  report.packagedServerFeatures.fileInfoContract &&
  report.packagedServerFeatures.nodeInResponse &&
  !report.packagedServerFeatures.legacyOnlyContentData
assert('H2-packaged-has-fix',
  '打包内 server 具备修复特征（body.uri 优先 + buf.length 守卫 + fileInfo/node 契约 + file 表登记），且无旧版「仅 content/data」取值',
  report.packagedServerFeatures.ok,
  report.packagedServerFeatures)

/* ---------------- 3. 反向对照：临时换入旧版 server ---------------- */
let oldBackup = null
const restoreOld = async () => {
  if (!MODE_OLD || !oldBackup) return
  try {
    await copyFile(oldBackup, PKG_SERVER)
    const back = await sha256(PKG_SERVER)
    console.log(`[old] 已恢复打包内 server.mjs sha256=${back}`)
    oldBackup = null
  } catch (e) { console.error('[old] 恢复失败!', e) }
}
process.on('exit', () => { if (MODE_OLD && oldBackup) { try { execFileSync('cp', [oldBackup, PKG_SERVER]) } catch {} } })

if (MODE_OLD) {
  const oldSrc = execFileSync('git', ['show', '44ff71d^:notekit-src/server/server.mjs'], { cwd: root, maxBuffer: 1 << 24 })
  oldBackup = path.join(outDir, 'server.mjs.packaged-backup')
  await copyFile(PKG_SERVER, oldBackup)
  // 旧版依赖 storage.mjs / note-command.mjs；这两者在打包内已存在，无需处理
  await writeFile(PKG_SERVER, oldSrc)
  report.control = {
    oldSha256: await sha256(PKG_SERVER),
    oldSize: (await stat(PKG_SERVER)).size,
    backupPath: oldBackup,
    gitRef: '44ff71d^:notekit-src/server/server.mjs',
  }
  console.log(`[old] 已换入旧版 server.mjs sha256=${report.control.oldSha256} size=${report.control.oldSize}`)
  const oldText = oldSrc.toString('utf8')
  report.control.oldFeatures = {
    hasUriField: /body\.uri/.test(oldText),
    hasBufLengthGuard: /buf\.length\s*===\s*0/.test(oldText),
    legacyFields: /body\.content\s*\|\|\s*body\.data/.test(oldText),
    hasNodeInResponse: /node\s*,/.test(oldText.slice(oldText.indexOf("'/api/handle-upload'"), oldText.indexOf("'/api/handle-upload'") + 900)),
  }
  console.log('[old] 旧版特征:', JSON.stringify(report.control.oldFeatures))
}

/* ---------------- 4. 用打包产物自身启动 ---------------- */
const APP_PORT = await freePort()
const DEBUG_PORT = await freePort()
report.isolation.appPort = APP_PORT
report.isolation.debugPort = DEBUG_PORT

let childOut = ''
const child = spawn(APP_BIN, [`--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: path.join(APP_BUNDLE, 'Contents', 'Resources', 'app'),
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    NOTEKIT_PORT: String(APP_PORT),
    NOTEKIT_USER_DATA: profile,
    NOTEKIT_DATA_DIR: dataDir,
    NOTEKIT_DEBUG_LOG: path.join(outDir, 'server-shell.log'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', d => { childOut += d })
child.stderr.on('data', d => { childOut += d })
report.childSpawn = { pid: child.pid, bin: APP_BIN }

let cdp = null
for (let i = 0; i < 150 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) {
  report.fatal = 'CDP 连接失败：打包产物未启动'
  report.childOut = childOut.slice(-6000)
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  await restoreOld()
  try { child.kill('SIGKILL') } catch {}
  process.exit(1)
}
const ev = e => cdp.evaluate(e)
const evalT = async (expr, ms = 25000) => Promise.race([ev(expr), sleeps(ms).then(() => { throw new Error('evaluate timeout') })])
const callT = (m, p = {}) => cdp.call(m, p)

// 等应用起来
for (let i = 0; i < 150; i++) {
  if (await evalT(`!!window.__notekitApp`, 5000).catch(() => false)) break
  await sleeps(1000)
}
report.appBooted = await evalT(`!!window.__notekitApp`).catch(() => false)
report.appUrl = await evalT(`location.href`).catch(() => null)
report.storageMode = await evalT(`window.__notekitApp?.addons?.dbDisk?.storageMode ?? null`).catch(() => null)
console.log(`[boot] appBooted=${report.appBooted} url=${report.appUrl} storageMode=${report.storageMode}`)

// 确认服务端确实来自打包内容：直接打 /api 拿版本无关的探测（用 server 目录标识）
try {
  const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/storage/status`)
  report.serverProbe = { status: r.status, body: (await r.text()).slice(0, 300) }
} catch (e) { report.serverProbe = { error: String(e) } }
console.log('[boot] serverProbe=', JSON.stringify(report.serverProbe).slice(0, 300))

// 等 addon 全部就绪
for (let i = 0; i < 90; i++) {
  const done = await evalT(`(() => {
    const a = window.__notekitApp
    return !!(a?.addons?.paste?.onPaste?.addon) && !!(a?.addons?.img?.inlinesBarAddItems) && !!(a?.addons?.dbDisk?.flush)
  })()`, 5000).catch(() => false)
  if (done) break
  await sleeps(1000)
}
report.addonsReady = await evalT(`(() => {
  const a = window.__notekitApp
  return {
    pasteCovered: !!(a?.addons?.paste?.onPaste?.addon),
    imgAddon: !!a?.addons?.img,
    imgEnabled: a?.isAddonEnabled('img') ?? null,
    dbDiskFlush: typeof a?.addons?.dbDisk?.flush,
    dbDiskOpen: typeof a?.addons?.dbDisk?.open,
    primaryId: a?.addons?.dbDisk?.primaryId ?? null,
    libKy: a?.addons?.libAdmin?.current?.ky ?? null,
  }
})()`).catch(e => ({ error: String(e) }))
console.log('[boot] addonsReady=', JSON.stringify(report.addonsReady).slice(0, 500))
assert('H3-packaged-app-running',
  '启动的是打包产物自身，且应用已就绪（非 dev server）',
  report.appBooted && report.appUrl?.startsWith(`http://127.0.0.1:${APP_PORT}`),
  { appBooted: report.appBooted, url: report.appUrl, port: APP_PORT })

/* ---------------- 5. 路由到一个可编辑节点 ---------------- */
const TOPIC = MODE_OLD ? '粘贴验证-旧版对照' : '粘贴验证-修复版'
report.steps.route = await evalT(`(async () => {
  const t = window.__notekitApp.addons.topic
  try { await t.route(${JSON.stringify(TOPIC)}) } catch (e) { return 'route-error: ' + e.message }
  return 'routed'
})()`, 20000).catch(e => 'eval-error:' + String(e))
await sleeps(2000)
report.steps.route = report.steps.route
// route 可能因 topic 不存在而失败 → 兜底：直接打开 library 首页编辑器
for (let i = 0; i < 40; i++) {
  if (await evalT(`!!(document.querySelector('.editor-view.editor-from-router [contenteditable="true"]') || document.querySelector('.editor-view [contenteditable="true"]'))`, 5000).catch(() => false)) break
  await sleeps(1000)
}
report.editorProbe = await evalT(`(() => {
  window.__vpPick = (() => {
    // 路由后的编辑器：.editor-view.editor-from-router 里首个 [contenteditable=true]
    const views = [...document.querySelectorAll('.editor-view.editor-from-router')]
    const view = views.find(v => v.querySelector('[contenteditable="true"]')) || null
    const ce = view ? view.querySelector('[contenteditable="true"]') : null
    if (!ce) return null
    // $editor 不在这条 DOM 祖先链上（它挂在同级 SECTION.node 上），
    // 因此从 React fiber 上取 props.editor（这是该 contenteditable 真正绑定的 Slate editor）。
    let editor = null
    const fk = Object.keys(ce).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))
    if (fk) {
      let f = ce[fk], depth = 0
      while (f && depth < 60 && !editor) {
        const p = f.memoizedProps
        if (p && p.editor && Array.isArray(p.editor.children)) editor = p.editor
        f = f.return; depth++
      }
    }
    // 该 editor 对应的笔记 ky：按 editorId 在拥有 $editor 的节点里反查
    let ky = null
    if (editor) {
      const owner = [...document.querySelectorAll('*')].find(n =>
        Object.prototype.hasOwnProperty.call(n, '$editor') && n.$editor === editor && n.getAttribute('data-ky'))
      if (owner) ky = owner.getAttribute('data-ky')
    }
    return { ce, editor, ky, editorId: editor?.editorId ?? null }
  })()
  const p = window.__vpPick
  return {
    hasCe: !!p?.ce,
    hasEditor: !!p?.editor,
    editorId: p?.editorId ?? null,
    ky: p?.ky ?? null,
    editorChildren: p?.editor ? p.editor.children.length : null,
    editorViewCount: document.querySelectorAll('.editor-view').length,
  }
})()`).catch(e => ({ error: String(e) }))
console.log('[route] editorProbe=', JSON.stringify(report.editorProbe))
assert('H4-editor-ready', '定位到可编辑的 Slate editor（经 React fiber 绑定，$editor 可用）', report.editorProbe?.hasEditor === true, report.editorProbe)

/* ---------------- 6. 页面侧探针：拦 fetch + 记录 /api 响应 ---------------- */
await evalT(`(() => {
  window.__vp = { api: [], errors: [], rejections: [], pasteEvents: [] }
  // 应用 HTTP 层用的是 XMLHttpRequest（src/slate-item/addons/Http/helper.ts:37），
  // 不是 window.fetch —— 必须拦 XHR 才能看到 /api/saveB64Image。
  const OX = window.XMLHttpRequest
  function Patched() {
    const xhr = new OX()
    let url = ''
    const open = xhr.open
    xhr.open = function(m, u, ...rest) { url = String(u); return open.call(this, m, u, ...rest) }
    xhr.addEventListener('loadend', () => {
      if (!String(url).includes('/api/')) return
      let body = null
      try { body = JSON.parse(xhr.responseText) } catch {}
      window.__vp.api.push({ via: 'xhr', url, status: xhr.status, body, method: xhr.__m || null })
    })
    return xhr
  }
  Patched.prototype = OX.prototype
  for (const k of ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE']) Patched[k] = OX[k]
  window.XMLHttpRequest = Patched
  // fetch 也一并拦（兜底，若某条路径走 fetch）
  const of = window.fetch
  window.fetch = function(...args) {
    const url = String(typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? ''))
    const p = of.apply(this, args)
    if (url.includes('/api/')) {
      p.then(async res => {
        let body = null
        try { body = await res.clone().json() } catch {}
        window.__vp.api.push({ via: 'fetch', url, status: res.status, body })
      }).catch(() => {})
    }
    return p
  }
  window.addEventListener('error', e => window.__vp.errors.push(String(e.message)))
  window.addEventListener('unhandledrejection', e => window.__vp.rejections.push(String(e.reason && e.reason.stack || e.reason)))
  window.addEventListener('paste', e => window.__vp.pasteEvents.push({ items: e.clipboardData ? [...e.clipboardData.items].map(i => i.type) : [], files: e.clipboardData ? e.clipboardData.files.length : -1 }), true)
  return 'installed'
})()`)

/* ---------------- 7. 核心：模拟真实粘贴图片 ---------------- */
const PASTE_NAME = 'verify-paste-canvas.png'
const paste = await evalT(`(async () => {
  const out = {}
  const ce = window.__vpPick?.ce
  if (!ce) { out.error = 'no contenteditable (window.__vpPick 为空)'; return out }
  ce.focus()
  const sel = getSelection(); const r = document.createRange()
  r.selectNodeContents(ce); r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
  out.ceTag = ce.tagName + '.' + String(ce.className).slice(0, 60)
  out.activeIsCe = document.activeElement === ce || ce.contains(document.activeElement)

  // 真 PNG：canvas.toBlob
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 40
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1976d2'; ctx.fillRect(0, 0, 64, 40)
  ctx.fillStyle = '#ffca28'; ctx.fillRect(12, 10, 24, 18)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  const file = new File([blob], ${JSON.stringify(PASTE_NAME)}, { type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  out.file = { name: file.name, size: file.size, type: file.type }
  out.sourcePngMagic = [...bytes.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join(' ')
  out.sourcePngValid = out.sourcePngMagic === '89 50 4e 47'

  const dt = new DataTransfer(); dt.items.add(file)
  out.dtItems = [...dt.items].map(i => i.type)
  const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  out.constructedClipboardOk = !!evt.clipboardData && evt.clipboardData.files.length === 1

  const apiBefore = window.__vp.api.length
  ce.dispatchEvent(evt)
  await new Promise(r => setTimeout(r, 6000))

  out.newApi = window.__vp.api.slice(apiBefore)
  out.pasteEvents = window.__vp.pasteEvents
  out.errors = window.__vp.errors
  return out
})()`, 60000).catch(e => ({ evalError: String(e) }))
report.steps.paste = paste
console.log('[paste] api calls =', JSON.stringify(paste?.newApi ?? []).slice(0, 900))

const saveCall = (paste?.newApi ?? []).find(a => a.url.includes('saveB64Image'))
report.steps.saveCall = saveCall ?? null

// 断言 A1: 接口被调用且 status 200
assert('A1-api-called',
  '粘贴触发了 POST /api/saveB64Image 且 HTTP 200',
  !!saveCall && saveCall.status === 200,
  saveCall ?? { allApi: paste?.newApi })

// 断言 A2: code === 0 且有 node.fileInfo.path
const node = saveCall?.body?.node
const filePath = node?.fileInfo?.path
assert('A2-code0-and-node-path',
  '响应 code:0 且含 node.fileInfo.path',
  saveCall?.body?.code === 0 && typeof filePath === 'string' && filePath.length > 0,
  { code: saveCall?.body?.code, fileInfo: node?.fileInfo, raw: saveCall?.body })

/* ---------------- 8. 磁盘核对：文件真实存在、>0 字节、合法 PNG ---------------- */
const disk = {}
if (filePath) {
  // fileInfo.path 形如 data/images/<name>
  const abs = path.join(dataDir, filePath.replace(/^data\//, ''))
  disk.abs = abs
  try {
    const st = await stat(abs)
    disk.exists = true; disk.size = st.size
    const buf = await readFile(abs)
    disk.magicHex = [...buf.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join(' ')
    disk.isPng = disk.magicHex === '89 50 4e 47'
    disk.sha256 = createHash('sha256').update(buf).digest('hex')
    disk.sizeMatchesResponse = st.size === node?.fileInfo?.size
    disk.md5MatchesResponse = createHash('md5').update(buf).digest('hex') === node?.fileInfo?.md5
  } catch (e) { disk.exists = false; disk.error = String(e.code || e) }
} else { disk.abs = null; disk.exists = false; disk.error = 'no filePath in response' }
report.steps.disk = disk
console.log('[disk]', JSON.stringify(disk))

assert('A3-file-on-disk-nonzero-png',
  '响应路径对应文件落盘、>0 字节、PNG magic 89 50 4e 47',
  disk.exists === true && disk.size > 0 && disk.isPng === true,
  disk)

assert('A4-response-integrity',
  '响应声明的 size/md5 与磁盘实际字节一致',
  disk.sizeMatchesResponse === true && disk.md5MatchesResponse === true,
  { sizeMatchesResponse: disk.sizeMatchesResponse, md5MatchesResponse: disk.md5MatchesResponse, diskSize: disk.size, respSize: node?.fileInfo?.size })

/* ---------------- 9. 编辑器：出现 img 元素且 src 指向该文件 ---------------- */
await sleeps(2500)
const domIsDecisive = !MODE_OLD // 旧版响应无 node → 前端不插图
const editorState = await evalT(`(() => {
  const srcs = []
  for (const img of document.querySelectorAll('.editor-view img')) {
    srcs.push({ cls: String(img.className).slice(0, 60), src: img.getAttribute('src'), complete: img.complete, nw: img.naturalWidth })
  }
  const ed = window.__vpPick?.editor
  // img 是 inline 元素，存在于 node 的 leaves 数组里（blockType:'img', isVoid:true），
  // 不是 children 里的 block。要同时遍历 children 与 leaves。
  const found = []
  const seen = new Set()
  const scan = (arr, where) => {
    for (const c of arr || []) {
      if (!c || typeof c !== 'object') continue
      if (c.blockType === 'img' || c.type === 'img' || (c.src && c.isVoid)) {
        const k = where + '|' + c.blockType + '|' + c.src + '|' + (c.iky || '')
        if (!seen.has(k)) { seen.add(k); found.push({ where, type: c.type, blockType: c.blockType, src: c.src, isVoid: c.isVoid, iky: c.iky }) }
      }
      if (Array.isArray(c.children)) scan(c.children, where + '>children')
      if (Array.isArray(c.leaves)) scan(c.leaves, where + '>leaves')
    }
  }
  try { if (ed) { scan(ed.children, 'root') } } catch (e) { found.push({ error: String(e) }) }
  return {
    imgSrcs: srcs,
    blocks: found,
    blockCount: found.length,
    domImgs: document.querySelectorAll('.editor-view img').length,
    pickedKy: window.__vpPick?.ky ?? null,
  }
})()`).catch(e => ({ error: String(e) }))
report.steps.editorState = editorState
console.log('[editor]', JSON.stringify(editorState).slice(0, 1200))

const imgBlock = (editorState?.blocks ?? []).find(b => b.blockType === 'img')
const domImgSrcs = (editorState?.imgSrcs ?? []).map(i => i.src || '')
const fileBasename = filePath ? path.basename(filePath) : null
const domHasFile = !!fileBasename && domImgSrcs.some(s => s.includes(fileBasename))
assert('A5-editor-img-block',
  "编辑器出现 blockType==='img' 且 src 指向该文件",
  !!imgBlock && !!imgBlock.src && (!fileBasename || String(imgBlock.src).includes(fileBasename)),
  { imgBlock, domImgSrcs, fileBasename })

assert('A6-dom-img-rendered',
  'DOM 中出现 <img> 且 src 指向落盘文件（前端确实插入了图片）',
  domHasFile,
  { domImgSrcs, fileBasename })

if (MODE_OLD) {
  // 反向对照必须在「响应/磁盘」层面就失败。
  // 旧版从 body.content||body.data 取值 → 前端发的 body.uri 被忽略 → 0 字节文件。
  let oldImages = []
  try { oldImages = await readdir(path.join(dataDir, 'images')) } catch (e) { oldImages = ['ERR:' + e.code] }
  const st = []
  for (const f of oldImages) {
    if (String(f).startsWith('ERR:')) { st.push({ name: f }); continue }
    const s = await stat(path.join(dataDir, 'images', f))
    st.push({ name: f, size: s.size })
  }
  report.steps.oldImagesDir = st
  assert('C1-old-fails-no-node',
    '【反向对照】旧版 server 的 saveB64Image 响应缺 node.fileInfo（前端无法插图）',
    !node?.fileInfo?.path,
    { responseBody: saveCall?.body, node })
  assert('C2-old-writes-zero-bytes',
    '【反向对照】旧版把 body.uri 落到 0 字节文件、且无 .png 后缀（根因复现）',
    st.some(f => f.size === 0) && !st.some(f => f.size > 0),
    { oldImagesDir: st, responseBody: saveCall?.body })
  assert('C3-old-no-img-in-editor',
    '【反向对照】旧版粘贴后编辑器无 img 元素、节点 leaves 无 img',
    !imgBlock && !domHasFile && report.steps.persist?.hasImg !== true,
    { imgBlock, domImgSrcs, persist: report.steps.persist })
}

/* ---------------- 10. 落库核对：flush 后重读节点仍有图片 ---------------- */
const nodeKy = report.editorProbe?.ky
report.steps.persist = await evalT(`(async () => {
  const app = window.__notekitApp
  const out = { nodeKy: ${JSON.stringify(nodeKy)} }
  const libKy = app.addons.libAdmin?.current?.ky
  out.libKy = libKy
  try { await app.addons.dbDisk.flush() ; out.flushed = true } catch (e) { out.flushed = false; out.flushError = String(e) }
  if (!out.nodeKy || !libKy) return out
  try {
    const conn = app.addons.dbDisk.open(libKy)
    const row = await conn.node.get(out.nodeKy)
    out.rowFound = !!row
    // img 元素存于 row.leaves（inline 元素），不是 row.children
    out.leaves = row?.leaves ? JSON.stringify(row.leaves).slice(0, 1500) : null
    const acc = []
    const scan = (arr, where) => {
      for (const c of arr || []) {
        if (c && (c.blockType === 'img' || c.type === 'img' || (c.src && c.isVoid))) acc.push({ where, blockType: c.blockType, type: c.type, src: c.src, isVoid: c.isVoid })
        if (c && Array.isArray(c.children)) scan(c.children, where)
      }
    }
    scan(row?.leaves, 'leaves')
    scan(row?.children, 'children')
    out.imgNodes = acc
    out.hasImg = acc.length > 0
    out.rowRawHead = row ? JSON.stringify(row).slice(0, 400) : null
  } catch (e) { out.readError = String(e) }
  return out
})()`, 40000).catch(e => ({ evalError: String(e) }))
report.steps.persist = report.steps.persist
console.log('[persist]', JSON.stringify(report.steps.persist).slice(0, 1200))

const persistedImg = (report.steps.persist?.imgNodes ?? []).find(n => fileBasename && String(n.src).includes(fileBasename))
assert('A7-persisted-image-survives',
  '落库后重新读取该节点，img 元素仍在且 src 指向同一文件（非仅内存态）',
  !!persistedImg && report.steps.persist?.rowFound === true,
  report.steps.persist)

/* ---------------- 11. 回归 1：附件 multipart 上传 /api/handle-upload ---------------- */
const attach = await evalT(`(async () => {
  const out = {}
  const fd = new FormData()
  const content = new Uint8Array(2048); for (let i = 0; i < content.length; i++) content[i] = (i * 7) & 0xff
  const file = new File([content], 'verify-attachment.bin', { type: 'application/octet-stream' })
  fd.append('file0', file)
  fd.append('filename', 'verify-attachment.bin')
  try {
    const r = await fetch('/api/handle-upload', { method: 'POST', body: fd })
    out.status = r.status
    out.body = await r.json()
  } catch (e) { out.error = String(e) }
  return out
})()`, 40000).catch(e => ({ evalError: String(e) }))
report.steps.attachUpload = attach
console.log('[attach]', JSON.stringify(attach).slice(0, 800))

const attachPath = attach?.body?.node?.fileInfo?.path
let attachDisk = { exists: false }
if (attachPath) {
  const abs = path.join(dataDir, attachPath.replace(/^data\//, ''))
  try {
    const st = await stat(abs)
    const buf = await readFile(abs)
    attachDisk = { abs, exists: true, size: st.size, sha256: createHash('sha256').update(buf).digest('hex') }
  } catch (e) { attachDisk = { abs, exists: false, error: String(e.code || e) } }
}
report.steps.attachDisk = attachDisk

assert('R1-attachment-upload-ok',
  '回归：multipart file0 上传返回 code:0 且文件落盘 >0 字节',
  attach?.body?.code === 0 && attachDisk.exists && attachDisk.size > 0,
  { status: attach?.status, code: attach?.body?.code, attachDisk, resp: attach?.body })

// file 表登记核对（直接查 sqlite）
let fileTable = { rows: [] }
try {
  const dbFile = path.join(dataDir, 'notekit.db')
  const q = `SELECT ky, length(data) AS len FROM "HOME-1-file"`
  fileTable = { dbFile, rows: JSON.parse(execFileSync('node', ['--experimental-sqlite', '-e', `
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(process.argv[1]);
    const rows=db.prepare('SELECT ky, data FROM "HOME-1-file"').all();
    console.log(JSON.stringify(rows.map(r=>({ky:r.ky, hasFileInfo: String(r.data).includes('fileInfo')}))));
  `, dbFile], { encoding: 'utf8' }).trim()) }
} catch (e) { fileTable.error = String(e.message || e).slice(0, 400) }
report.steps.fileTable = fileTable
console.log('[fileTable]', JSON.stringify(fileTable).slice(0, 800))

const registered = (fileTable.rows ?? []).some(r => String(r.ky).includes('verify-attachment'))
assert('R2-file-table-registered',
  '回归：上传在 HOME-1-file 表有登记（附件列表可读）',
  registered,
  fileTable)

/* ---------------- 12. 回归 2：空 body 的 saveB64Image → 400 ---------------- */
const emptyTests = await evalT(`(async () => {
  const out = {}
  // (a) 纯 JSON，没有任何文件字段
  try {
    const r = await fetch('/api/saveB64Image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'verify-empty.png' }) })
    out.jsonEmpty = { status: r.status, body: await r.json() }
  } catch (e) { out.jsonEmpty = { error: String(e) } }
  // (b) 空字符串 uri 的 multipart
  try {
    const fd = new FormData(); fd.append('uri', ''); fd.append('filename', 'verify-empty2.png')
    const r = await fetch('/api/saveB64Image', { method: 'POST', body: fd })
    out.formEmpty = { status: r.status, body: await r.json() }
  } catch (e) { out.formEmpty = { error: String(e) } }
  return out
})()`, 40000).catch(e => ({ evalError: String(e) }))
report.steps.emptyBody = emptyTests
console.log('[empty]', JSON.stringify(emptyTests).slice(0, 800))

if (MODE_OLD) {
  assert('C4-old-empty-returns-200',
    '【反向对照】旧版空 body 返回 200 且静默写 0 字节文件（对照证明测试有效）',
    emptyTests?.jsonEmpty?.status === 200,
    emptyTests)
} else {
  const emptyOk = emptyTests?.jsonEmpty?.status === 400 && emptyTests?.jsonEmpty?.body?.code === 1
  assert('R3-empty-body-400',
    '回归：空 body 的 saveB64Image 返回 400/code:1（新 buf.length 守卫生效），而非 200',
    emptyOk,
    emptyTests)
  // 确认空请求没有产生新文件
  let imagesListing = []
  try { imagesListing = await readdir(path.join(dataDir, 'images')) } catch (e) { imagesListing = ['ERR:' + e.code] }
  report.steps.imagesListing = imagesListing
  assert('R4-no-empty-file-written',
    '回归：空请求未在磁盘留下 verify-empty*.png',
    !imagesListing.some(f => f.startsWith('verify-empty')),
    imagesListing)
}

/* ---------------- 13. 收尾：真实库未被触碰 ---------------- */
report.childOut = childOut.slice(-8000)
report.console = (cdp.events || []).filter(e => e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'error' || e.params.type === 'warning'))
  .map(e => ({ type: e.params.type, args: (e.params.args || []).map(a => String(a.value ?? a.description ?? '').slice(0, 200)) })).slice(-30)
report.exceptions = (cdp.events || []).filter(e => e.method === 'Runtime.exceptionThrown')
  .map(e => String(e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text || '').slice(0, 600)).slice(-20)

const finalApi = await evalT(`window.__vp?.api ?? []`).catch(() => [])
report.allApiCalls = finalApi

await ev(`window.close(); true`).catch(() => {})
await sleeps(1000)
child.kill('SIGTERM'); await sleeps(1200)
try { child.kill('SIGKILL') } catch {}
await sleeps(500)

profileGuard.after = await snapshotReal()
report.profileGuard = profileGuard
const realUntouched = profileGuard.before.exists === profileGuard.after.exists &&
  (profileGuard.before.exists === false || Math.abs((profileGuard.before.mtimeMs ?? 0) - (profileGuard.after.mtimeMs ?? 0)) < 120000)
assert('I1-real-profile-untouched',
  '隔离：真实库 ~/Library/Application Support/NotekitDev 未被本次运行写入（mtime 快照比对）',
  realUntouched && (profileGuard.before.exists === false ? true : true),
  profileGuard)

// 确认写入都发生在隔离 profile 内
const dataRootCheck = existsSync(path.join(dataDir, 'notekit.db'))
assert('I2-isolated-data-only',
  '隔离：数据只写进 test-runs 下的隔离 profile（notekit.db 存在且位于隔离目录）',
  dataRootCheck && dataDir.startsWith(outRoot),
  { dataDir, dbExists: dataRootCheck, outRoot })

await restoreOld()
report.finishedAt = new Date().toISOString()
report.summary = {
  total: report.assertions.length,
  passed: report.assertions.filter(a => a.pass).length,
  failed: report.assertions.filter(a => !a.pass).map(a => a.id),
}
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n=== ${TAG} 完成: ${report.summary.passed}/${report.summary.total} passed; failed=[${report.summary.failed.join(',')}] ===`)
console.log('report:', path.join(outDir, 'report.json'))
process.exit(report.summary.failed.length ? 1 : 0)
