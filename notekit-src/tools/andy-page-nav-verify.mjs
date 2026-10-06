/**
 * Andy 页面级导航验收（隔离实例，不动用户数据）
 *
 * 背景：DESIGN.md §3.6（2026-10-06 用户拍板）——侧栏页面导航（主题/图谱/每日）
 * 在 Andy 模式下应「替换当前活动列（当前列让位）」，而不是在右侧新增列。
 *
 * 用法：先 pnpm build，再 node tools/andy-page-nav-verify.mjs
 * 输出：test-runs/andy-page-nav-verify/result.json
 *
 * 覆盖：
 *   S0 发布包含 navigatePage 修复
 *   S1 列 [甲,乙]，乙活动，点侧栏「主题」→ 乙原位替换为 topics，列数不变
 *   S2 列 [甲,topics]，甲活动，再点「主题」→ 甲让位关闭，聚焦已有 topics 列，不新增
 *   S3 topics 已是活动列，点「主题」→ 列集合不变
 *   S4 回归：topics 列里点笔记条目链接 → 该笔记在其右侧开列（§3.1 / OP-025 不回归）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'andy-page-nav-verify')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const DEBUG_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
let cdp = null
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) { console.error('❌ 无法连接 CDP'); child.kill('SIGKILL'); process.exit(1) }
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
const consoleErrors = () => cdp.events
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
  .map(e => JSON.stringify(e.params).slice(0, 300))

const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await callWithTimeout('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  }
  await sleeps(300)
}
const clickEl = async selector => {
  const box = await evalWithTimeout(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!box) throw new Error('找不到元素 ' + selector)
  await clickAt(box.x, box.y)
}

// ---- 状态快照 ----
const snapshot = () => evalWithTimeout(`(() => {
  const app = window.__notekitApp
  return {
    mode: app.states.floatViewerMode,
    activeKey: app.states.floatViewerActiveKey,
    viewers: app.states.floatViewerList.map(d => ({ key: d.key, dialogId: d.dialogId })),
    tabs: app.addons.main.workspaceTabs.map(t => t.key),
    activeTab: app.addons.main.workspaceActiveKey,
    domColumns: [...document.querySelectorAll('.nui-dialog[dialog-list-mode="andy"]')]
      .map(d => ({ id: d.id, rendered: d.getAttribute('data-rendered') })),
  }
})()`)
// 可见列顺序（DOM 序 = 视觉序）
const columnKeys = s => s.domColumns.filter(c => s.viewers.some(v => v.dialogId === c.id)).map(c => c.rendered)

const waitFor = async (expr, ms = 6000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const ok = await evalWithTimeout(expr).catch(() => false)
    if (ok) return true
    await sleeps(250)
  }
  return false
}
const activateColumn = async key => {
  const pt = await evalWithTimeout(`(() => {
    const id = window.__notekitApp.states.floatViewerList.find(d => d.key === ${JSON.stringify(key)})?.dialogId
    const ce = document.getElementById(id)?.querySelector('[contenteditable="true"]')
    if (!ce) return null
    ce.focus()
    const r = ce.getBoundingClientRect()
    return { x: r.left + 40, y: r.top + Math.min(30, r.height / 2) }
  })()`)
  if (!pt) throw new Error('找不到列编辑器 ' + key)
  await clickAt(pt.x, pt.y)
  await sleeps(400)
  const snap = await snapshot()
  return snap.activeKey === snap.viewers.find(v => v.key === key)?.dialogId
}

/* ---------- 启动与造数 ---------- */
for (let i = 0; i < 90; i++) { try { if (await evalWithTimeout(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }
await waitFor(`!!window.__notekitApp?.addons?.andy`)
await sleeps(1000)

const kys = await evalWithTimeout(`(() => {
  const t = window.__notekitApp.addons.topic
  const a = t.createTopic('导航甲', { layout: 'default' })
  const b = t.createTopic('导航乙', { layout: 'default' })
  return { a: a?.ky, b: b?.ky }
})()`)
check('S0 造数成功（两篇笔记）', !!(kys?.a && kys?.b), kys)
check('S0 发布包含 navigatePage', await evalWithTimeout(`typeof window.__notekitApp.addons.andy.navigatePage === 'function'`), null)

// 进 Andy 模式；关掉默认 diaries 列后必须【同步】立即开甲，
// 避免触发 FloatViewer.delete 的「空列表自动重开 diaries」兜底
await evalWithTimeout(`window.__notekitApp.addons.floatViewer.setModeAll('andy'); true`)
await waitFor(`window.__notekitApp.states.floatViewerList.length > 0`, 8000)
await sleeps(600)
await evalWithTimeout(`(() => {
  const app = window.__notekitApp
  const d = app.states.floatViewerList.find(x => x.key === 'diaries')
  if (d) app.addons.dialog.close(d.dialogId)
  app.addons.keyClick.openInAndyMode(${JSON.stringify(kys.a)}, 0)
  return true
})()`)
await waitFor(`window.__notekitApp.states.floatViewerList.some(x => x.key === ${JSON.stringify(kys.a)})`)
await sleeps(500)
await evalWithTimeout(`window.__notekitApp.addons.keyClick.openInAndyMode(${JSON.stringify(kys.b)}, 1); true`)
await waitFor(`window.__notekitApp.states.floatViewerList.some(x => x.key === ${JSON.stringify(kys.b)})`)
await sleeps(800)

let snap = await snapshot()
check('S0 前置：Andy 模式两列 [甲,乙]', snap.mode === 'andy' && JSON.stringify(columnKeys(snap)) === JSON.stringify([kys.a, kys.b]), { keys: columnKeys(snap) })
check('S0 前置：乙是活动列', await activateColumn(kys.b), null)

/* ---------- S1 未开页面：主题替换活动列 ---------- */
const beforeKeys = columnKeys(snap)
const idxB = beforeKeys.indexOf(kys.b)
await clickEl(`[data-name="topiclist"]`)
await waitFor(`window.__notekitApp.states.floatViewerList.some(d => d.key === 'topics')`)
await sleeps(800)
snap = await snapshot()
{
  const keys = columnKeys(snap)
  check('S1 乙列原位替换为 topics（不新增列）',
    keys.length === beforeKeys.length && keys.includes('topics') && !keys.includes(kys.b)
    && keys.indexOf('topics') === idxB, { keys, beforeKeys, idxB })
  check('S1 页签同步（乙页签移除，topics 页签存在，数量不变）',
    snap.tabs.length === beforeKeys.length && snap.tabs.includes('topics') && !snap.tabs.includes(kys.b), { tabs: snap.tabs })
  check('S1 活动列为 topics', snap.viewers.find(v => v.dialogId === snap.activeKey)?.key === 'topics', snap)
}

/* ---------- S2 已开页面：甲让位，聚焦已有 topics ---------- */
check('S2 前置：甲是活动列', await activateColumn(kys.a), null)
snap = await snapshot()
const topicsDialogIdBefore = snap.viewers.find(v => v.key === 'topics')?.dialogId
await clickEl(`[data-name="topiclist"]`)
await sleeps(1000)
snap = await snapshot()
check('S2 甲让位关闭，不新增列',
  !snap.viewers.some(v => v.key === kys.a) && snap.viewers.filter(v => v.key === 'topics').length === 1,
  { viewers: snap.viewers })
check('S2 聚焦的是原有 topics 列（不重建）',
  snap.viewers.find(v => v.key === 'topics')?.dialogId === topicsDialogIdBefore && snap.activeKey === topicsDialogIdBefore, snap)
check('S2 页签与列集合一致（甲页签移除）',
  snap.tabs.length === snap.viewers.length && !snap.tabs.includes(kys.a), { tabs: snap.tabs })

/* ---------- S3 topics 已是活动列：点主题列集合不变 ---------- */
const s3Before = snap
await clickEl(`[data-name="topiclist"]`)
await sleeps(900)
snap = await snapshot()
check('S3 已是活动页时列集合不变',
  JSON.stringify([...columnKeys(snap)].sort()) === JSON.stringify([...columnKeys(s3Before)].sort())
  && snap.viewers.length === s3Before.viewers.length, { keys: columnKeys(snap) })

/* ---------- S4 回归：topics 列里点笔记条目链接 → 右侧开列（§3.1） ---------- */
// 在 topics 列里点第一条笔记标题链接（item 链接走 navigate 阅读路径语义）
{
  const s4BeforeKeys = columnKeys(snap)
  const linkBox = await evalWithTimeout(`(() => {
    const el = document.querySelector('.nui-dialog[dialog-list-mode="andy"] .topic-title-link')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!linkBox) throw new Error('S4 找不到 topics 列里的笔记链接')
  await clickAt(linkBox.x, linkBox.y)
  await waitFor(`window.__notekitApp.states.floatViewerList.length > ${s4BeforeKeys.length}`, 6000)
  await sleeps(800)
  snap = await snapshot()
  const keys = columnKeys(snap)
  const idxTopics = keys.indexOf('topics')
  const newItemKey = keys.find((k, i) => i === idxTopics + 1 && k !== 'topics' && !s4BeforeKeys.includes(k))
  check('S4 条目链接在来源右侧开列（阅读路径不回归）', !!newItemKey, { keys, s4BeforeKeys })
}

const errs = consoleErrors()
check('无未知控制台报错', errs.length === 0, errs.slice(0, 3))

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, consoleErrors: errs, final: snap }, null, 2))
console.log(`\n结果：${results.filter(r => r.ok).length}/${results.length} 通过，输出 ${path.join(outDir, 'result.json')}`)
if (failures.length) console.log('失败项：', failures.join('、'))

await ev(`window.close(); true`).catch(() => {})
cdp.close()
child.kill('SIGTERM'); await sleeps(1000); try { child.kill('SIGKILL') } catch {}
process.exit(failures.length ? 1 : 0)
