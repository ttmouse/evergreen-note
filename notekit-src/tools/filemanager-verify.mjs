/**
 * File Manager（文件管理）浮窗验收（隔离实例，不动用户数据）
 *
 * 用法：node tools/filemanager-verify.mjs
 * 可选环境变量：
 *   NOTEKIT_TEST_PROFILE=<dir>   复用现有 profile（如真实数据副本），不 wipe
 *   NOTEKIT_ELECTRON_BIN=<bin>   指定 Electron 二进制（默认 node_modules 内）
 *   SKIP_UPLOAD=1                跳过上传/列表/删除链路（只测 UI 空态与交互）
 *
 * 前置：npm run build（验证 dist 产物）。
 * 输出：test-runs/filemanager-verify/result.json + 截图 + 终端逐项结论。
 *
 * 覆盖场景：
 *   S1 调出 File Manager 浮窗 → dialog DOM 存在、有标题
 *   S2 无文件时主体显示空态提示（不是空白编辑器）
 *   S3 打开浮窗过程无未捕获异常 / console error
 *   S4 按住标题栏拖动 → 浮窗位置变化
 *   S5 最小化（foldup）交互生效并可还原
 *   S6 关闭（X）交互生效
 *   U1 multipart 上传附件 → code 0 + node.fileInfo 契约 + 落盘非空 + file 表登记
 *   U2 base64 上传图片 → 同上（images/）
 *   U3 逻辑路径 data/... 可直接 GET（img src 可用）
 *   U4 页面内走 img.uploadDataURL 真实客户端链路 → node 返回 + 服务可取
 *   U5 重开 File Manager → 列表展示已上传文件（名称/大小）
 *   U6 delete-file → 磁盘与登记同步删除，列表不再展示
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'filemanager-verify')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const reuseProfile = !!process.env.NOTEKIT_TEST_PROFILE
const profile = reuseProfile ? path.resolve(process.env.NOTEKIT_TEST_PROFILE) : path.join(outDir, 'profile')
await mkdir(outDir, { recursive: true })
if (!reuseProfile) {
  await rm(profile, { recursive: true, force: true })
  await mkdir(profile, { recursive: true })
}

let child = null
const ELECTRON_BIN = process.env.NOTEKIT_ELECTRON_BIN
  || path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const startApp = async () => {
  const debugPort = await freePort()
  child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
    cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', d => { logs += d })
  child.stderr.on('data', d => { logs += d })
  let cdp = null
  for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
  if (!cdp) { throw new Error('CDP 未就绪\n' + logs.slice(-1500)) }
  cdp.logs = () => logs
  return cdp
}
const stopApp = async () => {
  if (!child) return
  child.kill('SIGTERM')
  await sleeps(1200)
  try { child.kill('SIGKILL') } catch {}
  child = null
}

let cdp = await startApp()
// 每 2s 探测 server 存活，记录死之时间点
let serverAlive = true
const serverDiedAt = []
const serverProbe = setInterval(async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/get-need-sync`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) throw 0
    serverAlive = true
  } catch {
    if (serverAlive) { serverDiedAt.push(new Date().toISOString()); console.log(`⚠️ server 探测失败 @ ${serverDiedAt.at(-1)}`) }
    serverAlive = false
  }
}, 2000)
const results = []
const failures = []
const shot = async name => {
  const s = await callWithTimeout('Page.captureScreenshot', { format: 'png' }, 15000).catch(() => null)
  if (s?.data) await writeFile(path.join(outDir, name), Buffer.from(s.data, 'base64'))
}
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)?.slice(0, 500)}`)
  if (!ok) failures.push(name)
}

const evalWithTimeout = (expression, ms = 15000) => Promise.race([
  cdp.evaluate(expression),
  sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) }),
])
const callWithTimeout = (method, params = {}, ms = 15000) => Promise.race([
  cdp.call(method, params),
  sleeps(ms).then(() => { throw new Error(`${method} 超时 ${ms}ms`) }),
])
const consoleErrors = () => cdp.events
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
  .map(e => JSON.stringify(e.params).slice(0, 800))

process.on('unhandledRejection', () => {})

// ---- 启动等待应用就绪 ----
let ready = false
for (let i = 0; i < 120 && !ready; i++) {
  ready = await evalWithTimeout(`!!window.__notekitApp`).catch(() => false)
  if (!ready) await sleeps(1000)
}
if (!ready) { console.error('❌ 应用未就绪'); console.error(cdp.logs().slice(-2000)); await stopApp(); process.exit(1) }
let editorReady = false
for (let i = 0; i < 60 && !editorReady; i++) {
  editorReady = await evalWithTimeout(`!!document.querySelector('[contenteditable="true"]')`).catch(() => false)
  if (!editorReady) await sleeps(1000)
}
check('S0 应用就绪且编辑器渲染', editorReady, { logs: cdp.logs().slice(-500) })

const openFM = async () => {
  await evalWithTimeout(`(async () => {
    window.__notekitApp.addons.filemanager.showFileManagerDialog()
    return true
  })()`, 10000)
  await sleeps(1200)
}
const fmState = () => evalWithTimeout(`(() => {
  const dlg = document.querySelector('.filemanager-dialog')
  if (!dlg) return { exists: false }
  // 注意：标题栏按钮组（nui-symbol-list-body）也带 node-body 类，必须用 nui-dialog-body 才能命中真主体
  const body = dlg.querySelector('.nui-dialog-body')
  return {
    exists: true,
    id: dlg.id,
    folded: dlg.classList.contains('is-foldup'),
    title: dlg.querySelector('.nui-dialog-title, .node-text')?.textContent.trim() ?? null,
    bodyText: body?.textContent.trim().slice(0, 400) ?? null,
    bodyChildCount: body?.children.length ?? -1,
    hasEditable: !!dlg.querySelector('.nui-dialog-body [contenteditable="true"]'),
  }
})()`)

const errCountBefore = consoleErrors().length
await openFM()
const s1 = await fmState()
check('S1 File Manager 浮窗已打开且有标题', s1.exists && !!(s1.title || '').match(/File Manager|文件管理/), s1)
const modalInfo = await evalWithTimeout(`(() => {
  const dlg = document.querySelector('.filemanager-dialog')
  const mask = document.querySelector('.nui-mask')
  return {
    modal: dlg?.classList.contains('app-modal') ?? false,
    mask: !!mask,
    maskColor: mask ? getComputedStyle(mask).backgroundColor : null,
  }
})()`)
check('S1b File Manager 使用统一模态蒙层', modalInfo.modal && modalInfo.mask && modalInfo.maskColor === 'rgba(30, 41, 59, 0.42)', modalInfo)

// ---- S2: 空态提示（非空白），数据加载是异步的，轮询等待最多 10s ----
let s2 = null
for (let i = 0; i < 20; i++) {
  s2 = await fmState()
  if (/暂无文件|No files yet|正在加载|Loading/.test(s2.bodyText || '')) break
  await sleeps(500)
}
const emptyHint = /暂无文件|No files yet/.test(s2.bodyText || '')
const hasList = /\.\w{1,5}|Bytes|KB|MB|Cloud Only|Synced|Local Only/.test(s2.bodyText || '')
const blankEditor = s2.hasEditable && (s2.bodyText || '').trim() === ''
if (!emptyHint && !hasList) {
  const html = await evalWithTimeout(`document.querySelector('.filemanager-dialog .nui-dialog-body')?.innerHTML.slice(0, 800) ?? 'null'`).catch(e => String(e))
  console.log('   [诊断] body innerHTML:', String(html).slice(0, 500))
}
check('S2 主体渲染内容（空态提示或文件列表，非空白）', s2.exists && (emptyHint || hasList) && !blankEditor, s2)
await sleeps(800) // 等 snack 消失再截图
await shot(`fm-empty-${Date.now()}.png`)

// ---- S3: 无新增 console 错误 ----
const newErrs = consoleErrors().slice(errCountBefore)
check('S3 打开浮窗无新增异常/console error', newErrs.length === 0, newErrs.slice(0, 3))

// ---- S4: 拖动 ----
{
  const headBox = await evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    const head = dlg?.querySelector('.nui-dialog-head')
    if (!head) return null
    const r = head.getBoundingClientRect()
    return { x: Math.round(r.left + Math.min(r.width / 2, 200)), y: Math.round(r.top + Math.min(15, r.height / 2)), dlgLeft: dlg.getBoundingClientRect().left, dlgTop: dlg.getBoundingClientRect().top }
  })()`)
  if (headBox) {
    const before = { left: headBox.dlgLeft, top: headBox.dlgTop }
    await callWithTimeout('Input.dispatchMouseEvent', { type: 'mousePressed', x: headBox.x, y: headBox.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 10; i++) {
      await callWithTimeout('Input.dispatchMouseEvent', { type: 'mouseMoved', x: headBox.x + i * 15, y: headBox.y + i * 8, button: 'left', buttons: 1 })
      await sleeps(30)
    }
    await callWithTimeout('Input.dispatchMouseEvent', { type: 'mouseReleased', x: headBox.x + 150, y: headBox.y + 80, button: 'left', clickCount: 1 })
    await sleeps(600)
    const after = await evalWithTimeout(`(() => {
      const dlg = document.querySelector('.filemanager-dialog')
      const r = dlg.getBoundingClientRect()
      return { left: r.left, top: r.top }
    })()`)
    const moved = Math.abs(after.left - before.left) + Math.abs(after.top - before.top)
    check('S4 按住标题栏可拖动浮窗', moved > 20, { before, after, moved })
  } else {
    check('S4 按住标题栏可拖动浮窗', false, '找不到 .nui-dialog-head')
  }
}

// ---- S4b: pin 切换（点一次取消置顶，再点一次恢复） ----
{
  const pinState = () => evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    return { exists: !!dlg, pinned: dlg?.classList.contains('is-pin') ?? null }
  })()`)
  const before = await pinState()
  await evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    dlg.querySelectorAll('.nui-dialog-extra .nui-symbol, .node-extra .nui-symbol')[0]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`)
  await sleeps(400)
  const after = await pinState()
  await evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    dlg.querySelectorAll('.nui-dialog-extra .nui-symbol, .node-extra .nui-symbol')[0]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`)
  await sleeps(400)
  const restored = await pinState()
  check('S4b pin 点击切换置顶并可恢复', before.exists && after.exists && before.pinned === true && after.pinned === false && restored.pinned === true, { before, after, restored })
}

// ---- S5: 最小化交互 ----
{
  await evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    const symbols = dlg.querySelectorAll('.nui-dialog-extra .nui-symbol, .node-extra .nui-symbol')
    for (const el of symbols) { if (el.querySelector('svg')) { /* 顺序: pin, minus, close */ } }
    // 点第二个（minus/最小化）
    symbols[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`)
  await sleeps(600)
  const folded = await evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    return dlg ? { exists: true, folded: dlg.classList.contains('is-foldup'), display: getComputedStyle(dlg).display } : { exists: false }
  })()`)
  check('S5 最小化（foldup）生效', folded.exists && folded.folded, folded)
  await evalWithTimeout(`(() => { window.__notekitApp.addons.floatViewer.unfold('floatview-AppFileManager'); return true })()`).catch(e => console.log('   unfold 失败:', String(e).slice(0, 120)))
  await sleeps(400)
}

