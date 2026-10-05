/**
 * image-paste-system-clipboard.mjs — 加分项：真实系统剪贴板 + Cmd+V 路径
 *
 * lead 建议的路径：osascript 把真 PNG 写进 macOS 系统剪贴板 → 打包实例里
 * CDP Input.dispatchKeyEvent 发 Cmd+V（metaKey）→ 浏览器原生 paste 事件
 * → clipboardData.files 由系统填充 → Img.onPaste → /api/saveB64Image。
 *
 * 这条路径若打不通，如实记「未验证」+ 原因，不伪造。
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile, readFile, stat, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outRoot = path.join(root, '..', 'test-runs', 'image-paste-verify')
const outDir = path.join(outRoot, 'system-clipboard')
const PNG = path.join(outRoot, 'clipboard', 'verify-clip.png')
const APP_BIN = path.join(root, 'build', 'Evergreen note.app', 'Contents', 'MacOS', 'Evergreen note')
const REAL_PROFILE = path.join(os.homedir(), 'Library', 'Application Support', 'NotekitDev')

const sleeps = ms => new Promise(r => setTimeout(r, ms))
const report = { task: 'task-2-bonus', path: 'system clipboard + Cmd+V', startedAt: new Date().toISOString(), assertions: [] }
const assert = (id, desc, pass, evidence) => {
  const rec = { id, desc, pass: !!pass, evidence }
  report.assertions.push(rec)
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${desc}${pass ? '' : '\n      evidence: ' + JSON.stringify(evidence).slice(0, 700)}`)
  return !!pass
}
async function freePort(){const s=net.createServer();await new Promise((res,rej)=>{s.once('error',rej);s.listen(0,'127.0.0.1',res)});const{port}=s.address();await new Promise((res,rej)=>s.close(e=>e?rej(e):res()));return port}
const snapReal = async () => { try { const st = await stat(REAL_PROFILE); return { exists: true, mtimeMs: st.mtimeMs } } catch { return { exists: false } } }

// 0. 剪贴板预置
const clipInfo = execFileSync('osascript', ['-e', 'clipboard info'], { encoding: 'utf8' })
report.clipboardInfo = clipInfo
report.clipboardHasPng = /PNGf/.test(clipInfo)
const pngBytes = await readFile(PNG)
report.pngFile = { path: PNG, size: pngBytes.length, sha256: createHash('sha256').update(pngBytes).digest('hex') }
assert('S1-clipboard-has-png', 'macOS 系统剪贴板确实持有 PNG（clipboard info 含 «class PNGf»）', report.clipboardHasPng, { clipboardInfo: clipInfo.slice(0, 300) })

const guardBefore = await snapReal()
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const dataDir = path.join(profile, 'library')
const APP_PORT = await freePort(), DEBUG_PORT = await freePort()
report.isolation = { profile, dataDir, appPort: APP_PORT, debugPort: DEBUG_PORT }

let childOut = ''
const child = spawn(APP_BIN, [`--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: path.join(root, 'build', 'Evergreen note.app', 'Contents', 'Resources', 'app'),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile, NOTEKIT_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', d => { childOut += d }); child.stderr.on('data', d => { childOut += d })
let cdp = null
for (let i = 0; i < 150 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) {
  report.fatal = 'CDP 未连上'
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  try { child.kill('SIGKILL') } catch {}
  process.exit(1)
}
const ev = e => cdp.evaluate(e)
const evalT = (e, ms = 25000) => Promise.race([ev(e), sleeps(ms).then(() => { throw new Error('to') })])
for (let i = 0; i < 150; i++) { if (await evalT(`!!window.__notekitApp`, 5000).catch(() => false)) break; await sleeps(1000) }
for (let i = 0; i < 90; i++) { if (await evalT(`!!window.__notekitApp?.addons?.img?.inlinesBarAddItems`, 5000).catch(() => false)) break; await sleeps(1000) }

// XHR 拦截（应用 HTTP 层用 XHR）
await evalT(`(() => {
  window.__vp = { api: [], pasteEvents: [] }
  const OX = window.XMLHttpRequest
  function P(){ const x=new OX(); let u=''; const o=x.open; x.open=function(m,uu,...r){u=String(uu);return o.call(this,m,uu,...r)}
    x.addEventListener('loadend',()=>{ if(!String(u).includes('/api/'))return; let b=null; try{b=JSON.parse(x.responseText)}catch{}; window.__vp.api.push({url:u,status:x.status,body:b}) })
    return x }
  P.prototype = OX.prototype; for (const k of ['UNSENT','OPENED','HEADERS_RECEIVED','LOADING','DONE']) P[k]=OX[k]
  window.XMLHttpRequest = P
  window.addEventListener('paste', e => window.__vp.pasteEvents.push({ items: e.clipboardData?[...e.clipboardData.items].map(i=>i.type):[], files: e.clipboardData?e.clipboardData.files.length:-1, fileNames: e.clipboardData?[...e.clipboardData.files].map(f=>f.name+':'+f.size):[] }), true)
  return 'ok'
})()`)

// 路由
await evalT(`(async () => { try { await window.__notekitApp.addons.topic.route('系统剪贴板粘贴验证') } catch(e){}; return true })()`, 20000).catch(() => {})
await sleeps(2500)
for (let i = 0; i < 40; i++) { if (await evalT(`(() => { const v=document.querySelector('.editor-view.editor-from-router'); return !!(v&&v.querySelector('[contenteditable="true"]')) })()`, 5000).catch(() => false)) break; await sleeps(1000) }

// 聚焦编辑器 + fiber 取 editor
const pick = await evalT(`(() => {
  const v=[...document.querySelectorAll('.editor-view.editor-from-router')].find(x=>x.querySelector('[contenteditable="true"]'))
  const ce=v?v.querySelector('[contenteditable="true"]'):null
  if(!ce) return null
  let ed=null; const fk=Object.keys(ce).find(k=>k.startsWith('__reactFiber$')||k.startsWith('__reactInternalInstance$'))
  if(fk){let f=ce[fk],d=0;while(f&&d<60&&!ed){const p=f.memoizedProps;if(p&&p.editor&&Array.isArray(p.editor.children))ed=p.editor;f=f.return;d++}}
  let ky=null
  if(ed){const o=[...document.querySelectorAll('*')].find(n=>Object.prototype.hasOwnProperty.call(n,'$editor')&&n.$editor===ed&&n.getAttribute('data-ky')); if(o)ky=o.getAttribute('data-ky')}
  window.__vpPick={ce,editor:ed,ky}
  return {hasCe:true,hasEditor:!!ed,ky}
})()`).catch(e => ({ error: String(e) }))
report.pick = pick
console.log('[pick]', JSON.stringify(pick))

const focus = await evalT(`(() => {
  const ce=window.__vpPick.ce; ce.focus()
  const s=getSelection(), r=document.createRange(); r.selectNodeContents(ce); r.collapse(false); s.removeAllRanges(); s.addRange(r)
  return { active: document.activeElement===ce || ce.contains(document.activeElement), activeTag: document.activeElement?.tagName+'.'+String(document.activeElement?.className||'').slice(0,50) }
})()`)
report.focus = focus
await sleeps(500)

// 读剪贴板看页面侧能不能看到图片（Electron 里 navigator.clipboard.read 需要权限）
report.clipboardReadProbe = await evalT(`(async () => {
  try { if(!navigator.clipboard?.read) return {available:false}
    const items=await navigator.clipboard.read(); return {available:true, types: items.map(i=>i.types)} }
  catch(e){ return {available:true, error:String(e)} }
})()`).catch(e => ({ error: String(e) }))
console.log('[clip read]', JSON.stringify(report.clipboardReadProbe))

// ---- 发 Cmd+V（metaKey=4）----
const before = await evalT(`({api:window.__vp.api.length, pastes:window.__vp.pasteEvents.length})`)
for (const params of [
  { type: 'keyDown', modifiers: 4, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, text: 'v', unmodifiedText: 'v' },
]) { await cdp.call('Input.dispatchKeyEvent', params).catch(e => { report.keyErr = String(e) }) }
await sleeps(150)
for (const params of [{ type: 'keyUp', modifiers: 4, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 }]) {
  await cdp.call('Input.dispatchKeyEvent', params).catch(() => {})
}
await sleeps(6000)

const after = await evalT(`({api:window.__vp.api, pastes:window.__vp.pasteEvents, imgSrcs:[...document.querySelectorAll('.editor-view img')].map(i=>i.getAttribute('src'))})`)
report.before = before
report.after = after
console.log('[after]', JSON.stringify(after).slice(0, 1200))

const saveCall = (after?.api ?? []).find(a => a.url.includes('saveB64Image'))
report.saveCall = saveCall ?? null
const nativePasteSeen = (after?.pastes ?? []).some(p => p.files > 0)
assert('S2-native-paste-fired',
  'Cmd+V 触发了浏览器原生 paste 事件且 clipboardData.files > 0（系统剪贴板填入）',
  nativePasteSeen,
  { pastes: after?.pastes, clipboardReadProbe: report.clipboardReadProbe })
assert('S3-saveB64Image-called',
  '系统粘贴路径下 /api/saveB64Image 被触发且 200',
  !!saveCall && saveCall.status === 200,
  saveCall ?? { api: after?.api })

let disk = { exists: false }
const fp = saveCall?.body?.node?.fileInfo?.path
if (fp) {
  const abs = path.join(dataDir, fp.replace(/^data\//, ''))
  try { const st = await stat(abs); const b = await readFile(abs); disk = { abs, exists: true, size: st.size, isPng: [...b.slice(0,4)].map(x=>x.toString(16).padStart(2,'0')).join(' ') === '89 50 4e 47' } } catch (e) { disk = { abs, exists: false, error: String(e.code) } }
}
report.disk = disk
assert('S4-disk-nonzero-png',
  '系统粘贴路径下磁盘文件存在、>0 字节、合法 PNG',
  disk.exists && disk.size > 0 && disk.isPng,
  disk)
assert('S5-editor-has-img',
  '系统粘贴路径下编辑器出现指向该文件的 img',
  !!fp && (after?.imgSrcs ?? []).some(s => s && s.includes(path.basename(fp))),
  { imgSrcs: after?.imgSrcs, fp })

let imgs = []
try { imgs = (await readdir(path.join(dataDir, 'images'))).map(async f => ({ f, size: (await stat(path.join(dataDir, 'images', f))).size })) } catch {}
report.imagesDir = await Promise.all(imgs)

await ev(`window.close()`).catch(() => {})
await sleeps(900); child.kill('SIGTERM'); await sleeps(1200); try { child.kill('SIGKILL') } catch {}
await sleeps(400)
const guardAfter = await snapReal()
report.profileGuard = { before: guardBefore, after: guardAfter }
assert('S6-real-profile-untouched', '隔离：真实库未被触碰', guardBefore.exists === guardAfter.exists && guardBefore.mtimeMs === guardAfter.mtimeMs, report.profileGuard)

report.childOut = childOut.slice(-3000)
report.finishedAt = new Date().toISOString()
report.summary = { total: report.assertions.length, passed: report.assertions.filter(a => a.pass).length, failed: report.assertions.filter(a => !a.pass).map(a => a.id) }
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n=== system-clipboard: ${report.summary.passed}/${report.summary.total}; failed=[${report.summary.failed.join(',')}] ===`)
process.exit(0)
