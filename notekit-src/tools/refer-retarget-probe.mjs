/**
 * 探索探针：已有的 ((块引用)) 能不能「直接编辑」换成另一个目标块（A → B）。
 *
 * 背景：正文里已有一条指向 A 的块引用；用户问的是「把显示文字改掉，目标会不会变成 B」。
 * 已知（refer-edit-verify.mjs E1d）打字只改别名 note、不动目标 value。本探针补两件未知：
 *   P1 在引用显示文字里输入 (( ，块引用候选菜单会不会弹出；选中 B 之后目标到底变没变
 *   P2 正规做法（删掉旧引用、重新 (( 选 B）能否得到一条指向 B 的引用
 *
 * 用法：node tools/refer-retarget-probe.mjs（隔离 profile，不动用户数据）
 * 输出：/tmp/roamedit-refer-retarget-probe/result.json（每步增量写）+ 控制台快照
 * 用后即删的诊断脚本，不属于交付物。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = '/tmp/roamedit-refer-retarget-probe'
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

const TOPIC_A = '换目标甲'
const TOPIC_B = '换目标乙'
const SRC = '换目标源页'
const LINE = `前缀 ${TOPIC_A} 后`
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')

const steps = []
let child = null
const flushSteps = async extra => {
  try {
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ steps, ...extra }, null, 2))
  } catch (e) { console.log('写结果失败: ' + e.message) }
}
const note = (step, data) => {
  steps.push({ step, at: new Date().toISOString(), data })
  console.log(`\n### ${step}\n${JSON.stringify(data, null, 1)}`)
  flushSteps()
}
const killOrphans = async () => {
  const { execSync } = await import('node:child_process')
  try { execSync(`pkill -9 -f ${JSON.stringify(profile)} 2>/dev/null || true`, { shell: '/bin/bash' }) } catch {}
  await sleeps(1200)
}
const startApp = async () => {
  await killOrphans()
  const debugPort = await freePort()
  child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', d => { logs += d })
  child.stderr.on('data', d => { logs += d })
  child.on('exit', (code, sig) => console.log(`boot: electron 退出 code=${code} sig=${sig}\n${logs.slice(-600)}`))
  let cdp = null
  for (let i = 0; i < 60 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
  if (!cdp) throw new Error('CDP 未就绪\n' + logs.slice(-1500))
  for (let i = 0; i < 45; i++) {
    const ok = await Promise.race([cdp.evaluate(`!!window.__notekitApp`).catch(() => false), sleeps(5000).then(() => 'timeout')])
    if (ok === true) break
    if (i === 44) throw new Error('__notekitApp 未就绪\n' + logs.slice(-1500))
    await sleeps(1000)
  }
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
const evalT = (e, ms = 15000) => Promise.race([ev(e), sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) })])
const callT = (m, p = {}, ms = 15000) => Promise.race([cdp.call(m, p), sleeps(ms).then(() => { throw new Error(`${m} 超时`) })])
const key = async k => { for (const t of ['rawKeyDown', 'keyUp']) await callT('Input.dispatchKeyEvent', { ...k, type: t }); await sleeps(300) }
const typeText = async text => { await callT('Input.insertText', { text }, 10000); await sleeps(500) }
const ARROW_LEFT = { modifiers: 0, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 }
const ENTER = { modifiers: 0, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }
const ESCAPE = { modifiers: 0, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
const pathname = () => evalT(`location.pathname`)
const kyOf = p => String(p || '').replace(/^\/static/, '').split('/').pop()
let srcKy = ''
let bodyKy = ''

/** 按 data-ky 精确定位正文 bullet 节点（不靠可见文字，引用预览是异步渲染的） */
const bodyNodeExpr = () => `[...document.querySelectorAll('.editor-view.editor-from-router .node')].find(n => n.getAttribute('data-ky') === ${JSON.stringify(bodyKy)})`
const allNodesExpr = () => `[...document.querySelectorAll('.editor-view.editor-from-router .node')]`

