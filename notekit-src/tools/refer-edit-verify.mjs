/**
 * ((块引用)) 显示文字键盘编辑验收 —— 正文 bullet 场景（隔离实例，不动用户数据）
 *
 * 背景：块引用预览态把显示文字渲染成 display:none，浏览器方向键会整体跳过，
 * 光标无法像 [[双链]] 那样用键盘进入显示文字编辑。修复 = 光标贴边/进入时切换
 * 可编辑态（编辑态显示 (( )) 括号，与双链一致）+ 方向键在引用边界拦截穿越。
 *
 * 用法：node tools/refer-edit-verify.mjs
 * 前置：npm run build（验证 dist 产物）。
 * 输出：test-runs/refer-edit-verify/result.json。
 *
 * 覆盖（全部在页面正文 bullet 内执行）：
 *   E1 创建 ((引用)) 后 ←← 进入显示文字，打字改别名（目标不动），编辑态显示 (( )) 括号
 *   E2 行尾 ArrowLeft 走进引用显示文字并编辑
 *   E3 行首 ArrowRight 进入引用显示文字
 *   E4 退出编辑后回到预览态，别名/引用关系正确
 *   E5 预览态真点击引用仍跳转目标
 *   E6 撤销/重做
 *   E7 重启隔离实例后别名保留、可继续编辑、点击仍跳转
 *   E8 旧格式 void 引用（children=((ky))）升级后可键盘编辑
 *   E9 [[双链]] 键盘编辑基线不受影响
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'refer-edit-verify')
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

const TOPIC = '引用目标块'
const SRC = '引用源页'
const LINE = `前缀 ${TOPIC} 后`
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')

let child = null
// 崩溃遗留的孤儿实例会占住 profile 单实例锁，导致下一次启动的实例自退出
const killOrphans = async () => {
  const { execSync } = await import('node:child_process')
  try {
    execSync(`pkill -9 -f ${JSON.stringify(profile)} 2>/dev/null || true`, { shell: '/bin/bash' })
  } catch {}
  await sleeps(1200)
}
const startApp = async () => {
  await killOrphans()
  const debugPort = await freePort()
  console.log(`boot: 启动隔离实例 port=${APP_PORT} debug=${debugPort}`)
  child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
    cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', d => { logs += d })
  child.stderr.on('data', d => { logs += d })
  child.on('exit', (code, sig) => { console.log(`[${new Date().toISOString()}] boot: electron 退出 code=${code} sig=${sig}\n${logs.slice(-800)}`) })
  let cdp = null
  for (let i = 0; i < 60 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
  if (!cdp) throw new Error('CDP 未就绪\n' + logs.slice(-1500))
  cdp.logs = () => logs
  console.log('boot: CDP 已连接，等待 __notekitApp')
  for (let i = 0; i < 45; i++) {
    const ok = await Promise.race([
      cdp.evaluate(`!!window.__notekitApp`).catch(() => false),
      sleeps(5000).then(() => 'timeout'),
    ])
    if (ok === true) break
    if (i === 44) throw new Error('__notekitApp 未就绪\n' + logs.slice(-1500))
    await sleeps(1000)
  }
  console.log(`[${new Date().toISOString()}] boot: 应用就绪`)
  return cdp
}
const stopApp = async () => {
  if (!child) return
  try { await ev(`window.close(); true`) } catch {}
  await sleeps(800)
  child.kill('SIGTERM'); await sleeps(800); try { child.kill('SIGKILL') } catch {}
  child = null
}

let cdp = await startApp()
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

const routeWhenReady = async title => {
  for (let i = 0; i < 60; i++) {
    const ok = await evalWithTimeout(`(() => {
      const topic = window.__notekitApp.addons.topic
      if (!topic?.getTopic) return false
      if (!topic.getTopic(${JSON.stringify(title)})) return false
      topic.route(${JSON.stringify(title)})
      return true
    })()`).catch(() => false)
    if (ok) { console.log(`[${new Date().toISOString()}] route ${title} 命中`); await sleeps(600); return }
    await sleeps(1000)
  }
  await evalWithTimeout(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(title)}); return true })()`, 8000).catch(() => {})
  await sleeps(600)
}
const waitEditor = async () => {
  for (let i = 0; i < 30; i++) {
    if (await evalWithTimeout(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) return
    await sleeps(1000)
  }
  throw new Error('编辑器未就绪')
}
const pathname = () => evalWithTimeout(`location.pathname`)
const kyOf = p => String(p || '').replace(/^\/static/, '').split('/').pop()
let pageKy = ''
let bodyKy = ''
const goSource = async () => {
  const r = await evalWithTimeout(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const node = mem.nodes[${JSON.stringify(kyOf(pageKy))}]
    if (!node) return 'no-node'
    window.__notekitApp.addons.router.to(node)
    return 'ok'
  })()`)
  if (r !== 'ok') throw new Error('goSource 失败: ' + r)
  for (let i = 0; i < 20; i++) {
    if (await evalWithTimeout(`location.pathname.includes(${JSON.stringify(kyOf(pageKy))})`).catch(() => false)) break
    await sleeps(500)
  }
  await sleeps(600)
  await waitEditor()
  // 等正文行渲染就绪（重进页面后子节点树晚于首屏）
  for (let i = 0; i < 20; i++) {
    const ok = await evalWithTimeout(`(() => {
      const nodes = ${BODY_NODES}
      return nodes.some(n => (n.innerText || '').includes('前缀') || (n.innerText || '').includes('旧引用') || (n.innerText || '').includes('行尾'))
    })()`).catch(() => false)
    if (ok) break
    await sleeps(500)
  }
}

const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await callWithTimeout('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  }
  await sleeps(300)
}
const typeText = async text => { await callWithTimeout('Input.insertText', { text }, 10000); await sleeps(300) }
const key = async k => { for (const t of ['rawKeyDown', 'keyUp']) await callWithTimeout('Input.dispatchKeyEvent', { ...k, type: t }); await sleeps(300) }
const ARROW_LEFT = { modifiers: 0, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 }
const ARROW_RIGHT = { modifiers: 0, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 }
const CMD_Z = { modifiers: 4, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }
const CMD_SHIFT_Z = { modifiers: 12, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 }
const ENTER = { modifiers: 0, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }

/** 正文 bullet 节点（.node-subitems 下的叶子 note-block） */
const BODY_NODES = `(() => [...document.querySelectorAll('.editor-view.editor-from-router .node-subitems .node')]
  .filter(n => !n.querySelector('.node')))()`

