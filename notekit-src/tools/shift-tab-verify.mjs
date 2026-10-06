/**
 * Shift+点击双链 → 新工作区 Tab 验收（隔离实例，不动用户数据）
 *
 * 用法：node tools/shift-tab-verify.mjs
 * 前置：pnpm build。输出 test-runs/shift-tab-verify/result.json
 *
 * 覆盖：
 *   S1 普通点击双链 → 当前 Tab 原地替换（replaceWorkspaceTab，不新增 Tab）
 *   S2 Shift+点击双链 → 新增一个工作区 Tab 并激活
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'shift-tab-verify')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })

const SRC = 'Shift测试源'
const DST = 'Shift目标页'
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
let cdp = null
const DEBUG_PORT = await freePort()
const child2 = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
const ev = e => cdp.evaluate(e)

const results = []
const failures = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}
const evalWithTimeout = (expression, ms = 15000) => Promise.race([
  ev(expression),
  sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) }),
])
const callWithTimeout = (method, params = {}, ms = 15000) => Promise.race([
  cdp.call(method, params),
  sleeps(ms).then(() => { throw new Error(`${method} 超时 ${ms}ms`) }),
])

const routeWhenReady = async title => {
  for (let i = 0; i < 60; i++) {
    const ok = await evalWithTimeout(`(() => {
      const topic = window.__notekitApp.addons.topic
      if (!topic?.getTopic) return false
      if (!topic.getTopic(${JSON.stringify(title)})) return false
      topic.route(${JSON.stringify(title)})
      return true
    })()`).catch(() => false)
    if (ok) { await sleeps(500); return true }
    await sleeps(1000)
  }
  await evalWithTimeout(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(title)}); return true })()`, 8000).catch(() => {})
  await sleeps(500)
  return true
}
const waitEditor = async () => {
  for (let i = 0; i < 30; i++) {
    if (await evalWithTimeout(`!!document.querySelector('.editor-view [contenteditable="true"]')`).catch(() => false)) return
    await sleeps(1000)
  }
  throw new Error('编辑器未就绪')
}
const clickAt = async (x, y, modifiers = 0) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await callWithTimeout('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers })
  }
  await sleeps(400)
}
const clickIntoFirst = async () => {
  const point = await evalWithTimeout(`(() => {
    const el = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + 30, y: r.top + Math.min(20, r.height / 2) }
  })()`)
  if (!point) throw new Error('找不到可编辑笔记')
  await clickAt(point.x, point.y)
}
const selectSpanText = async (substr) => {
  const r = await evalWithTimeout(`(() => {
    const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(substr)}))
    if (!n) return 'no-node'
    const ce = n.closest('[contenteditable="true"]') || n.querySelector('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const span = [...n.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes(${JSON.stringify(substr)}))
    if (!span) return 'no-span'
    const range = document.createRange()
    const tn = span.firstChild
    const i = (span.textContent || '').indexOf(${JSON.stringify(substr)})
    range.setStart(tn, i); range.setEnd(tn, i + ${JSON.stringify(substr)}.length)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
    return sel.toString()
  })()`)
  if (r !== substr) throw new Error('选区失败: ' + r)
  await sleeps(500)
}
const clickLink = async (modifiers = 0) => {
  const box = await evalWithTimeout(`(() => {
    const el = document.querySelector('.editor-view span.bilink[data-topic="${DST}"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!box) throw new Error('找不到双链元素')
  await clickAt(box.x, box.y, modifiers)
}
const tabState = () => evalWithTimeout(`(() => {
  const m = window.__notekitApp.addons.main
  return JSON.stringify({
    pathname: decodeURIComponent(location.pathname),
    tabs: m.workspaceTabs.map(t => t.key),
    active: m.workspaceActiveKey,
  })
})()`).then(s => JSON.parse(s))
const pathname = () => evalWithTimeout(`decodeURIComponent(location.pathname)`)

for (let i = 0; i < 90; i++) { try { if (await evalWithTimeout(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }
await routeWhenReady(DST)
const kyTarget = decodeURIComponent(await pathname())
await routeWhenReady(SRC)
const srcKy = decodeURIComponent(await pathname())
await waitEditor()
const goSource = async () => {
  const r = await evalWithTimeout(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const node = mem.nodes[${JSON.stringify(srcKy)}.split('/').pop()]
    if (!node) return 'no-node'
    window.__notekitApp.addons.router.to(node)
    return 'ok'
  })()`)
  if (r !== 'ok') throw new Error('goSource 失败: ' + r)
  await sleeps(800)
}

// 建双链：真实输入 + 选中 + linkSelection
await clickIntoFirst()
await callWithTimeout('Input.insertText', { text: DST }, 10000)
await sleeps(400)
await selectSpanText(DST)
await evalWithTimeout(`(() => {
  const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(DST)}))
  return window.__notekitApp.addons.bilink.linkSelection(n.$editor)
})()`)
console.log('S0 linkSelection 返回:', JSON.stringify(await evalWithTimeout(`'done'`).catch(e => String(e))))
console.log('S0 诊断:', await evalWithTimeout(`JSON.stringify({
  bilinks: [...document.querySelectorAll('.editor-view span.bilink')].map(b => b.dataset.topic),
  nodes: [...document.querySelectorAll('.editor-view .node')].map(n => (n.innerText||'').slice(0,40)),
})`).catch(e => String(e)))
await sleeps(400)
{
  const exists = await evalWithTimeout(`!!document.querySelector('.editor-view span.bilink[data-topic="${DST}"]')`)
  check('S0 双链元素已创建', !!exists, null)
}

/* ---------- S1 普通点击：当前 Tab 原地替换 ---------- */
const beforePlain = await tabState()
console.log('S1 前状态:', JSON.stringify(beforePlain))
await clickLink(0)
await sleeps(900)
{
  const after = await tabState()
  const landed = (await pathname()).endsWith(kyTarget)
  check('S1 普通点击跳转到目标', landed, { after, kyTarget })
  check('S1 普通点击不新增 Tab（原地替换）', after.tabs.length === beforePlain.tabs.length, { before: beforePlain.tabs.length, after: after.tabs.length })
}