const routeWhenReady = async title => {
  // 新 profile 里主题还不存在，先等 topic addon 就绪，再直接 route（route 会创建主题）
  for (let i = 0; i < 60; i++) {
    const ready = await evalT(`!!window.__notekitApp?.addons?.topic?.route`).catch(() => false)
    if (ready) break
    await sleeps(1000)
  }
  const ok = await evalT(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(title)}); return !!window.__notekitApp.addons.topic.getTopic(${JSON.stringify(title)}) })()`, 20000).catch(e => 'err:' + e.message)
  await sleeps(800)
  return ok
}
const waitEditor = async () => {
  for (let i = 0; i < 30; i++) {
    if (await evalT(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) return
    await sleeps(1000)
  }
  throw new Error('编辑器未就绪')
}
const waitBodyNode = async () => {
  for (let i = 0; i < 30; i++) {
    const ok = await evalT(`(() => { const n = ${bodyNodeExpr()}; return !!n && !!n.querySelector('[data-slate-node]') })()`).catch(() => false)
    if (ok) { await sleeps(400); return }
    await sleeps(500)
  }
  throw new Error('正文节点未渲染: ' + bodyKy)
}
const goSource = async () => {
  const r = await evalT(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const node = mem.nodes[${JSON.stringify(srcKy ? kyOf(srcKy) : '')}]
    if (!node) return 'no-node'
    window.__notekitApp.addons.router.to(node)
    return 'ok'
  })()`).catch(e => 'err:' + e.message)
  for (let i = 0; i < 20; i++) {
    if (await evalT(`location.pathname.includes(${JSON.stringify(srcKy ? kyOf(srcKy) : '')})`).catch(() => false)) break
    await sleeps(500)
  }
  await sleeps(700)
  await waitEditor()
  await waitBodyNode()
  return r
}