// ---- S6: 关闭交互 ----
{
  await evalWithTimeout(`(() => {
    const dlg = document.querySelector('.filemanager-dialog')
    const symbols = dlg.querySelectorAll('.nui-dialog-extra .nui-symbol, .node-extra .nui-symbol')
    symbols[symbols.length - 1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })()`)
  await sleeps(800)
  const gone = await evalWithTimeout(`!document.querySelector('.filemanager-dialog')`)
  check('S6 关闭（X）生效', gone === true, { gone })
}

// ---- S6b: 蒙层点击关闭（置顶窗口也应响应模态点击外部） ----
await openFM()
{
  const size = await evalWithTimeout(`({ width: innerWidth, height: innerHeight })`)
  await callWithTimeout('Input.dispatchMouseEvent', { type: 'mousePressed', x: size.width - 10, y: size.height - 10, button: 'left', clickCount: 1 })
  await callWithTimeout('Input.dispatchMouseEvent', { type: 'mouseReleased', x: size.width - 10, y: size.height - 10, button: 'left', clickCount: 1 })
  await sleeps(900)
  const gone = await evalWithTimeout(`!document.querySelector('.filemanager-dialog')`)
  check('S6b 点击灰色蒙层关闭窗口', gone, { gone })
}

// ---- S6c: Andy 模式的窗口不显示模态蒙层 ----
await openFM()
await evalWithTimeout(`window.__notekitApp.addons.floatViewer.setMode('floatview-AppFileManager', 'andy')`)
await sleeps(300)
const andyMaskHidden = await evalWithTimeout(`({
  dialog: !!document.querySelector('.filemanager-dialog'),
  mode: document.querySelector('.filemanager-dialog')?.getAttribute('dialog-list-mode'),
  mask: !!document.querySelector('.nui-mask'),
})`)
check('S6c 切入 Andy 模式时隐藏模态蒙层', andyMaskHidden.dialog && andyMaskHidden.mode === 'andy' && !andyMaskHidden.mask, andyMaskHidden)
await evalWithTimeout(`window.__notekitApp.addons.floatViewer.setMode('floatview-AppFileManager', 'fixed')`)
await evalWithTimeout(`window.__notekitApp.addons.dialog.close('floatview-AppFileManager')`)
await sleeps(300)

