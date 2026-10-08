/**
 * node tools/floatviewer-refresh-verify.mjs (requires pnpm build)
 * OP-050：Refresh.itemChanged 刷新在 newer.path 缺失时的 TypeError 验收。
 * 断言：打字 20 次（含快速连打）后 0 个 "reading 'length'" TypeError（修复前同节奏 6 次）；
 * beforeinput historyUndo/Redo 真实回退与恢复；flush 后落库含最新正文；双主题截图。
 * VERIFY_ROOT 可指向任意构建根（隔离验证用干净 worktree）。profile 留 test-runs/op050-floatviewer-crash/。
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, cp, readdir } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'
import assert from 'node:assert/strict'
const root = process.env.VERIFY_ROOT || fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '../test-runs/op050-floatviewer-crash')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(path.join(output, 'profile-fixed-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function port() {
 const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p
}
const snap = await mkdtemp(path.join(output, 'snap-'))
await mkdir(path.join(snap, 'server'), { recursive: true })
for (const f of await readdir(path.join(root, 'server'))) if (f.endsWith('.mjs')) await cp(path.join(root, 'server', f), path.join(snap, 'server', f))
await cp(path.join(root, 'dist'), path.join(snap, 'dist'), { recursive: true })
{
 const { readFile } = await import('node:fs/promises')
 const html = await readFile(path.join(snap, 'dist', 'index.html'), 'utf8')
 const refs = [...html.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map(m => m[1].replace(/^static\//, ''))
 for (const ref of refs) await readFile(path.join(snap, 'dist', ref))
 console.log('snapshot ok, refs =', refs.length)
}
const debugPort=await port(), httpPort=await port()
const serverChild = spawn(process.execPath, ['--experimental-sqlite', path.join(snap, 'server', 'server.mjs')], {env:{...process.env, PORT:String(httpPort), NOTEKIT_DATA_DIR:path.join(snap,'data'), ELECTRON_RUN_AS_NODE:'1'}, stdio:['ignore','pipe','pipe']})
let serverLogs=''; serverChild.stdout.on('data',d=>serverLogs+=d); child_logs_hook(serverChild)
function child_logs_hook(){serverChild.stdout.on('data',d=>serverLogs+=d);serverChild.stderr.on('data',d=>serverLogs+=d)}
async function untilServer(){for(let i=0;i<40;i++){const ok=await fetch(`http://127.0.0.1:${httpPort}/api/storage/status`).then(r=>r.ok).catch(()=>false);if(ok)return;await sleep(300)}throw Error('快照服务未就绪：'+serverLogs.slice(-500))}
await untilServer()
const child=spawn(path.join(root,'node_modules/.bin/electron'),['desktop/main.cjs',`--remote-debugging-port=${debugPort}`],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'',NOTEKIT_PORT:String(httpPort),NOTEKIT_USER_DATA:profile},stdio:['ignore','pipe','pipe']})
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d)
let cdp
async function until(fn,label) {for(let i=0;i<300;i++){try{const value=await fn();if(value)return value}catch{} await sleep(500)}throw Error((label||'until')+' 超时，应用日志尾部：'+logs.slice(-1200))}
async function shot(name){const img=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name),Buffer.from(img.data,'base64'))}
const results=[]
const countLenErrors = () => cdp.events.filter(m =>
  (m.method === 'Runtime.exceptionThrown' && (m.params?.exceptionDetails?.exception?.description || '').includes("reading 'length'")) ||
  (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error' && (m.params.args?.map(a => a.description || a.value).join(' ') || '').includes("reading 'length'"))
).length
try {
 cdp=await until(()=>connect(debugPort),'cdp')
 await until(async () => {
  const state = await cdp.evaluate(`({ app: !!window.__notekitApp?.addons?.dbDisk, editor: !!document.querySelector('.item-editor[contenteditable=true]') })`).catch(() => null)
  return state?.editor && state?.app
 },'app ready')
 console.log('app ready, baseline len-errors =', countLenErrors())
 const editorBox = await cdp.evaluate(`(() => {
  const list = Array.from(document.querySelectorAll('.item-editor[contenteditable=true]'))
  const target = list.map(e => [e, e.getBoundingClientRect().width * e.getBoundingClientRect().height]).sort((a, b) => b[1] - a[1])[0][0]
  const r = target.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + Math.min(80, r.height / 2) }
 })()`)
 await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 })
 await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 })
 await sleep(300)
 // ① 打字 20 次：5 次逐次 + 15 次快速连打（同复现轮节奏）
 for (let i = 1; i <= 20; i++) {
  await cdp.call('Input.insertText', { text: `OP050修字${i} ` })
  await sleep(i <= 5 ? 600 : 150)
 }
 await sleep(3000)
 const errAfterTyping = countLenErrors()
 results.push({ step: '打字20次', lenErrors: errAfterTyping })
 assert.equal(errAfterTyping, 0, `打字后不得出现 reading 'length' TypeError，实际 ${errAfterTyping}`)
 // 双主题目检（行为修复无视觉变化，截图证明两主题页面正常渲染）
 await shot('01-fixed-typing.png')
 await cdp.evaluate(`document.body.classList.toggle('night-mode')`)
 await sleep(400)
 await shot('02-fixed-other-theme.png')
 await cdp.evaluate(`document.body.classList.toggle('night-mode')`)
 // ② 撤销重做：beforeinput historyUndo/Redo（真实事件链路，Slate 可达）
 // 前面做过主题切换/截图，焦点已离开编辑器、Slate 内部 selection 为 null，
 // 必须先真实点击编辑器恢复焦点与内部选区，否则 undo 派发无效
 await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 })
 await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 })
 await sleep(400)
 const readText = () => cdp.evaluate(`(document.querySelector('.item-editor[contenteditable=true]')?.textContent || '').slice(0, 120)`)
 const beforeUndo = await readText()
 for (let i = 0; i < 3; i++) {
  await cdp.evaluate(`(() => { const ed = document.querySelector('.item-editor[contenteditable=true]'); ed.focus(); const sel = window.getSelection(); sel.selectAllChildren(ed); sel.collapseToEnd(); ed.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true })) })()`)
  await sleep(900)
 }
 await sleep(2000)
 const afterUndo = await readText()
 const undoWorked = afterUndo !== beforeUndo
 // undo 后等待保存，确认无崩溃
 for (let i = 0; i < 3; i++) {
  await cdp.evaluate(`(() => { const ed = document.querySelector('.item-editor[contenteditable=true]'); ed.focus(); ed.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyRedo', bubbles: true, cancelable: true })) })()`)
  await sleep(900)
 }
 await sleep(2000)
 const afterRedo = await readText()
 const errAfterUndoRedo = countLenErrors()
 results.push({ step: 'undo/redo', undoWorked, afterUndo: afterUndo.slice(0, 40), afterRedo: afterRedo.slice(0, 40), lenErrors: errAfterUndoRedo })
 assert.equal(errAfterUndoRedo, 0, `undo/redo 后不得出现 reading 'length' TypeError`)
 assert.ok(undoWorked, 'undo 必须产生文本回退')
 assert.ok(afterRedo !== afterUndo, 'redo 必须恢复文本')
 // ③ 保存落库：flush 后库内含正文
 await cdp.evaluate(`__notekitApp.addons.dbDisk.flush()`)
 await sleep(800)
 const persisted = await cdp.evaluate(`(async () => {
  const dbid = __notekitApp.addons.dbDisk.primaryId
  const rows = await fetch('/api/local-db/' + dbid + '/node?op=all').then(r => r.json())
  return { total: rows.length, hasText: rows.some(row => JSON.stringify(row).includes('OP050修字20')) }
 })()`)
 results.push({ step: '落库', persisted })
 assert.ok(persisted.hasText, '最新正文必须落库')
 const noErrorSnack = await cdp.evaluate(`!Array.from(document.querySelectorAll('.MuiSnackbar-root')).some(e => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.opacity !== '0' && (e.textContent.includes('失败') || e.textContent.includes('错误')) })`)
 assert.ok(noErrorSnack, '全程不得出现错误条')
 console.log(JSON.stringify({ ok: true, results, profile }, null, 1))
} catch (e) {
 await shot('99-failure.png').catch(() => {})
 console.error('FAIL:', e.message)
 console.error('results:', JSON.stringify(results, null, 1))
 const pageErrors = cdp?.events
  .filter(m => m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error')
  .map(m => m.params.args?.map(a => a.description || a.value).join(' ').slice(0, 300))
 console.error('pageErrors:', pageErrors?.length ? pageErrors.slice(-5).join('\n---\n') : '(none)')
 console.error(logs.slice(-600))
 process.exitCode = 1
} finally {
 try { await cdp?.call('Browser.close') } catch {}
 child.kill('SIGKILL'); serverChild.kill('SIGKILL')
 await sleep(500)
 try { child.kill('SIGKILL') } catch {}
 try { serverChild.kill('SIGKILL') } catch {}
 process.exit(process.exitCode || 0)
}