/** 确保页面有一条正文 bullet 行；返回该 bullet 的 ky */
const ensureBodyLine = async text => {
  await waitEditor()
  const exists = await evalWithTimeout(`(() => {
    const nodes = ${BODY_NODES}
    return nodes.some(n => (n.innerText || '').includes(${JSON.stringify(text)}))
  })()`)
  if (!exists) {
    // 聚焦标题首端，按 Enter 创建正文子行
    await evalWithTimeout(`(() => {
      const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
      ce.focus()
      const sel = getSelection()
      const range = document.createRange()
      range.selectNodeContents(ce)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return 'ok'
    })()`)
    await sleeps(500)
    await key(ENTER)
    await sleeps(500)
    await typeText(text)
    await sleeps(500)
  }
  const ky = await evalWithTimeout(`(() => {
    const nodes = ${BODY_NODES}
    const n = nodes.find(x => (x.innerText || '').includes(${JSON.stringify(text)}))
    return n && n.$item ? String(n.$item.ky) : ''
  })()`)
  if (!ky) throw new Error('正文行未就绪: ' + text)
  return ky
}

/** 把光标放到正文行内包含 substr 的 slate 文本 span 的首/尾（独立 evaluate，等 selectionchange 同步） */
const caretAtBodySpanEdge = async (substr, edge) => {
  const r = await evalWithTimeout(`(() => {
    const nodes = ${BODY_NODES}
    const n = nodes.find(x => (x.innerText || '').includes(${JSON.stringify(substr)}))
    if (!n) return 'no-node:' + nodes.map(x => (x.innerText || '').slice(0, 18)).join('|')
    const ce = n.querySelector('[contenteditable="true"]') || n.closest('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const spans = [...n.querySelectorAll('[data-slate-string], [data-slate-zero-width]')]
    const span = spans.find(s => (s.textContent || '').includes(${JSON.stringify(substr)})) ||
      (edge === 'end' ? spans[spans.length - 1] : spans[0])
    if (!span) return 'no-span'
    const range = document.createRange()
    const tn = span.firstChild || span
    range.selectNodeContents(tn)
    range.collapse(${edge !== 'end' ? 'true' : 'false'})
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    return 'ok'
  })()`)
  if (r !== 'ok') throw new Error('放置光标失败: ' + r)
  await sleeps(600)
}
/** 选中正文行内包含 substr 的文本（独立 evaluate） */
const selectBodySpanText = async substr => {
  const r = await evalWithTimeout(`(() => {
    const nodes = ${BODY_NODES}
    const n = nodes.find(x => (x.innerText || '').includes(${JSON.stringify(substr)}))
    if (!n) return 'no-node'
    const ce = n.querySelector('[contenteditable="true"]') || n.closest('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const spans = [...n.querySelectorAll('[data-slate-string]')]
    const span = spans.find(s => (s.textContent || '').includes(${JSON.stringify(substr)}))
    if (!span) return 'no-span'
    const tn = span.firstChild
    const i = (span.textContent || '').indexOf(${JSON.stringify(substr)})
    const range = document.createRange()
    range.setStart(tn, i)
    range.setEnd(tn, i + ${JSON.stringify(substr)}.length)
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    return 'ok'
  })()`)
  if (r !== 'ok') throw new Error('选中文本失败: ' + r)
  await sleeps(600)
}
/** 对当前有选区的编辑器执行 linkSelection（此时 Slate 选区已同步） */
const linkSelectionActive = addon => evalWithTimeout(`(() => {
  const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
  const ed = eds.find(e => e.selection)
  if (!ed) return 'no-active-editor'
  return window.__notekitApp.addons[${JSON.stringify(addon)}].linkSelection(ed)
})()`)

