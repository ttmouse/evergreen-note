/**
 * 聚焦复证：图片粘贴时 XMLHttpRequest 是否真的打到 /api/saveB64Image，
 * 以及响应回来的 node.fileInfo.path 是否落盘。补齐 image-paste-repro.mjs 里
 * 因为 Http helper 用 XHR（非 fetch）而漏掉的 network 证据。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, stat, readdir } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'image-paste-repro')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address(); await new Promise((res, rej) => s.close(e => e ? rej(e) : res())); return port
}
const APP_PORT = await freePort(), DEBUG_PORT = await freePort()
const profile = path.join(outDir, 'profile-xhr')
await rm(profile, { recursive: true, force: true }); await mkdir(profile, { recursive: true })
const dataDir = path.join(profile, 'library')

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile, NOTEKIT_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let out = ''
child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d)

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) { console.error('CDP 失败'); child.kill('SIGKILL'); process.exit(1) }
const ev = c => cdp.evaluate(c)
const evalT = async (c, ms = 20000) => Promise.race([ev(c), sleeps(ms).then(() => { throw new Error('timeout') })])

for (let i = 0; i < 120; i++) { if (await evalT(`!!window.__notekitApp`, 5000).catch(() => false)) break; await sleeps(1000) }
for (let i = 0; i < 60; i++) {
  const ok = await evalT(`!!window.__notekitApp?.addons?.paste?.onPaste?.addon`, 5000).catch(() => false)
  if (ok) break
  await sleeps(1000)
}

// 关键：hook XMLHttpRequest（Http helper 走 XHR，不是 fetch）
await evalT(`(() => {
  window.__xhrLog = []
  const O = window.XMLHttpRequest
  const op = O.prototype.open, os = O.prototype.send
  O.prototype.open = function(m, u, ...r) { this.__m = m; this.__u = u; return op.call(this, m, u, ...r) }
  O.prototype.send = function(body) {
    const rec = { method: this.__m, url: String(this.__u), bodyType: body ? body.constructor.name : null,
                  bodyKeys: body instanceof FormData ? [...body.keys()] : null }
    if (body instanceof FormData) { try { const u = body.get('uri'); rec.uriLen = u ? String(u).length : 0; rec.uriHead = u ? String(u).slice(0, 30) : null; rec.filename = body.get('filename') } catch {} }
    this.addEventListener('load', () => { rec.status = this.status; rec.responseHead = String(this.responseText || '').slice(0, 300) })
    window.__xhrLog.push(rec)
    return os.call(this, body)
  }
  return 'xhr-hooked'
})()`)

await evalT(`(async () => { try { await window.__notekitApp.addons.topic.route('xhr-verify') } catch {} return true })()`, 15000).catch(() => {})
await sleeps(1500)
for (let i = 0; i < 60; i++) {
  const ok = await evalT(`!!document.querySelector('[contenteditable="true"]')`, 5000).catch(() => false)
  if (ok) break
  await sleeps(1000)
}

const result = await evalT(`(async () => {
  const a = window.__notekitApp
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]') || document.querySelector('[contenteditable="true"]')
  ce.focus()
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7c3aed'; ctx.fillRect(0,0,64,48); ctx.fillStyle = '#fff'; ctx.fillRect(10,10,20,16)
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
  const file = new File([blob], 'xhr-verify.png', { type: 'image/png' })
  const dt = new DataTransfer(); dt.items.add(file)
  const before = window.__xhrLog.length
  const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  ce.dispatchEvent(evt)
  await new Promise(r => setTimeout(r, 4000))
  const imgs = [...document.querySelectorAll('.editor-view .element-img img')].map(i => i.getAttribute('src'))
  const node = document.querySelector('.editor-view .node')
  let leafImg = null
  try { const e = node.$editor; const t = e?.children ?? []; leafImg = JSON.stringify(t).slice(0, 600) } catch(e2) { leafImg = 'err:'+e2.message }
  return {
    blobSize: blob.size,
    pngMagic: [...new Uint8Array(await blob.arrayBuffer()).slice(0,8)].map(b=>b.toString(16).padStart(2,'0')).join(' '),
    xhrCalls: window.__xhrLog.slice(before),
    allXhrUrls: window.__xhrLog.map(x => x.url + ' ' + (x.status ?? 'no-status')),
    imgSrcs: imgs,
    imgCount: document.querySelectorAll('.editor-view .element-img').length,
    editorText: document.querySelector('.editor-view')?.innerText?.slice(0,200),
    leafImg,
    defaultPrevented: evt.defaultPrevented,
  }
})()`, 45000).catch(e => ({ evalError: String(e) }))

const saveCall = (result.xhrCalls || []).find(c => c.url && c.url.includes('saveB64Image'))
const disk = {}
if (saveCall && saveCall.responseHead) {
  try {
    const j = JSON.parse(saveCall.responseHead.length < 300 ? saveCall.responseHead : saveCall.responseHead)
    const p = j?.node?.fileInfo?.path
    if (p) {
      const abs = path.join(profile, p)
      const st = await stat(abs).catch(() => null)
      disk[p] = st ? { exists: true, size: st.size, abs } : { exists: false, abs }
    }
  } catch {}
}
let listing = []
try { listing = await readdir(path.join(profile, 'library', 'images')) } catch {}

const report = {
  task: 'task-1', probe: 'xhr-focus-verify', at: new Date().toISOString(),
  isolation: { appPort: APP_PORT, debugPort: DEBUG_PORT, profile, dataDir },
  coverInstalled: await evalT(`window.__notekitApp.addons.paste.onPaste.displayName`).catch(() => null),
  saveB64ImageXhr: saveCall ?? null,
  allXhr: result.allXhrUrls,
  result, disk, imagesListing: listing,
  childOut: out.slice(-3000),
}
await writeFile(path.join(outDir, 'xhr-verify.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2).slice(0, 6000))

await ev(`window.close(); true`).catch(() => {})
await sleeps(800); child.kill('SIGTERM'); await sleeps(1000); try { child.kill('SIGKILL') } catch {}
process.exit(0)