const ensureBodyLine = async text => {
  await waitEditor()
  const exists = bodyKy ? await evalT(`(() => !!${bodyNodeExpr()})()`).catch(() => false) : false
  if (!exists) {
    await evalT(`(() => {
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
    await sleeps(700)
    bodyKy = await evalT(`(() => {
      const mem = window.__notekitApp.addons.dbMemory
      const head = s => String(s || '').replace(/\u200b/g, '')
      const subs = mem.getSubitems(${JSON.stringify(srcKy ? kyOf(srcKy) : '')}) || []
      const hit = subs.find(item => head(item.leaves?.map(c => c.text ?? '').join('')).includes(${JSON.stringify(text)}) || head(item.ori).includes(${JSON.stringify(text)}))
      return hit ? String(hit.ky) : ''
    })()`)
  }
  if (!bodyKy) throw new Error('正文行未就绪: ' + text)
  await waitBodyNode()
  return bodyKy
}
const selectBodySpanText = async substr => {
  const r = await evalT(`(() => {
    const n = ${bodyNodeExpr()}
    if (!n) return 'no-node'
    const ce = n.querySelector('[contenteditable="true"]') || n.closest('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const spans = [...n.querySelectorAll('[data-slate-string]')]
    const span = spans.find(s => (s.textContent || '').includes(${JSON.stringify(substr)}))
    if (!span) return 'no-span:' + spans.map(s => (s.textContent || '').slice(0, 12)).join('|')
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
const caretAtBodySpanEdge = async (substr, edge) => {
  const r = await evalT(`(() => {
    const n = ${bodyNodeExpr()}
    if (!n) return 'no-node'
    const ce = n.querySelector('[contenteditable="true"]') || n.closest('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const spans = [...n.querySelectorAll('[data-slate-string], [data-slate-zero-width]')]
    const span = spans.find(s => (s.textContent || '').includes(${JSON.stringify(substr)})) || (edge === 'end' ? spans[spans.length - 1] : spans[0])
    if (!span) return 'no-span:' + spans.map(s => (s.textContent || '').slice(0, 12)).join('|')
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
const linkSelectionActive = addon => evalT(`(() => {
  const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
  const ed = eds.find(e => e.selection)
  if (!ed) return 'no-active-editor'
  return window.__notekitApp.addons[${JSON.stringify(addon)}].linkSelection(ed)
})()`)

/** 模型快照：正文 bullet 的 leaves（递归展开嵌套 inline 元素）+ referText + 两个目标的 ky */
const modelSnapshot = () => evalT(`(() => {
  const clean = s => String(s || '').replace(/\\u200b/g, '')
  const mem = window.__notekitApp.addons.dbMemory
  const topic = t => { const x = window.__notekitApp.addons.topic.getTopic(t); return x ? x.ky : null }
  const walk = (leaf, depth) => {
    if (depth > 3) return { cut: true }
    const kids = (leaf.children || []).filter(c => c && c.blockType)
    return {
      blockType: leaf.blockType,
      value: leaf.value,
      note: leaf.note,
      labelText: leaf.labelText,
      text: leaf.text !== undefined ? clean(leaf.text) : clean((leaf.children || []).map(c => c.text).join('')),
      nested: kids.length ? kids.map(k => walk(k, depth + 1)) : undefined,
    }
  }
  const src = mem.nodes[${JSON.stringify(bodyKy)}]
  const leaves = (src?.leaves || []).map(l => walk(l, 0))
  const refs = []
  const collect = l => { if (l.blockType === 'refer') refs.push({ value: l.value, note: l.note, text: clean((l.children || []).map(c => c.text).join('')) }); (l.children || []).forEach(c => c && c.blockType && collect(c)) }
  ;(src?.leaves || []).forEach(collect)
  return JSON.stringify({ kyA: topic(${JSON.stringify(TOPIC_A)}), kyB: topic(${JSON.stringify(TOPIC_B)}), referText: src?.referText, refs, leaves })
})()`).then(s => s && JSON.parse(s))

/** 页面/编辑器状态快照：元素 DOM 文本、嵌套引用、edit 态、选区父块、候选菜单 */
const uiSnapshot = () => evalT(`(() => {
  const clean = s => String(s || '').replace(/\\u200b/g, '')
  const body = ${bodyNodeExpr()}
  const refEls = body ? [...body.querySelectorAll('.refer-text')] : []
  const menu = document.querySelector('.autocomplete-comp')
  const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
  const editor = eds.find(e => e.selection) ?? eds[0] ?? null
  let selParentBlock = null
  if (editor && editor.selection) {
    try { const pe = editor.parent(editor.selection.anchor.path); selParentBlock = (Array.isArray(pe) ? pe[0] : pe).blockType ?? null } catch (e) {}
  }
  return JSON.stringify({
    lineText: clean(body && body.innerText),
    refCount: refEls.length,
    refTexts: refEls.map(r => clean(r.textContent)),
    editing: !!document.querySelector('.editor-view.editor-from-router .refer-text.refer-editing'),
    nestedRefs: refEls.map(r => r.querySelectorAll('.refer-text').length),
    menuOpen: !!menu,
    menuText: clean(menu && menu.innerText).slice(0, 160),
    selParentBlock,
  })
})()`).then(s => s && JSON.parse(s))

const clickMenuItem = async substr => {
  const box = await evalT(`(() => {
    const menu = document.querySelector('.autocomplete-comp')
    if (!menu) return 'no-menu'
    const items = [...menu.querySelectorAll('[class*=menu-item],[class*=popup-item],[role=menuitem],li,div')]
      .filter(el => (el.innerText || '').includes(${JSON.stringify(substr)}) && el.children.length <= 3)
    const target = items[items.length - 1]
    if (!target) return 'no-item:' + (menu.innerText || '').slice(0, 120)
    const r = target.getBoundingClientRect()
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  })()`)
  if (box && box.startsWith('{')) {
    const { x, y } = JSON.parse(box)
    for (const type of ['mousePressed', 'mouseReleased']) await callT('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
    await sleeps(1000)
  }
  return box
}

// 看门狗
const WATCHDOG = setTimeout(async () => { console.log('看门狗触发：强制收尾'); await flushSteps({ fatal: 'watchdog' }); await stopApp().catch(() => {}); process.exit(2) }, 7 * 60 * 1000)

let fatal = null
try {
  const routeA = await routeWhenReady(TOPIC_A)
  const pageA = await pathname()
  const routeB = await routeWhenReady(TOPIC_B)
  const pageB = await pathname()
  const routeS = await routeWhenReady(SRC)
  srcKy = await pathname()
  await waitEditor()
  bodyKy = await ensureBodyLine(LINE)
  note('P0 准备：目标与前置', { routeA, routeB, routeS, pageA: kyOf(pageA), pageB: kyOf(pageB), src: kyOf(srcKy), body: bodyKy })

  // 建立一条指向 A 的引用（走正常入口：选中文字 → 浮动栏引用）
  await selectBodySpanText(TOPIC_A)
  await linkSelectionActive('refer')
  await sleeps(800)
  note('P0b 初始引用（指向甲）', { ui: await uiSnapshot(), model: await modelSnapshot() })

  // 光标移到引用右边，再回到引用显示文字内部
  await caretAtBodySpanEdge('后', 'start')
  await key(ARROW_LEFT)
  await key(ARROW_LEFT)
  note('P1a 进入引用显示文字（编辑态）', { ui: await uiSnapshot() })

  // 关键动作一：在引用显示文字里输入 (( ，看候选菜单是否弹出
  await typeText('((')
  await sleeps(900)
  note('P1b 在引用显示文字里输入 ((', { ui: await uiSnapshot(), model: await modelSnapshot() })

  // 输入 B 的关键词
  await typeText(TOPIC_B.slice(-1))
  await sleeps(900)
  note('P1c 输入关键词后候选菜单', { ui: await uiSnapshot() })

  const clicked = await clickMenuItem(TOPIC_B)
  note('P1d 候选菜单定位与点击', { clicked })
  note('P1e 选中候选之后', { ui: await uiSnapshot(), model: await modelSnapshot() })

  // 离开引用、落库、重进页面复核持久化结果
  await key(ESCAPE)
  await caretAtBodySpanEdge('前缀', 'start')
  await sleeps(800)
  await evalT(`window.__notekitApp.addons.dbDisk?.flush?.(); true`).catch(() => {})
  await sleeps(1200)
  await goSource()
  note('P1f 重进页面后（持久化）', { ui: await uiSnapshot(), model: await modelSnapshot() })

  // 正规路径：新建一条正文 bullet，用标准入口 (( 搜索选乙
  await evalT(`(() => {
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
  await sleeps(700)
  await typeText('前缀 ')
  await sleeps(600)
  const newKy = await evalT(`(() => {
    const mem = window.__notekitApp.addons.dbMemory
    const head = s => String(s || '').replace(/\u200b/g, '')
    const subs = mem.getSubitems(${JSON.stringify(srcKy ? kyOf(srcKy) : '')}) || []
    const hit = [...subs].reverse().find(item => head(item.leaves?.map(c => c.text ?? '').join('')).includes('前缀'))
    return hit ? String(hit.ky) : ''
  })()`)
  note('P2a 新建正文行', { newKy, ui: await uiSnapshot(), model: await modelSnapshot() })
  if (newKy) {
    bodyKy = newKy
    await waitBodyNode()
    await caretAtBodySpanEdge('前缀', 'end')
    await typeText('((')
    await sleeps(900)
    await typeText(TOPIC_B.slice(-1))
    await sleeps(900)
    note('P2b 标准入口 (( 的候选菜单', { ui: await uiSnapshot(), model: await modelSnapshot() })
    const clicked2 = await clickMenuItem(TOPIC_B)
    note('P2c 选中乙之后', { clicked: clicked2, ui: await uiSnapshot(), model: await modelSnapshot() })
  }

  const errs = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => JSON.stringify(e.params).slice(0, 200))
  note('E 控制台异常', { count: errs.length, errs: errs.slice(0, 5) })
  await flushSteps()
  console.log(`\n输出：${path.join(outDir, 'result.json')}`)
} catch (e) {
  fatal = e
  console.error('探针异常中断:', e && e.message)
  await flushSteps({ fatal: String(e && e.message || e) })
} finally {
  await stopApp().catch(() => {})
  clearTimeout(WATCHDOG)
  process.exit(fatal ? 1 : 0)
}