/* ---------- S2 Shift+点击：新增 Tab ---------- */
await goSource()
// 移除目标 Tab，避免 Shift 语义被「激活既有 Tab」掩盖
await evalWithTimeout(`window.__notekitApp.addons.main.forgetWorkspaceTab(${JSON.stringify(kyTarget)}.split("/").pop()); true`)
await sleeps(300)
const beforeShift = await tabState()
console.log('S2 前状态:', JSON.stringify(beforeShift))
await clickLink(8) // CDP modifiers: 8 = Shift
await sleeps(1200)
{
  const after = await tabState()
  const targetKy = kyTarget.split('/').pop()
  const targetInTabs = after.tabs.some(k => k === targetKy)
  check('S2 Shift+点击后目标进入 Tab 列表', targetInTabs, { after })
  check('S2 Shift+点击新增了 Tab', after.tabs.length === beforeShift.tabs.length + 1, { before: beforeShift.tabs.length, after: after.tabs.length })
  check('S2 Shift+点击后目标 Tab 激活', after.active === kyTarget || after.active.endsWith(kyTarget.split('/').pop()), { active: after.active })
  console.log('S2 诊断 pathname:', await pathname())
  console.log('S2 选区状态:', await evalWithTimeout(`JSON.stringify({ collapsed: getSelection().isCollapsed, text: (getSelection().toString()||'').slice(0,30) })`))
}

