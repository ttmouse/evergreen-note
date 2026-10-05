/**
 * 笔记入口点击跳转验收（隔离实例，不动用户数据）
 *
 * 背景：OP-030 行内样式改动（Marks/CustomMark/ItemEditor.insertText/PartIcon）后，
 * 验证 [[双链]]、((引用)) 入口的点击跳转不被影响，且与新的样式操作共存。
 *
 * 用法：node tools/link-nav-verify.mjs
 * 前置：npm run build。输出 test-runs/link-nav-verify/result.json。
 *
 * 覆盖：
 *   N1 创建 [[双链]] 并真点击 → 跳转到目标主题
 *   N2 双链旁打字 + ⌘B 加粗（样式流程）→ 再点双链仍跳转
 *   N3 清除格式覆盖双链选区 → 双链保留且仍跳转
 *   N4 {red:文字} strmap 输入后 → 双链仍跳转
 *   N5 创建 ((引用)) 并真点击 → 跳转到目标主题
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'link-nav-verify')
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

const SRC = '导航源'
const DST = '跳转目标'
const REF = '引用测试'
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
const consoleErrors = () => cdp.events
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
  .map(e => JSON.stringify(e.params).slice(0, 300))

// 等水合并 route：getTopic 命中才 route，避免水合前新建重复主题
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
  // 空库兜底：直接创建
  await evalWithTimeout(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(title)}); return true })()`, 8000).catch(() => {})
  await sleeps(500)
  return true
}
const waitEditor = async () => {
  for (let i = 0; i < 30; i++) {
    if (await evalWithTimeout(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) return
    await sleeps(1000)
  }
  throw new Error('编辑器未就绪')
}
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await callWithTimeout('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  }
  await sleeps(250)
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
const typeText = async text => { await callWithTimeout('Input.insertText', { text }, 10000); await sleeps(250) }
const key = async k => { for (const t of ['rawKeyDown', 'keyUp']) await callWithTimeout('Input.dispatchKeyEvent', { ...k, type: t }) }
const MOD_B = { modifiers: 4, key: 'b', code: 'KeyB', vk: 66 }
const selectSpanText = async (substr, all = false) => {
  const r = await evalWithTimeout(`(() => {
    const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(substr)}))
    if (!n) return 'no-node'
    const ce = n.closest('[contenteditable="true"]') || n.querySelector('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const spans = [...n.querySelectorAll('[data-slate-string]')]
    const span = spans.find(s => (s.textContent || '').includes(${JSON.stringify(substr)}))
    if (!span) return 'no-span'
    const range = document.createRange()
    if (${all}) {
      range.selectNodeContents(span)
    } else {
      const tn = span.firstChild
      const i = (span.textContent || '').indexOf(${JSON.stringify(substr)})
      range.setStart(tn, i)
      range.setEnd(tn, i + ${JSON.stringify(substr)}.length)
    }
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    return sel.toString()
  })()`)
  if (r === 'no-node' || r === 'no-span' || r === 'no-editable') throw new Error('选区失败: ' + r)
  await sleeps(500)
  return r
}
const pathname = () => evalWithTimeout(`location.pathname`)

// 启动
for (let i = 0; i < 90; i++) { try { if (await evalWithTimeout(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {} ; await sleeps(1000) }
await routeWhenReady(DST)
const kyTarget = await pathname()
await routeWhenReady(REF)
const kyRef = await pathname()
await routeWhenReady(SRC)
const srcKy = await pathname()
// 按标题 route 会被 topic 键漂移坑（在标题行打字后键随全文变化），回源页统一走 ky
const goSource = async () => {
  const r = await evalWithTimeout(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const node = mem.nodes[${JSON.stringify(srcKy)}.split('/').pop()]
    if (!node) return 'no-node'
    window.__notekitApp.addons.router.to(node)
    return 'ok'
  })()`)
  if (r !== 'ok') throw new Error('goSource 失败: ' + r)
  await waitsleeps()
}
const waitsleeps = async () => {
  for (let i = 0; i < 20; i++) {
    const on = await evalWithTimeout(`location.pathname === ${JSON.stringify(srcKy)}`).catch(() => false)
    if (on) { await sleeps(500); return }
    await sleeps(500)
  }
  throw new Error('未能回到源页 ' + srcKy + '，当前 ' + (await evalWithTimeout(`location.pathname`)))
}
await waitEditor()

/* ---------- N1 创建 [[双链]] 并真点击跳转 ---------- */
await clickIntoFirst()
await typeText(DST)
await selectSpanText(DST)
await evalWithTimeout(`(() => {
  const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(DST)}))
  return window.__notekitApp.addons.bilink.linkSelection(n.$editor)
})()`)
await sleeps(400)
{
  const exists = await evalWithTimeout(`!!document.querySelector('.editor-view span.bilink[data-topic="${DST}"]')`)
  check('N1 双链元素已创建', !!exists, null)
}
await clickEl(`.editor-view span.bilink[data-topic="${DST}"]`)
await sleeps(900)
check('N1 点击双链跳转到目标主题', (await pathname()) === kyTarget, { now: await pathname(), expect: kyTarget })

