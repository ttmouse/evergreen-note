/**
 * 复选框冗余选中圆环 + 悬停铅笔 验收（隔离实例，不动用户数据）
 *
 * 用法：node tools/checkbox-ring-verify.mjs [--mode before|after]
 *   before = 记录修复前的表现（预期圆环仍在，作为对照证据）
 *   after  = 记录修复后的表现（预期圆环消失，其余能力保留）
 * 前置：npm run build（验证 dist 产物）。
 * 输出：test-runs/checkbox-ring-verify/<mode>/ 下的 result.json 与截图。
 *
 * 场景：
 *   S1 鼠标拖拽跨行选择、勾选框在选区内部 → 记录勾选框 outline 状态 + 截图
 *      （修复目标：选区扫过时不再叠加 outline 圆环）
 *   S2 点击勾选框 → 勾选/取消仍工作（模型 + DOM input 双确认）
 *   S3 键盘方向键把光标移到勾选框上 → outline 焦点提示仍出现（可访问性保留）
 *   S4 鼠标悬停勾选框 → 不再弹出铅笔编辑按钮
 *   S5 鼠标悬停超链接 → 铅笔编辑按钮仍出现（其他行内元素不受影响）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const modeArg = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : 'after'
if (!['before', 'after'].includes(modeArg)) {
  console.error('--mode 只接受 before | after')
  process.exit(2)
}

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'checkbox-ring-verify', modeArg)
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

const TOPIC = '复选框圈验收'
let child = null
// 直接 spawn Electron 二进制（.bin/electron 的 node 包装会留僵尸进程）
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
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
// JS 原生对话框（alert/confirm）会冻结渲染进程主线程，导致 evaluate 全部超时：自动接受
setInterval(() => {
  const dialogs = cdp.events.filter(e => e.method === 'Page.javascriptDialogOpening')
  if (dialogs.length) {
    console.log('⚠️ 检测到 JS 对话框，自动接受:', JSON.stringify(dialogs[dialogs.length - 1].params).slice(0, 200))
    cdp.call('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
  }
}, 2000)
// 看门狗：8 分钟后强制退出并落盘现场
const watchdog = setTimeout(() => {
  console.log('⏱️ 看门狗触发：验收超时，强制退出')
  flush().finally(() => process.exit(3))
}, 8 * 60 * 1000)
const results = []
const failures = []
const resultFile = path.join(outDir, 'result.json')
const flush = () => writeFile(resultFile, JSON.stringify({ mode: modeArg, results, consoleErrors: consoleErrors() }, null, 2)).catch(() => {})
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
  flush()
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

const keyEvent = k => ({ modifiers: k.modifiers ?? 0, key: k.key, code: k.code ?? k.key, windowsVirtualKeyCode: k.vk ?? 0, nativeVirtualKeyCode: k.vk ?? 0 })
const pressReal = async (k, ms = 200) => {
  await callWithTimeout('Input.dispatchKeyEvent', { ...keyEvent(k), type: 'rawKeyDown' })
  await callWithTimeout('Input.dispatchKeyEvent', { ...keyEvent(k), type: 'keyUp' })
  await sleeps(ms)
}
const typeText = async text => { await callWithTimeout('Input.insertText', { text }, 10000); await sleeps(250) }
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await callWithTimeout('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  }
  await sleeps(250)
}
// 真实拖拽：mousePressed → 多步 mouseMoved → mouseReleased
const dragFromTo = async (from, to, { release = true } = {}) => {
  await callWithTimeout('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1 })
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await callWithTimeout('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'left' })
    await sleeps(30)
  }
  if (release) {
    await callWithTimeout('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 })
  }
  await sleeps(500)
}
const hoverAt = async (x, y) => {
  await callWithTimeout('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) })
  await sleeps(450)
}
const screenshot = async name => {
  const data = await callWithTimeout('Page.captureScreenshot', { format: 'png' }, 20000)
  await writeFile(path.join(outDir, name), Buffer.from(data.data, 'base64'))
}

const waitReady = async () => {
  for (let i = 0; i < 90; i++) {
    if (await evalWithTimeout(`!!window.__notekitApp`).catch(() => false)) { console.log('waitReady: __notekitApp 就绪'); break }
    if (i % 10 === 9) console.log(`waitReady: 等待 __notekitApp ${i + 1}/90`)
    await sleeps(1000)
  }
  let routed = false
  for (let i = 0; i < 60 && !routed; i++) {
    routed = await evalWithTimeout(`(() => {
      const topic = window.__notekitApp.addons.topic
      if (!topic?.getTopic) return false
      if (!topic.getTopic(${JSON.stringify(TOPIC)})) return false
      topic.route(${JSON.stringify(TOPIC)})
      return true
    })()`).catch(() => false)
    if (!routed) await sleeps(1000)
  }
  if (!routed) {
    await evalWithTimeout(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(TOPIC)}); return true })()`, 8000).catch(() => {})
  }
  for (let i = 0; i < 30; i++) {
    if (await evalWithTimeout(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) return
    await sleeps(1000)
  }
  throw new Error('编辑器未就绪')
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

// 勾选框 outline 的权威读数（修复前应为 solid 2px #B4D5FF，修复后 none）
const checkboxOutline = () => evalWithTimeout(`(() => {
  const box = document.querySelector('.element-checkbox .inline-rect > *')
  if (!box) return 'no-box'
  const cs = getComputedStyle(box)
  return cs.outlineStyle + '|' + cs.outlineWidth + '|' + cs.outlineColor
})()`)
const checkboxState = () => evalWithTimeout(`(() => {
  const wrap = document.querySelector('.element-checkbox')
  const input = wrap?.querySelector('input')
  if (!wrap || !input) return null
  return { checked: input.checked }
})()`)

await waitReady()

/* ---------- 准备内容：两行，第二行行首插入勾选框并勾选 ---------- */
await clickIntoFirst()
await typeText('first line')
await pressReal({ modifiers: 0, key: 'Enter', code: 'Enter', vk: 13 })
await typeText('hello world')
await pressReal({ modifiers: 4 | 8, key: 'd', code: 'KeyD', vk: 68 }) // mod+shift+d：插入 checkbox（行首）
await sleeps(500)
{
  const st = await checkboxState()
  check('P1 mod+shift+d 插入勾选框（DOM 就位）', st?.checked === false, st)
  // 记录真实 Slate 树结构，供分析 selected 判定
  const treeDump = await evalWithTimeout(`(() => {
    const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const ed = node.$editor
    let cbPath = null
    const walk = (children, prefix) => children.forEach((c, i) => {
      const p = [...prefix, i]
      if (c.blockType === 'checkbox' && cbPath === null) cbPath = p
      if (c.children) walk(c.children, p)
    })
    walk(ed.children, [])
    return { cbPath, tree: JSON.parse(JSON.stringify(ed.children)) }
  })()`).catch(e => ({ error: String(e).slice(0, 200) }))
  console.log('P1b checkbox 路径：', JSON.stringify(treeDump?.cbPath))
  await writeFile(path.join(outDir, 'tree.json'), JSON.stringify(treeDump, null, 1)).catch(() => {})
  // 点击勾选框 → 勾选
  const box = await evalWithTimeout(`(() => {
    const input = document.querySelector('.element-checkbox input')
    if (!input) return null
    input.scrollIntoView({ block: 'center' })
    const r = input.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!box) throw new Error('找不到勾选框 input')
  await clickAt(box.x, box.y)
  await sleeps(400)
  const st2 = await checkboxState()
  check('P2 点击后勾选成功', st2?.checked === true, st2)
  // 第三行放一个超链接（程序化创建，避免 strmap 键入时机的干扰；铅笔回归只需要元素存在）
  // 先在勾选框后面补上文本，让勾选框处于“文本两侧都有内容”的行内中间位置（用户截图的几何）。
  // 不依赖光标：直接向勾选框后面的尾部空叶子插入文本（树结构里 checkbox 后固定有一个 {text:''}）。
  const moreOk = await evalWithTimeout(`(() => {
    const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const ed = node.$editor
    let cbPath = null
    const walk = (children, prefix) => children.forEach((c, i) => {
      const p = [...prefix, i]
      if (c.blockType === 'checkbox' && cbPath === null) cbPath = p
      if (c.children) walk(c.children, p)
    })
    walk(ed.children, [])
    if (!cbPath) return 'no-cbpath'
    const trailing = [...cbPath.slice(0, -1), cbPath[cbPath.length - 1] + 1]
    let leaf = null
    let cur = { children: ed.children }
    for (const idx of trailing) { cur = cur.children ? cur.children[idx] : undefined; if (cur === undefined) break }
    leaf = cur
    if (!leaf || typeof leaf.text !== 'string') return 'no-trailing-leaf'
    // 用底层 op 插入（ed.insertText 会被 void 选区/覆写干扰）
    ed.apply({ type: 'insert_text', path: trailing, offset: leaf.text.length, text: ' more' })
    return (node.innerText || '').includes('more')
  })()`).catch(e => 'err:' + String(e).slice(0, 120))
  await sleeps(400)
  check('P2b 勾选框后补打文本 more（行内两侧有文本）', moreOk === true, { moreOk })
  await pressReal({ modifiers: 0, key: 'Enter', code: 'Enter', vk: 13 })
  await sleeps(300)
  const linkOk = await evalWithTimeout(`(() => {
    const app = window.__notekitApp
    const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const ed = node.$editor
    const hl = app.addons.hyperlink.createElement({ url: 'https://example.com', title: '链接页' })
    // 光标已在 Enter 产生的新空行上，直接在当前选区插入
    ed.insertFragment([hl, { text: ' ' }])
    return !!document.querySelector('.element-hyperlink')
  })()`).catch(e => 'err:' + String(e).slice(0, 120))
  await sleeps(400)
  const linkOk2 = await evalWithTimeout(`!!document.querySelector('.element-hyperlink')`).catch(() => false)
  check('P3 程序化创建超链接（供铅笔回归）', linkOk2 === true, { linkOk })
}

/* ---------- S1 拖拽跨行选择，勾选框在选区内部 ---------- */
{
  const pts = await evalWithTimeout(`(() => {
    const first = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('first line'))
    const second = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    if (!first || !second) return 'no-node:' + !!first + !!second
    const fspan = [...first.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('first'))
    if (!fspan) return 'no-fspan'
    const input = second.querySelector('.element-checkbox input')
    if (!input) return 'no-input'
    const moreSpan = [...second.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('more'))
    if (!moreSpan) return 'no-morespan'
    fspan.scrollIntoView({ block: 'center' })
    const fr = fspan.getBoundingClientRect()
    const mr = moreSpan.getBoundingClientRect()
    // 终点落在 more 文本内：勾选框严格夹在选区中间（复现用户截图几何）
    return { from: { x: fr.left + 4, y: fr.top + fr.height / 2 }, to: { x: mr.left + Math.max(2, mr.width / 2), y: mr.top + mr.height / 2 } }
  })()`)
  if (!pts || typeof pts === 'string') throw new Error('找不到拖拽端点: ' + pts)
  await dragFromTo(pts.from, pts.to)
  const selInfo = await evalWithTimeout(`(() => {
    const s = getSelection()
    const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const ed = node?.$editor
    const edSel = ed?.selection || null
    // 手工判断 cbPath 是否落在选区路径范围内（与 Range.intersection 同判据）
    const cmp = (a, b) => {
      const n = Math.max(a.length, b.length)
      for (let i = 0; i < n; i++) { const x = a[i] ?? -1, y = b[i] ?? -1; if (x !== y) return x < y ? -1 : 1 }
      return 0
    }
    let cbPath = null
    const walk = (children, prefix) => children.forEach((c, i) => {
      const p = [...prefix, i]
      if (c.blockType === 'checkbox' && cbPath === null) cbPath = p
      if (c.children) walk(c.children, p)
    })
    if (ed && !cbPath) walk(ed.children, [])
    let inRange = null
    if (edSel && cbPath) {
      const [s, e] = [edSel.anchor, edSel.focus].map(p => p.path)
      const [lo, hi] = cmp(s, e) <= 0 ? [s, e] : [e, s]
      inRange = cmp(cbPath, lo) >= 0 && cmp(cbPath, hi) <= 0
    }
    const rect = document.querySelector('.element-checkbox .inline-rect')
    return {
      dom: !!(s && !s.isCollapsed),
      slate: edSel ? JSON.parse(JSON.stringify(edSel)) : null,
      cbPath, inRange,
      inlineRectClass: rect ? rect.className : null,
      active: document.activeElement ? document.activeElement.className.toString().slice(0, 80) : null,
    }
  })()`)
  check('S1 拖拽后 DOM 选区展开', selInfo.dom, selInfo)
  const outline = await checkboxOutline()
  const ringPresent = typeof outline === 'string' && outline.startsWith('solid|')
  await screenshot(modeArg === 'after' ? 's1-drag-select-after.png' : 's1-drag-select-before.png')
  if (modeArg === 'before') {
    check('S1[before 对照] 圆环存在（复现用户截图现象）', ringPresent, { outline })
  } else {
    check('S1 拖拽选择后勾选框无冗余圆环', !ringPresent, { outline })
    check('S1 勾选框勾选状态未被拖拽破坏', (await checkboxState())?.checked === true, null)
  }
  // 收起选区
  await clickAt(pts.from.x, pts.from.y + 60)
  await sleeps(300)
}

/* ---------- S2 点击取消勾选 / 再勾选（回归） ---------- */
{
  const box = await evalWithTimeout(`(() => {
    const input = document.querySelector('.element-checkbox input')
    const r = input.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  await clickAt(box.x, box.y)
  const unchecked = (await checkboxState())?.checked
  await clickAt(box.x, box.y)
  const checked = (await checkboxState())?.checked
  check('S2 勾选/取消循环仍工作', unchecked === false && checked === true, { unchecked, checked })
}

/* ---------- S3 键盘方向键移到勾选框 → outline 焦点提示保留 ---------- */
{
  // 点击 "hello world" 末尾，然后持续 ArrowRight（勾选框在文本之后）直到 outline 出现
  const endPt = await evalWithTimeout(`(() => {
    const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const span = [...node.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('hello world'))
    span.scrollIntoView({ block: 'center' })
    const r = span.getBoundingClientRect()
    return { x: r.right - 2, y: r.top + r.height / 2 }
  })()`)
  await clickAt(endPt.x, endPt.y)
  let sawFocusRing = false
  let outlineVal = ''
  let caretTrail = []
  for (let i = 0; i < 8; i++) {
    await pressReal({ modifiers: 0, key: 'ArrowRight', code: 'ArrowRight', vk: 39 }, 160)
    outlineVal = await checkboxOutline()
    const selNow = await evalWithTimeout(`(() => {
      const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
      const s = node?.$editor?.selection
      return s ? JSON.parse(JSON.stringify(s)).anchor.path.join(',') : 'none'
    })()`).catch(() => 'err')
    caretTrail.push(selNow)
    if (typeof outlineVal === 'string' && outlineVal.startsWith('solid|')) { sawFocusRing = true; break }
  }
  check('S3 键盘光标落在勾选框时 outline 焦点提示出现', sawFocusRing, { outlineVal, caretTrail })
  await screenshot('s3-keyboard-caret-on-checkbox.png')
  // 光标移走后提示消失
  await pressReal({ modifiers: 0, key: 'ArrowRight', code: 'ArrowRight', vk: 39 }, 200)
  const after = await checkboxOutline()
  check('S3 光标移走后 outline 消失', !(typeof after === 'string' && after.startsWith('solid|')), { after })
}

/* ---------- S4 悬停勾选框 → 铅笔按钮不再弹出 ---------- */
{
  const pt = await evalWithTimeout(`(() => {
    const input = document.querySelector('.element-checkbox input')
    const r = input.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  await hoverAt(pt.x, pt.y)
  const bar = await evalWithTimeout(`(() => {
    const el = document.querySelector('.inlines-edit-btn')
    if (!el) return 'no-bar'
    const cs = getComputedStyle(el)
    return cs.visibility + '|' + cs.opacity
  })()`)
  check('S4 悬停勾选框不弹铅笔按钮', typeof bar === 'string' && (bar.startsWith('hidden|') || bar === 'no-bar'), { bar })
  await screenshot('s4-hover-checkbox-no-pencil.png')
}

/* ---------- S5 悬停超链接 → 铅笔按钮仍出现（其他元素回归） ---------- */
{
  await hoverAt(10, 10) // 先移开
  await sleeps(700)
  const pt = await evalWithTimeout(`(() => {
    const link = document.querySelector('.element-hyperlink')
    if (!link) return null
    const r = link.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!pt) throw new Error('找不到超链接元素')
  await hoverAt(pt.x, pt.y)
  const bar = await evalWithTimeout(`(() => {
    const el = document.querySelector('.inlines-edit-btn')
    if (!el) return 'no-bar'
    const cs = getComputedStyle(el)
    return cs.visibility + '|' + cs.opacity
  })()`)
  check('S5 悬停超链接铅笔按钮仍出现', typeof bar === 'string' && bar.startsWith('visible|'), { bar })
  // 点击铅笔 → 应弹出编辑菜单（保留真实编辑能力）
  const box = await evalWithTimeout(`(() => {
    const el = document.querySelector('.inlines-edit-btn')
    if (!el) return null
    const cs = getComputedStyle(el)
    if (cs.visibility !== 'visible') return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (box) {
    await clickAt(box.x, box.y)
    await sleeps(500)
    const menu = await evalWithTimeout(`(() => {
      const menus = [...document.querySelectorAll('.float-menu-inlines-float-menu')]
        .filter(m => m.getBoundingClientRect().width > 0)
      return menus.length > 0
    })()`).catch(() => false)
    check('S5 铅笔点开仍有编辑菜单（编辑能力保留）', menu === true, { menu })
  }
  await hoverAt(10, 10)
}

/* ---------- 控制台报错 ---------- */
{
  await sleeps(500)
  const errs = consoleErrors()
  // 已知既有缺陷（另行立项）：itemChanged 刷新处理器在 freshAdd 载荷上抛 TypeError；
  // 报错位置随构建产物行号变化，按消息特征匹配。
  const knownIssue = e => e.includes("reading 'length'") && e.includes('TypeError')
  const unknownErrs = errs.filter(e => !knownIssue(e))
  check('无未知控制台报错', unknownErrs.length === 0, unknownErrs.slice(0, 4))
  if (errs.length - unknownErrs.length > 0) {
    console.log(`已知既有缺陷报错 ${errs.length - unknownErrs.length} 条（freshAdd 刷新 TypeError，另行立项）`)
  }
}

await flush()
console.log(`\n[${modeArg}] 结果：${results.filter(r => r.ok).length}/${results.length} 通过，输出 ${outDir}`)
if (failures.length) console.log('失败项：', failures.join('、'))

await cdp.evaluate('window.close(); true').catch(() => {})
cdp.close()
await stopApp()
process.exit(failures.length ? 1 : 0)