/* ---------- S3 判定：shift 按下时直接调 topic.route，验证 router 侧是否正常 ---------- */
await goSource()
await sleeps(400)
{
  const beforeS3 = await tabState()
  const r = await evalWithTimeout(`(() => {
    // 模拟 shift 按下（keyState 监听 window mousedown 且用 getModifierState）
    window.dispatchEvent(new MouseEvent('mousedown', { shiftKey: true }))
    window.__notekitApp.addons.topic.route(${JSON.stringify(DST)})
    return 'ok'
  })()`)
  await sleeps(900)
  const after = await tabState()
  // S2 已把目标变成既有 Tab，这里「新增或激活目标」都算 router 侧正常
  check('S3 shift 按下时 topic.route 到达目标（router 侧正常）', after.tabs.length === beforeS3.tabs.length + 1 || after.active !== beforeS3.active, { before: beforeS3.tabs.length, after: after.tabs.length, r })
  // 还原
  await evalWithTimeout(`window.dispatchEvent(new MouseEvent('keyup', { shiftKey: true })); true`)
}

/* ---------- S4 判定：shift 按下时直接调 bilink.handleClick ---------- */
await goSource()
await sleeps(400)
{
  const beforeS4 = await tabState()
  const r = await evalWithTimeout(`(() => {
    const el = document.querySelector('.editor-view span.bilink[data-topic="${DST}"]')
    if (!el) return 'no-el'
    window.dispatchEvent(new MouseEvent('mousedown', { shiftKey: true }))
    window.__notekitApp.addons.bilink.handleClick(
      new MouseEvent('click', { shiftKey: true }),
      { topicTitle: ${JSON.stringify(DST)}, element: {}, editor: null }
    )
    return 'ok'
  })()`)
  await sleeps(900)
  const after = await tabState()
  // 同 S3：目标可能已是既有 Tab，新增或激活都算链路正常
  check('S4 shift 下直接 handleClick 到达目标（addon 链路正常）', after.tabs.length === beforeS4.tabs.length + 1 || after.active !== beforeS4.active, { before: beforeS4.tabs.length, after: after.tabs.length, r })
  await evalWithTimeout(`window.dispatchEvent(new MouseEvent('keyup', { shiftKey: true })); true`)
}

/* ---------- S5 真实 Shift+点击瞬间的选区状态 ---------- */
await goSource()
await sleeps(400)
{
  await evalWithTimeout(`(() => {
    window.__shiftSelLog = []
    document.addEventListener('mousedown', (e) => {
      if (e.shiftKey && (e.target.closest?.('.element-bilink, span.bilink'))) {
        window.__shiftSelLog.push({ at: 'mousedown', collapsed: getSelection().isCollapsed })
      }
    }, true)
    document.addEventListener('click', (e) => {
      if (e.shiftKey && (e.target.closest?.('.element-bilink, span.bilink'))) {
        window.__shiftSelLog.push({ at: 'click', collapsed: getSelection().isCollapsed })
      }
    }, true)
    return true
  })()`)
  await clickLink(8)
  await sleeps(600)
  const log = await evalWithTimeout(`JSON.stringify(window.__shiftSelLog)`)
  console.log('S5 shift 点击瞬间选区日志:', log)
  check('S5 记录到 shift 点击事件', log !== '[]', log)
}

const errs = cdp.events
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
  .map(e => JSON.stringify(e.params).slice(0, 300))
const knownIssue = e => e.includes("reading 'length'") && e.includes('index-')
check('无未知控制台报错', errs.filter(e => !knownIssue(e)).length === 0, errs.slice(0, 3))

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, errs }, null, 2))
console.log(`\n结果：${results.filter(r => r.ok).length}/${results.length} 通过，输出 ${path.join(outDir, 'result.json')}`)
if (failures.length) console.log('失败项：', failures.join('、'))

await ev(`window.close(); true`).catch(() => {})
cdp.close()
child2.kill('SIGTERM'); await sleeps(1000); try { child2.kill('SIGKILL') } catch {}
process.exit(failures.length ? 1 : 0)