/** 当前引用元素（编辑态/预览态）+ Slate 选区的诊断快照 */
const snapshot = async () => JSON.parse(await evalWithTimeout(`(() => {
  const clean = s => (s || '').replace(/\\u200b/g, '')
  const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
  const editing = !!document.querySelector('.editor-view.editor-from-router .refer-text.refer-editing')
  const preview = ref ? !!ref.querySelector('[contenteditable="false"]') : null
  const labelEditing = document.querySelector('.editor-view.editor-from-router .refer-editing .alias-text')
  let brackets = null
  if (labelEditing) {
    brackets = { before: getComputedStyle(labelEditing, '::before').content, after: getComputedStyle(labelEditing, '::after').content }
  }
  const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
  const editor = eds.find(e => e.selection) ?? eds[0] ?? null
  const sel = editor && editor.selection
  let selInsideRefer = false
  let selParentBlock = null
  if (sel) {
    try {
      const parentEntry = editor.parent(sel.anchor.path)
      const parent = Array.isArray(parentEntry) ? parentEntry[0] : parentEntry
      selParentBlock = parent && parent.blockType ? parent.blockType : null
      selInsideRefer = selParentBlock === 'refer'
    } catch (e) {}
  }
  return JSON.stringify({
    editing,
    preview,
    refText: clean(ref && ref.textContent),
    editingText: clean(labelEditing && labelEditing.textContent),
    brackets,
    sel: sel ? { path: sel.anchor.path, offset: sel.anchor.offset } : null,
    selInsideRefer,
    selParentBlock,
  })
})()`))

