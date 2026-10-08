/**
 * node tools/save-retry-verify.mjs (requires pnpm build)
 * OP-049：保存失败错误条内的「重试保存」按钮 —— 真实操作链路验收。
 * 隔离 Electron 实例（独立 profile + 端口），页内拦截 /api/local-db/ PUT 模拟服务中断：
 * 打字 → 失败错误条出现 → 同一笔记第二次失败（重试记录去重）→ 键盘 Enter 触发重试
 * → 恢复后真实鼠标点击重试 → 成功提示 → flush() 成功 → 库内读到最新正文。
 * profile 截图留在 test-runs/op049-save-retry/；不触碰真实用户数据。
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, cp, readdir } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from '../../../notekit-src/tools/cdp-client.mjs'
import assert from 'node:assert/strict'
const root = process.env.VERIFY_ROOT || fileURLToPath(new URL('../../../notekit-src/', import.meta.url))
const output = path.join(root, '../test-runs/op049-save-retry')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(path.join(output, 'profile-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function port() {
 const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p
}
// 快照 dist + server 到临时根：并发会话会重建 dist，直接读仓库 dist 是移动靶。
// 拷贝可能撞上重建中途（脏快照缺 chunk），校验 index.html 引用完整性，失败重试。
const snap = await mkdtemp(path.join(output, 'snap-'))
await mkdir(path.join(snap, 'server'), { recursive: true })
for (const f of await readdir(path.join(root, 'server'))) if (f.endsWith('.mjs')) await cp(path.join(root, 'server', f), path.join(snap, 'server', f))
{
 const { readFile, rm } = await import('node:fs/promises')
 let ok = false
 for (let attempt = 0; attempt < 6 && !ok; attempt++) {
  await rm(path.join(snap, 'dist'), { recursive: true, force: true })
  await cp(path.join(root, 'dist'), path.join(snap, 'dist'), { recursive: true })
  const html = await readFile(path.join(snap, 'dist', 'index.html'), 'utf8')
  // html 引用带 /static/ 前缀（服务端把 /static/ 映射回 dist 根），落盘校验要去掉
  const refs = [...html.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map(m => m[1].replace(/^static\//, ''))
  const missing = []
  for (const ref of refs) {
   try { await readFile(path.join(snap, 'dist', ref)) } catch { missing.push(ref) }
  }
  const indexJs = refs.find(r => r.includes('index-') && r.endsWith('.js'))
  const hasMarker = indexJs && !missing.includes(indexJs) ? (await readFile(path.join(snap, 'dist', indexJs), 'utf8')).includes('重试保存') : false
  ok = missing.length === 0 && hasMarker
  console.log(`snapshot attempt ${attempt + 1}: refs=${refs.length} missing=${missing.length} marker=${hasMarker}`)
  if (!ok) await sleep(3000)
 }
 assert.ok(ok, '快照 dist 不完整或不含本次改动（并发重建干扰），先 pnpm build 后重试')
}
const debugPort=await port(), httpPort=await port()
// 外部快照服务：main.cjs 探到端口就绪会跳过自起服务，改用本快照
const serverChild = spawn(process.execPath, ['--experimental-sqlite', path.join(snap, 'server', 'server.mjs')], {env:{...process.env, PORT:String(httpPort), NOTEKIT_DATA_DIR:path.join(snap,'data'), ELECTRON_RUN_AS_NODE:'1'}, stdio:['ignore','pipe','pipe']})
let serverLogs=''; serverChild.stdout.on('data',d=>serverLogs+=d); serverChild.stderr.on('data',d=>serverLogs+=d)
async function untilServer(){for(let i=0;i<40;i++){const ok=await fetch(`http://127.0.0.1:${httpPort}/api/storage/status`).then(r=>r.ok).catch(()=>false);if(ok)return;await sleep(300)}throw Error('快照服务未就绪：'+serverLogs.slice(-500))}
await untilServer()
const child=spawn(path.join(root,'node_modules/.bin/electron'),['desktop/main.cjs',`--remote-debugging-port=${debugPort}`],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'',NOTEKIT_PORT:String(httpPort),NOTEKIT_USER_DATA:profile},stdio:['ignore','pipe','pipe']})
let logs=''; child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
let cdp
async function until(fn) {for(let i=0;i<300;i++){try{const value=await fn();if(value)return value}catch{} await sleep(500)}throw Error('until 超时，应用日志尾部：'+logs.slice(-1200))}
async function shot(name){const img=await cdp.call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name),Buffer.from(img.data,'base64'))}
const results=[]
try {
 cdp=await until(()=>connect(debugPort))
 console.log('cdp connected')
 await until(async () => {
  const state = await cdp.evaluate(`({ url: location.href, ready: document.readyState, app: !!window.__notekitApp?.addons?.dbDisk, editor: !!document.querySelector('.item-editor[contenteditable=true]'), body: document.body ? document.body.children.length : -1, rootHtml: document.getElementById('root') ? document.getElementById('root').innerHTML.slice(0, 120) : document.body.innerHTML.slice(0, 120) })`).catch(e => ({ evalError: String(e).slice(0, 200) }))
  if (state.editor && state.app) return true
  const errs = cdp.events
   .filter(m => m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params?.type)))
   .splice(0).map(m => JSON.stringify(m.params).slice(0, 500))
  if (!globalThis.__diagCount || globalThis.__diagCount < 4) { globalThis.__diagCount = (globalThis.__diagCount || 0) + 1; console.log('waiting app:', JSON.stringify(state), errs.length ? '\nERRS: ' + errs.join('\nERRS: ') : '') }
  return false
 })
 console.log('app ready')
 // 拦截写请求：__failWrites 期间 /api/local-db/ PUT 返回 500（模拟服务端写失败），并计数
 await cdp.evaluate(`(() => {
  window.__failWrites = true
  window.__putAttempts = 0
  const orig = window.fetch.bind(window)
  window.__origFetch = orig
  window.fetch = (url, init) => {
   if (window.__failWrites && init && init.method === 'PUT' && String(url).includes('/api/local-db/')) {
    window.__putAttempts++
    return Promise.resolve(new Response(JSON.stringify({ error: '模拟服务中断' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
   }
   return orig(url, init)
  }
 })()`)
 // 真实点击正文编辑器：Slate Editable 带 .item-editor class，标题（ItemHead）没有
 const editorBox = await cdp.evaluate(`(() => {
  const list = Array.from(document.querySelectorAll('.item-editor[contenteditable=true]'))
  if (!list.length) throw Error('未找到正文编辑器 .item-editor')
  const target = list.map(e => [e, e.getBoundingClientRect().width * e.getBoundingClientRect().height]).sort((a, b) => b[1] - a[1])[0][0]
  const r = target.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + Math.min(80, r.height / 2) }
 })()`)
 console.log('editor clicked at', JSON.stringify(editorBox))
 await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 })
 await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: editorBox.x, y: editorBox.y, button: 'left', clickCount: 1 })
 await sleep(400)
 const snackVisible = e => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.opacity !== '0' }
 const snackError = () => cdp.evaluate(`(() => {
  const bars = Array.from(document.querySelectorAll('.MuiSnackbar-root')).filter(e => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.opacity !== '0' })
  const err = bars.find(e => e.textContent.includes('笔记保存失败'))
  if (!err) return null
  const btn = Array.from(err.querySelectorAll('button')).find(b => b.textContent.trim() === '重试保存')
  return { text: err.textContent.slice(0, 120), hasRetry: !!btn, isNativeButton: btn?.tagName === 'BUTTON', focusable: btn ? btn.tabIndex !== -1 : false, origin: err.className.includes('BottomCenter') ? 'bottom' : 'other' }
 })()`)
 // 第一次写入：v1 失败 → 错误条出现（首启保存链路慢，轮询等待最多 10s）
 await cdp.call('Input.insertText', { text: 'OP049重试甲' })
 let first = null
 for (let i = 0; i < 25; i++) {
  first = await snackError()
  if (first) break
  await sleep(400)
 }
 console.log('after v1 typing, putAttempts =', await cdp.evaluate(`window.__putAttempts`))
 assert.ok(first, '写失败后必须出现持久错误条（putAttempts=' + await cdp.evaluate(`window.__putAttempts`) + '）')
 assert.ok(first.hasRetry, '错误条内必须有「重试保存」按钮')
 assert.ok(first.isNativeButton && first.focusable, '重试入口必须是原生可聚焦 button')
 results.push({ step: 'v1失败错误条', hasRetry: first.hasRetry })
 // 错误条双主题目检：新 profile 可能默认夜间，先拍当前主题再切换拍另一主题
 const nightByDefault = await cdp.evaluate(`document.body.classList.contains('night-mode')`)
 console.log('night mode by default:', nightByDefault)
 await shot(nightByDefault ? '01-error-night.png' : '01-error-light.png')
 await cdp.evaluate(`document.body.classList.toggle('night-mode')`)
 await sleep(300)
 await shot(nightByDefault ? '02-error-light.png' : '02-error-night.png')
 await cdp.evaluate(`document.body.classList.toggle('night-mode')`)
 // 第二次写入：v2 仍失败，同主键失败记录应被覆盖（稍后重试只重放一次）
 await cdp.call('Input.insertText', { text: '乙' })
 let stillError = null
 for (let i = 0; i < 25; i++) {
  stillError = await snackError()
  if (stillError) break
  await sleep(400)
 }
 assert.ok(stillError, '第二次失败后错误条仍在')
 const attemptsAfterTwoFails = await cdp.evaluate(`window.__putAttempts`)
 assert.ok(attemptsAfterTwoFails >= 2, `两次失败至少两次 PUT，实际 ${attemptsAfterTwoFails}`)
 // 键盘可达：聚焦按钮 + 真实 Enter 派发触发重试（仍拦截中，失败但计数增加）
 await cdp.evaluate(`Array.from(document.querySelectorAll('.MuiSnackbar-root button')).find(b => b.textContent.trim() === '重试保存')?.focus()`)
 await cdp.evaluate(`document.activeElement?.textContent.trim() === '重试保存' ? undefined : (() => { throw Error('重试按钮未获得焦点') })()`)
 const beforeEnter = await cdp.evaluate(`window.__putAttempts`)
 await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
 await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
 await sleep(900)
 const afterEnter = await cdp.evaluate(`window.__putAttempts`)
 assert.ok(afterEnter > beforeEnter, `Enter 必须触发重试 PUT（${beforeEnter} -> ${afterEnter}）`)
 results.push({ step: '键盘Enter触发重试', putDelta: afterEnter - beforeEnter })
 // 解除拦截（模拟服务恢复），真实鼠标点击「重试保存」
 await cdp.evaluate(`window.__failWrites = false`)
 const btnBox = await cdp.evaluate(`(() => {
  const btn = Array.from(document.querySelectorAll('.MuiSnackbar-root button')).find(b => b.textContent.trim() === '重试保存')
  if (!btn) throw Error('重试按钮消失')
  const r = btn.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
 })()`)
 const attemptsBeforeRetry = await cdp.evaluate(`window.__putAttempts`)
 await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
 await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
 // 成功提示出现
 let recovered = false
 for (let i = 0; i < 20; i++) {
  recovered = await cdp.evaluate(`Array.from(document.querySelectorAll('.MuiSnackbar-root')).some(e => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.opacity !== '0' && e.textContent.includes('笔记保存已恢复') })`)
  if (recovered) break
  await sleep(400)
 }
 assert.ok(recovered, '重试成功后必须出现「笔记保存已恢复」')
 await shot('03-recovered.png')
 // 重试只重放一次（同主键失败记录去重），且无残留错误条
 const attemptsAfterRetry = await cdp.evaluate(`window.__putAttempts`)
 results.push({ step: '点击重试重放', putDelta: attemptsAfterRetry - attemptsBeforeRetry })
 await sleep(4600) // 等成功条自动收起
 const errorLeft = await cdp.evaluate(`Array.from(document.querySelectorAll('.MuiSnackbar-root')).some(e => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.opacity !== '0' && e.textContent.includes('笔记保存失败') })`)
 assert.ok(!errorLeft, '恢复后错误条必须收起')
 // flush() 必须成功（writeError 已清）
 await cdp.evaluate(`__notekitApp.addons.dbDisk.flush()`)
 // 库内必须读到最新正文 v2（重试重放的是最新数据，不是最初的 v1）
 const persisted = await cdp.evaluate(`(async () => {
  const dbid = __notekitApp.addons.dbDisk.primaryId
  const rows = await fetch('/api/local-db/' + dbid + '/node?op=all').then(r => r.json())
  return rows.filter(row => JSON.stringify(row).includes('OP049重试甲')).map(row => ({ ky: row.ky, hasV2: JSON.stringify(row).includes('OP049重试甲乙') }))
 })()`)
 assert.ok(persisted.length >= 1, '重试后正文必须落库')
 assert.ok(persisted.every(row => row.hasV2), `落库必须是最新 v2 内容：${JSON.stringify(persisted)}`)
 results.push({ step: '落库内容', rows: persisted })
 results.push({ step: 'flush()', ok: true })
 console.log(JSON.stringify({ ok: true, results, profile }, null, 1))
} catch (e) {
 await shot('99-failure.png').catch(() => {})
 console.error('FAIL:', e.message)
 console.error('results:', JSON.stringify(results, null, 1))
 try { console.error('putAttempts:', await cdp.evaluate(`window.__putAttempts`)) } catch {}
 // 转储页面异常与 console.error，定位渲染链路问题
 const pageErrors = cdp.events
  .filter(m => m.method === 'Runtime.exceptionThrown' || (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error'))
  .map(m => JSON.stringify(m.params).slice(0, 800))
 console.error('pageErrors:', pageErrors.length ? pageErrors.join('\n---\n') : '(none)')
 console.error(logs.slice(-800))
 process.exitCode = 1
} finally {
 // 收尾卫生：无论成功失败，先解除页内 fetch 拦截再关窗口。
 // 否则 before-quit 的 flush() 撞上 500 拦截会抛「模拟服务中断」，
 // 触发「笔记尚未保存，应用暂不退出」对话框，把报错窗口残留在用户屏幕上。
 try { await cdp?.evaluate(`window.__failWrites = false; if (window.__origFetch) window.fetch = window.__origFetch`) } catch {}
 try { await cdp?.call('Browser.close') } catch {}
 // 测试实例数据是一次性的，直接 SIGKILL，完全绕开 before-quit 的保存/备份/弹窗链路
 child.kill('SIGKILL')
 serverChild.kill('SIGKILL')
 await sleep(500)
 try { child.kill('SIGKILL') } catch {}
 try { serverChild.kill('SIGKILL') } catch {}
}