if (!process.env.SKIP_UPLOAD) {
  // ---- U1: multipart 上传附件 ----
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const fileBuf = Buffer.from('hello filemanager 附件内容 ' + 'x'.repeat(2048))
  const up1 = await fetch(`http://127.0.0.1:${APP_PORT}/api/handle-upload`, {
    method: 'POST',
    body: (() => { const fd = new FormData(); fd.append('file0', new Blob([fileBuf], { type: 'text/plain' }), '验收附件.txt'); return fd })(),
  }).then(r => r.json()).catch(e => ({ error: String(e) }))
  const u1ok = up1.code === 0 && up1.node?.fileInfo?.path === 'data/files/验收附件.txt' && up1.node.fileInfo.size === fileBuf.length
  let disk1 = 0
  try { disk1 = (await stat(path.join(profile, 'library', 'files', '验收附件.txt'))).size } catch {}
  let row1 = null
  try {
    const db = new DatabaseSync(path.join(profile, 'library', 'notekit.db'), { readOnly: true })
    row1 = db.prepare(`SELECT data FROM "HOME-1-file" WHERE ky='data/files/验收附件.txt'`).get()
  } catch (e) { row1 = { error: String(e) } }
  check('U1 multipart 上传：契约/落盘/登记', u1ok && disk1 === fileBuf.length && !!row1?.data, { up1, disk1, row1: typeof row1?.data === 'string' ? JSON.parse(row1.data).fileInfo : row1 })

  // ---- U2: base64 上传图片 ----
  const up2 = await fetch(`http://127.0.0.1:${APP_PORT}/api/saveB64Image`, {
    method: 'POST',
    body: (() => { const fd = new FormData(); fd.append('uri', `data:image/png;base64,${png1x1.toString('base64')}`); fd.append('filename', '验收图片'); return fd })(),
  }).then(r => r.json()).catch(e => ({ error: String(e) }))
  const u2ok = up2.code === 0 && up2.node?.fileInfo?.path === 'data/images/验收图片.png' && up2.node.fileInfo.size === png1x1.length && up2.node.fileInfo.type === 'image/png'
  check('U2 base64 图片上传：契约/落盘', u2ok, up2)

  // ---- U3: 逻辑路径可直接 GET ----
  const g1 = await fetch(`http://127.0.0.1:${APP_PORT}/data/files/${encodeURIComponent('验收附件.txt')}`).then(r => r.arrayBuffer().then(b => ({ status: r.status, buf: Buffer.from(b) }))).catch(e => ({ status: 0, err: String(e) }))
  const g1ok = g1.status === 200 && g1.buf.equals(fileBuf)
  const g2 = await fetch(`http://127.0.0.1:${APP_PORT}/data/images/${encodeURIComponent('验收图片.png')}`).then(r => r.status).catch(() => 0)
  check('U3 data/... 逻辑路径可取文件', g1ok && g2 === 200, { g1: g1.status, len: g1.buf?.length, g2 })

  // ---- U4: 页面内真实客户端链路 uploadDataURL ----
  {
    const client = await evalWithTimeout(`(async () => {
      const $ = window.__notekitApp.addons
      const dataURL = 'data:image/png;base64,${png1x1.toString('base64')}'
      const res = await $.img.uploadDataURL(dataURL, 'client-path.png')
      let served = false
      try { served = (await fetch(res.node.fileInfo.path)).status === 200 } catch {}
      return { path: res.node?.fileInfo?.path, size: res.node?.fileInfo?.size, served }
    })()`, 20000).catch(e => ({ error: String(e).slice(0, 300) }))
    check('U4 页面内 uploadDataURL 客户端链路', client.path === 'data/images/client-path.png' && client.size === png1x1.length && client.served, client)
  }

  // ---- U5: 重开 File Manager，列表展示文件 ----
  await openFM()
  await sleeps(1500)
  const s5 = await fmState()
  const listed = (s5.bodyText || '').includes('验收附件.txt') && (s5.bodyText || '').includes('验收图片.png')
  check('U5 列表展示已上传文件', s5.exists && listed, { bodyText: s5.bodyText })
  await shot(`fm-list-${Date.now()}.png`)

  // ---- U5b: 文件行「查找引用」全链路 ----
  // 真实搜索 UI 是 SearchDialog addon 的 MUI 弹窗（.dialog-outer + #search-dialog-input），
  // 由 cover($.search.showDialog) 覆写实现，不经过 AppSearch 节点
  {
    // 先往当前笔记插入对验收图片.png 的引用（img 元素），保证 file() 搜索有命中
    const refInserted = await evalWithTimeout(`(async () => {
      const $ = window.__notekitApp.addons
      const editor = window.$editor
      if (!editor) return false
      const el = $.attachment.createElement({ path: 'data/files/验收附件.txt', name: '验收附件.txt', type: 'text/plain', size: ${fileBuf.length}, ext: 'txt', md5: '' })
      editor.insertFragment([el, { text: '' }])
      await new Promise(r => setTimeout(r, 800))
      return !!document.querySelector('.editor-view [class*="attachment"], .editor-view .element-attachment')
    })()`, 15000).catch(e => 'err:' + String(e).slice(0, 120))
    const dialogsBefore = await evalWithTimeout(`document.querySelectorAll('.dialog-outer').length`)
    await evalWithTimeout(`(() => {
      // 行节点带 data-ky="data/files/<名>-view"，按属性精确定位，避免命中外层容器
      const btn = document.querySelector('.filemanager-dialog section.node[data-ky="data/files/验收附件.txt-view"] section[aria-label="Find references"]')
        || document.querySelector('.filemanager-dialog section[aria-label="Find references"]')
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return !!btn
    })()`)
    await sleeps(2000)
    const searchOpened = await evalWithTimeout(`(() => {
      const dlg = document.querySelector('.dialog-outer')
      const input = dlg?.querySelector('#search-dialog-input')
      return {
        found: !!dlg,
        hasInput: !!input,
        inputValue: input?.value ?? null,
        resultItems: dlg?.querySelectorAll('.search-result-item').length ?? 0,
        resultText: dlg?.querySelector('.search-result-item .node-head')?.textContent?.slice(0, 60) ?? null,
      }
    })()`)
    check('U5b 查找引用点击弹出搜索浮窗并自动填入 file() 关键词',
      refInserted === true && searchOpened.found && searchOpened.hasInput && (searchOpened.inputValue || '').includes('file(验收附件.txt)'),
      { refInserted, ...searchOpened })
    check('U5b 搜索结果命中引用笔记', (searchOpened.resultItems ?? 0) >= 1 && (searchOpened.resultText || '').length > 0, searchOpened)
    // 点击结果 → 路由切换 + 浮窗关闭
    const pathBefore = await evalWithTimeout(`location.pathname`)
    await evalWithTimeout(`(() => {
      document.querySelector('.dialog-outer .search-result-item')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`)
    await sleeps(1800)
    const pathAfter = await evalWithTimeout(`location.pathname`)
    const closed = await evalWithTimeout(`!document.querySelector('.dialog-outer')`)
    check('U5b 点击搜索结果路由到对应笔记并关闭浮窗', pathAfter !== pathBefore && closed, { pathBefore, pathAfter, closed })
  }

  // ---- U5c: 文件行「云删除」点击 → 确认框弹出，取消后不删 ----
  {
    const rowsBefore = (await fmState()).bodyText || ''
    await evalWithTimeout(`(() => {
      const btn = document.querySelector('.filemanager-dialog .nui-dialog-body section[aria-label="Delete from Cloud"]')
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return !!btn
    })()`)
    await sleeps(800)
    const confirmBox = await evalWithTimeout(`(() => {
      const box = [...document.querySelectorAll('[role="dialog"], .nui-dialog')].find(d => (d.textContent || '').includes('delete this file from the cloud'))
      return box ? { exists: true, text: box.textContent.trim().slice(0, 120) } : { exists: false }
    })()`)
    check('U5c 云删除点击弹出确认框', confirmBox.exists, confirmBox)
    if (confirmBox.exists) {
      await evalWithTimeout(`(() => {
        const box = [...document.querySelectorAll('[role="dialog"], .nui-dialog')].find(d => (d.textContent || '').includes('delete this file from the cloud'))
        const cancel = [...box.querySelectorAll('button')].find(b => /取消|cancel/i.test(b.textContent))
        cancel?.click()
        return true
      })()`)
      await sleeps(500)
      const rowsAfter = (await fmState()).bodyText || ''
      check('U5c 取消后列表不变', rowsAfter === rowsBefore, { before: rowsBefore.length, after: rowsAfter.length })
    }
  }

  // ---- U6: delete-file 同步删除登记与磁盘 ----
  {
    const del = await fetch(`http://127.0.0.1:${APP_PORT}/api/delete-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ky: 'data/files/验收附件.txt', path: 'data/files/验收附件.txt' }),
    }).then(r => r.json()).catch(e => ({ error: String(e) }))
    let diskGone = true
    try { await stat(path.join(profile, 'library', 'files', '验收附件.txt')); diskGone = false } catch {}
    const db = new DatabaseSync(path.join(profile, 'library', 'notekit.db'), { readOnly: true })
    const row = db.prepare(`SELECT ky FROM "HOME-1-file" WHERE ky='data/files/验收附件.txt'`).get()
    check('U6 delete-file 删除磁盘与登记', del.code === 0 && diskGone && !row, { del, diskGone, row })
  }
}

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ port: APP_PORT, serverDiedAt, results, failures }, null, 2))
console.log(failures.length ? `\n${failures.length} 项失败` : '\n全部通过')
console.log(`server 存活: ${serverAlive}${serverDiedAt.length ? '，死亡时间点: ' + serverDiedAt.join(', ') : ''}`)
if (failures.length) console.log('[应用日志尾部]', cdp.logs().slice(-1200))
clearInterval(serverProbe)
await stopApp()
process.exit(failures.length ? 1 : 0)