/** 引用元素 + 目标 item 的模型快照（读正文 bullet item 的 leaves） */
const modelSnapshot = async () => JSON.parse(await evalWithTimeout(`(() => {
  const clean = s => (s || '').replace(/\\u200b/g, '')
  const mem = window.__notekitApp.addons.dbMemory
  const src = mem.nodes[${JSON.stringify(bodyKy)}]
  const leaf = (src?.leaves ?? []).find(l => l.blockType === 'refer')
  const target = leaf ? mem.nodes[leaf.value] : null
  return JSON.stringify({
    leaf: leaf ? { value: leaf.value, note: leaf.note, labelText: leaf.labelText, isVoid: leaf.isVoid, text: clean(leaf.children?.map(c => c.text).join('')) } : null,
    referText: src?.referText,
    targetOri: clean(target?.ori || '').slice(0, 60),
  })
})()`))

/** 从正文行 substr 文本端点出发，按方向键走进引用显示文字 */
const enterReferByArrow = async (fromSubstr, edge) => {
  await caretAtBodySpanEdge(fromSubstr, edge)
  let snap = await snapshot()
  for (let i = 0; i < 8 && !(snap.editing && snap.selInsideRefer); i++) {
    await key(edge === 'end' ? ARROW_LEFT : ARROW_RIGHT)
    snap = await snapshot()
  }
  return snap
}

// 全局看门狗：卡死时杀掉隔离实例并退出
const WATCHDOG = setTimeout(async () => {
  console.log('看门狗触发：总时长超 14 分钟，强制收尾')
  await stopApp().catch(() => {})
  process.exit(2)
}, 14 * 60 * 1000)