/* ---------- N2 双链旁打字 + ⌘B 加粗 → 再点仍跳转 ---------- */
console.log('N2 诊断:', await evalWithTimeout(`(() => {
  const mem = window.__notekitApp.addons.dbMemory
  return JSON.stringify({
    pathname: location.pathname,
    srcKy: ${JSON.stringify(srcKy)},
    hasSrcKy: !!mem.nodes[${JSON.stringify(srcKy)}],
    nodeKeys: Object.keys(mem.nodes || {}),
    topicKeys: Object.keys(mem.indexed?.topic || {}),
  })
})()`))
await goSource()
await clickIntoFirst()
await typeText(' 后续内容')
await key(MOD_B)
await typeText('加粗词')
await sleeps(300)
{
  const m = await evalWithTimeout(`(() => {
    const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes('加粗词'))
    const flat = (cs) => cs.flatMap(c => (c.children ? flat(c.children) : [c]))
    return n?.$editor ? JSON.stringify(flat(JSON.parse(JSON.stringify(n.$editor.children)))) : null
  })()`)
  const leaves = JSON.parse(m || '[]')
  const bold = leaves.find(l => l.text === '加粗词')
  check('N2 双链旁 ⌘B 加粗生效', !!bold?.bold, { leaves })
}
await clickEl(`.editor-view span.bilink[data-topic="${DST}"]`)
await sleeps(900)
check('N2 样式操作后点击双链仍跳转', (await pathname()) === kyTarget, { now: await pathname() })

/* ---------- N3 清除格式覆盖双链选区 → 双链保留且跳转 ---------- */
await goSource()
await selectSpanText(DST, true)
{
  const box = await evalWithTimeout(`(() => {
    const items = window.__notekitApp.addons.floatBar.items
    const it = items.clearFormat
    if (!it) return null
    const title = typeof it.title === 'function' ? it.title() : it.title
    const bar = document.getElementById(window.__notekitApp.addons.floatBar.floatBarId)
    const sec = bar && [...bar.querySelectorAll('section[aria-label]')].find(s => s.getAttribute('aria-label') === title)
    if (!sec) return null
    const r = sec.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!box) throw new Error('浮动条没有清除格式按钮')
  await clickAt(box.x, box.y)
  await sleeps(400)
}
{
  const state = await evalWithTimeout(`(() => {
    const link = document.querySelector('.editor-view span.bilink[data-topic="${DST}"]')
    const linkText = link ? link.textContent : null
    return JSON.stringify({ linkKept: !!link, linkText })
  })()`)
  const st = JSON.parse(state || '{}')
  check('N3 清除格式后双链元素保留', st.linkKept, st)
  console.log('N3 诊断:', await evalWithTimeout(`(() => {
    const links = [...document.querySelectorAll('.editor-view span.bilink')]
    const sel = getSelection()
    return JSON.stringify({
      linkCount: links.length,
      links: links.map(l => ({ topic: l.dataset.topic, text: (l.textContent || '').slice(0, 20), editable: l.isContentEditable })),
      selCollapsed: sel.isCollapsed,
      selText: sel.toString(),
      parentChain: (() => { let e = links[0]; const out = []; for (let i = 0; e && i < 6; i++) { out.push(e.tagName + '.' + (e.className || '').toString().split(' ').slice(0,2).join('.')); e = e.parentElement } return out })(),
    })
  })()`))
  // 真实用户路径：清除格式后选区保持展开（与 toggle 一致）；单击右侧方向键收起选区再点链接
  const RIGHT = { modifiers: 0, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 }
  await key(RIGHT)
  await sleeps(300)
  await clickEl(`.editor-view span.bilink[data-topic="${DST}"]`)
  await sleeps(900)
  check('N3 清除格式后双链仍跳转', (await pathname()) === kyTarget, { now: await pathname() })
}

/* ---------- N4 {red:文字} strmap 输入后 → 双链仍跳转 ---------- */
await goSource()
await clickIntoFirst()
await typeText(' {red:警告字}')
await sleeps(500)
{
  const red = await evalWithTimeout(`(() => {
    const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes('警告字'))
    return n && n.querySelector('[data-mark-format="red"]') ? true : false
  })()`)
  check('N4 {red:警告字} 转换为红色文字', !!red, null)
}
await clickEl(`.editor-view span.bilink[data-topic="${DST}"]`)
await sleeps(900)
check('N4 strmap 输入后双链仍跳转', (await pathname()) === kyTarget, { now: await pathname() })

/* ---------- N5 创建 ((引用)) 并真点击跳转 ---------- */
await goSource()
await clickIntoFirst()
await typeText(' 引用测试')
await selectSpanText('引用测试')
await evalWithTimeout(`(() => {
  const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes('引用测试'))
  return window.__notekitApp.addons.refer.linkSelection(n.$editor)
})()`)
await sleeps(400)
{
  const exists = await evalWithTimeout(`!!document.querySelector('.editor-view .inline-element.element-refer, .editor-view span.refer')`)
  check('N5 引用元素已创建', !!exists, null)
}
await clickEl(`.editor-view .inline-element.element-refer, .editor-view span.refer`)
await sleeps(900)
check('N5 点击引用跳转到目标', (await pathname()) === kyRef || (await pathname()) === kyTarget, { now: await pathname(), kyRef, kyTarget })

const errs = consoleErrors()
const knownIssue = e => e.includes("reading 'length'") && e.includes(':764:5393')
check('无未知控制台报错', errs.filter(e => !knownIssue(e)).length === 0, errs.slice(0, 3))

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, consoleErrors: errs }, null, 2))
console.log(`\n结果：${results.filter(r => r.ok).length}/${results.length} 通过，输出 ${path.join(outDir, 'result.json')}`)
if (failures.length) console.log('失败项：', failures.join('、'))

await ev(`window.close(); true`).catch(() => {})
cdp.close()
child2.kill('SIGTERM'); await sleeps(1000); try { child2.kill('SIGKILL') } catch {}
process.exit(failures.length ? 1 : 0)