let hardFail = null
try {
// 启动：准备目标页与源页
await routeWhenReady(TOPIC)
pageKy = await pathname()
await routeWhenReady(SRC)
await waitEditor()
bodyKy = await ensureBodyLine(LINE)
await sleeps(400)

/* ---------- E1 创建 ((引用)) 后 ←← 进入显示文字直接打字，编辑态显示括号 ---------- */
await selectBodySpanText(TOPIC)
await linkSelectionActive('refer')
await sleeps(500)
{
  const snap = await snapshot()
  check('E1 引用元素已创建', !!snap.refText, snap)
  await key(ARROW_LEFT)
  await key(ARROW_LEFT)
  const inside = await snapshot()
  console.log('E1 进入后快照:', JSON.stringify(inside))
  check('E1a ←← 进入引用显示文字', inside.editing && inside.selInsideRefer, inside)
  check('E1b 编辑态显示 (( )) 括号', inside.brackets?.before === '"(("' && inside.brackets?.after === '"))"', inside.brackets)
  await typeText('甲')
  const after = await modelSnapshot()
  const clean = s => (s || '').replace(/\u200b/g, '')
  check('E1c 引用内直接打字改别名', clean(after.leaf?.text).includes('甲') && clean(after.leaf?.text).length === TOPIC.length + 1, after)
  check('E1d 别名落盘 note 且目标未动', after.leaf?.note === clean(after.leaf?.text) && after.targetOri === TOPIC, after)
}

/* ---------- E2 行尾 ArrowLeft 走进显示文字并编辑 ---------- */
await goSource()
{
  const snap = await enterReferByArrow('后', 'end')
  console.log('E2 进入后快照:', JSON.stringify(snap))
  check('E2 ArrowLeft 走进引用显示文字', snap.editing && snap.selInsideRefer, snap)
  await typeText('乙')
  const after = await modelSnapshot()
  const clean = s => (s || '').replace(/\u200b/g, '')
  check('E2 显示文字内打字生效', clean(after.leaf?.text).includes('乙') && after.leaf?.note === clean(after.leaf?.text), after)
}

/* ---------- E3 行首 ArrowRight 进入显示文字 ---------- */
await goSource()
{
  const snap = await enterReferByArrow('前缀', 'start')
  console.log('E3 进入后快照:', JSON.stringify(snap))
  check('E3 行首 ArrowRight 进入引用显示文字', snap.editing && snap.selInsideRefer, snap)
}

/* ---------- E4 退出编辑回到预览态 ---------- */
{
  await key(ARROW_LEFT)  // 从引用内退出
  await caretAtBodySpanEdge('后', 'end')  // 光标移到远离引用的位置
  const snap = await snapshot()
  check('E4 光标离开后恢复预览态', snap.editing === false && snap.preview === true, snap)
  const m = await modelSnapshot()
  const clean = s => (s || '').replace(/\u200b/g, '')
  check('E4 退出后别名保留且同步', clean(m.leaf?.note) === clean(m.leaf?.text) && clean(m.leaf?.text).includes('甲') && clean(m.leaf?.text).includes('乙'), m)
}

/* ---------- E5 预览态真点击引用仍跳转 ---------- */
{
  const box = await evalWithTimeout(`(() => {
    const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
    if (!ref) return null
    const inner = ref.querySelector('[contenteditable="false"]') || ref
    inner.scrollIntoView({ block: 'center' })
    const r = inner.getBoundingClientRect()
    return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }
  })()`)
  if (!box) throw new Error('找不到引用预览元素')
  await clickAt(box.x, box.y)
  await sleeps(1000)
  const now = await pathname()
  check('E5 点击引用跳转目标', kyOf(now) === kyOf(pageKy), { now, target: pageKy })
  await goSource()
}

/* ---------- E6 撤销/重做 ---------- */
{
  await caretAtBodySpanEdge('后', 'end')
  const snap = await enterReferByArrow('后', 'end')
  check('E6a 进入引用准备编辑', snap.editing && snap.selInsideRefer, snap)
  await typeText('丙')
  const clean = s => (s || '').replace(/\u200b/g, '')
  const beforeUndo = await modelSnapshot()
  check('E6b 追加「丙」生效', clean(beforeUndo.leaf?.text).includes('丙') && beforeUndo.leaf?.note === clean(beforeUndo.leaf?.text), beforeUndo)
  for (let i = 0; i < 4; i++) {
    const cur = await modelSnapshot()
    if (!clean(cur.leaf?.text).includes('丙')) break
    await key(CMD_Z)
  }
  const undone = await modelSnapshot()
  check('E6c 撤销移除「丙」', !clean(undone.leaf?.text).includes('丙') && clean(undone.leaf?.text) === clean(beforeUndo.leaf?.text).replace('丙', ''), undone)
  for (let i = 0; i < 4; i++) {
    const cur = await modelSnapshot()
    if (clean(cur.leaf?.text).includes('丙')) break
    await key(CMD_SHIFT_Z)
  }
  const redone = await modelSnapshot()
  check('E6d 重做恢复编辑', clean(redone.leaf?.text).includes('丙') && clean(redone.leaf?.text) === clean(beforeUndo.leaf?.text), redone)
}

/* ---------- E7 重启后别名保留、可继续编辑、点击跳转 ---------- */
await evalWithTimeout(`window.__notekitApp.addons.dbDisk?.flush?.(); true`).catch(() => {})
await sleeps(1500)
await stopApp()
cdp = await startApp()
await routeWhenReady(SRC)
await goSource()  // 确保落在源页
bodyKy = await ensureBodyLine(LINE)
{
  const m = await modelSnapshot()
  const clean = s => (s || '').replace(/\u200b/g, '')
  check('E7a 重启后引用别名保留', clean(m.leaf?.text).includes('甲乙丙') && m.leaf?.value === kyOf(pageKy), m)
  const snap = await enterReferByArrow('后', 'end')
  check('E7b 重启后仍可键盘进入编辑', snap.editing && snap.selInsideRefer, snap)
  await caretAtBodySpanEdge('后', 'end')
  const box = await evalWithTimeout(`(() => {
    const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
    if (!ref) return null
    const inner = ref.querySelector('[contenteditable="false"]') || ref
    inner.scrollIntoView({ block: 'center' })
    const r = inner.getBoundingClientRect()
    return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }
  })()`)
  await clickAt(box.x, box.y)
  await sleeps(1000)
  const now = await pathname()
  check('E7c 重启后点击引用仍跳转', kyOf(now) === kyOf(pageKy), { now, target: pageKy })
}

/* ---------- E8 旧格式 void 引用升级（正文行） ---------- */
await goSource()
{
  await evalWithTimeout(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const src = mem.nodes[${JSON.stringify(bodyKy)}]
    const leaves = [
      { text: '旧引用 ' },
      { inline: true, isVoid: true, blockType: 'refer', value: ${JSON.stringify(kyOf(pageKy))}, iky: 'legacy-iky-' + Date.now(), children: [{ text: '((' + ${JSON.stringify(kyOf(pageKy))} + '))' }] },
      { text: ' 行尾' },
    ]
    mem.updateItem(src.ky, { leaves })
    return 'ok'
  })()`)
  await goSource()  // 重进页面让编辑器重新加载 leaves
  const snap = await enterReferByArrow('行尾', 'end')
  console.log('E8 快照:', JSON.stringify(snap))
  check('E8a 旧 void 引用升级显示目标标题', snap.refText === TOPIC, snap)
  check('E8b 旧 void 引用可键盘进入编辑', snap.editing && snap.selInsideRefer, snap)
  await typeText('改')
  const after = await modelSnapshot()
  const clean = s => (s || '').replace(/\u200b/g, '')
  check('E8c 旧 void 引用打字改别名', clean(after.leaf?.text).includes('改') && after.leaf?.note === clean(after.leaf?.text), after)
}

/* ---------- E9 [[双链]] 基线（正文行） ---------- */
await goSource()
{
  // 光标放到正文行末尾，追加双链文字
  await caretAtBodySpanEdge('行尾', 'end')
  await typeText(' 双链尾巴')
  await selectBodySpanText('双链尾巴')
  await linkSelectionActive('bilink')
  await sleeps(400)
  const created = await evalWithTimeout(`(() => {
    const links = [...document.querySelectorAll('.editor-view.editor-from-router span.bilink')]
    return links.some(l => (l.textContent || '').includes('双链尾巴'))
  })()`)
  check('E9a 双链已创建', !!created, null)
  await caretAtBodySpanEdge('双链尾巴', 'end')
  await key(ARROW_LEFT)
  const inside = JSON.parse(await evalWithTimeout(`(() => {
    const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
    const editor = eds.find(e => e.selection)
    const sel = editor.selection
    let parentBlock = null
    try { const pe = editor.parent(sel.anchor.path); parentBlock = (Array.isArray(pe) ? pe[0] : pe).blockType ?? null } catch (e) {}
    return JSON.stringify({ collapsed: sel.anchor.offset === sel.focus.offset, parentBlock })
  })()`))
  check('E9b 双链旁 ArrowLeft 进入显示文字（基线不回归）', inside.collapsed && inside.parentBlock === 'bilink', inside)
  await typeText('基')
  const bl = JSON.parse(await evalWithTimeout(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const src = mem.nodes[${JSON.stringify(bodyKy)}]
    const leaf = (src?.leaves ?? []).find(l => l.blockType === 'bilink')
    return JSON.stringify({ text: (leaf?.children ?? []).map(c => c.text).join(''), topic: leaf?.topic })
  })()`))
  check('E9c 双链显示文字可编辑', bl.text.includes('基'), bl)
}

const errs = consoleErrors()
// link-nav-verify 记录的既有问题：未传 marker 的 length 读取（与本任务无关），按同一标准白名单
const knownIssue = e => e.includes("reading 'length'")
const unknownErrs = errs.filter(e => !knownIssue(e))
check('无未知控制台报错', unknownErrs.length === 0, { known: errs.filter(knownIssue).length, unknown: unknownErrs.slice(0, 5) })

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, consoleErrors: errs }, null, 2))
console.log(`\n结果：${results.filter(r => r.ok).length}/${results.length} 通过，输出 ${path.join(outDir, 'result.json')}`)
if (failures.length) console.log('失败项：', failures.join('、'))
} catch (e) {
  hardFail = e
  console.error('验收脚本异常中断:', e && e.message)
} finally {
  await stopApp().catch(() => {})
  clearTimeout(WATCHDOG)
  if (hardFail) {
    await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, fatal: String(hardFail && hardFail.message || hardFail) }, null, 2)).catch(() => {})
    process.exit(1)
  }
}
process.exit(failures.length ? 1 : 0)
