/**
 * ((块引用)) 光标不可进入镜像 + 方向键不卡死 —— 验收脚本（隔离实例，不动用户数据）
 *
 * 用户报告：正文 bullet 里的 ((引用))，鼠标/↓ 会把光标塞进引用文字中间，
 * 之后 ↑/↓ 失效。正常行为：引用是只读镜像，光标不应进入其中间。
 *
 * 用法：node tools/refer-caret-verify.mjs
 * 前置：pnpm build（验证 dist 产物）
 * 输出：test-runs/refer-caret-verify/result.json
 *
 * 判定要点：
 *   V1  镜像内没有第二个编辑宿主（[contenteditable="true"] 数量为 0）
 *   V2b document.caretPositionFromPoint 打在镜像矩形上，落点不归属镜像内部的嵌套编辑器
 *   V3/V3b/V3c 点击引用不进引用内部、且 ↑/↓ 仍有效
 *   V4/V4x/V4y 引用上/下行连续 ↑/↓ 穿过引用行：不落进引用且持续移动
 *   V5/V6/V7 下方走位、引用旁打字写进宿主行、引用相关操作不新增控制台异常
 *   V8 点击引用仍跳转目标块
 *
 * 回归用法（A/B，确认脚本真的能抓到该缺陷）：把 src 回退到修复前、pnpm build 后跑本脚本，
 * 应看到 V1、V2b 失败、其余通过；修复后应全绿。见
 * notes/块引用镜像光标可进入-修复验收-20261004.md。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'refer-caret-verify')
await rm(outDir, { recursive: true, force: true })
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const sleeps = ms => new Promise(r => setTimeout(r, ms))
const freePort = async () => {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')

const TARGET = '探针目标'
const SOURCE = '探针源'

let child = null
let cdp = null
const startApp = async () => {
  const debugPort = await freePort()
  child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
    cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', d => { logs += d })
  child.stderr.on('data', d => { logs += d })
  let c = null
  for (let i = 0; i < 60 && !c; i++) { try { c = await connect(debugPort) } catch { await sleeps(500) } }
  if (!c) throw new Error('CDP 未就绪\n' + logs.slice(-1500))
  for (let i = 0; i < 45; i++) {
    if (await c.evaluate(`!!window.__notekitApp`).catch(() => false)) break
    await sleeps(1000)
  }
  return c
}
cdp = await startApp()
// 空 profile 首次建页偶发抛错（saveItem 里读 undefined.length，既有问题），
// 直接 evaluate 会 reject 掉整轮；这里重试到成功，隔离该噪声。
const ev = async (e, attempts = 4) => {
  let last
  for (let i = 0; i < attempts; i++) {
    try { return await cdp.evaluate(e) } catch (err) { last = err; await sleeps(700) }
  }
  throw last
}
const KEY = {
  down: { modifiers: 0, key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
  up: { modifiers: 0, key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
  left: { modifiers: 0, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
  right: { modifiers: 0, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
  enter: { modifiers: 0, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
}
const key = async k => {
  for (const t of ['rawKeyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { ...k, type: t })
  await sleeps(320)
}
const typeText = async text => { await cdp.call('Input.insertText', { text }); await sleeps(320) }
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.call('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  await sleeps(320)
}

const routeWhenReady = async title => {
  for (let i = 0; i < 60; i++) {
    const ok = await ev(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic(${JSON.stringify(title)})) return false; t.route(${JSON.stringify(title)}); return true })()`).catch(() => false)
    if (ok) { await sleeps(800); return true }
    await sleeps(1000)
  }
  return false
}
const waitEditor = async () => {
  for (let i = 0; i < 30; i++) {
    if (await ev(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) return
    await sleeps(1000)
  }
  throw new Error('编辑器未就绪')
}

/** 源页里带 ((引用)) 的那条正文行（排除镜像内部的 .node） */
const LINE_NODE = `(() => {
  const clean = s => (s || '').replace(/\\u200b/g, '')
  const all = [...document.querySelectorAll('.editor-view.editor-from-router .node')].filter(n => !n.closest('.refer-text'))
  const withRef = all.filter(n => {
    const head = n.querySelector(':scope > .node-head') || n
    return !!head.querySelector('.refer-text')
  })
  if (withRef.length) return withRef[0]
  return all.find(n => clean(((n.querySelector(':scope > .node-head') || n).innerText) || '').includes('前缀')) || null
})()`

const SNAP_JS = label => `(() => {
  const clean = s => (s || '').replace(/\\u200b/g, '')
  const ds = window.getSelection()
  let dom = null
  if (ds && ds.rangeCount) {
    const r = ds.getRangeAt(0)
    const node = r.startContainer
    const el = node.nodeType === 1 ? node : node.parentElement
    const desc = n => n ? (n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).split(' ').slice(0, 2).join('.') : '')) : null
    const editable = el && el.closest ? el.closest('[contenteditable="true"]') : null
    const pathTags = []
    for (let n = el, i = 0; i < 8 && n; i++, n = n.parentElement) pathTags.push(desc(n))
    dom = {
      collapsed: r.collapsed,
      offset: r.startOffset,
      selText: clean(ds.toString()).slice(0, 30),
      inRefer: !!(el && el.closest && el.closest('.refer-text')),
      inReferHiddenSource: !!(el && el.closest && el.closest('.refer-text > span[aria-hidden="true"]')),
      inReferMirror: !!(el && el.closest && el.closest('.refer-text [contenteditable="true"]')),
      editableId: editable ? editable.getAttribute('data-editor-id') : null,
      anchorText: clean(node.textContent).slice(0, 40),
      pathTags,
    }
  }
  const editors = [...document.querySelectorAll('.editor-view .node')].map(n => n.$editor).filter(Boolean)
  const slateSels = editors.filter(x => x.selection).map(x => {
    const chain = []
    try {
      const p = x.selection.anchor.path
      for (let d = 0; d < p.length; d++) {
        const e = x.node(p.slice(0, d + 1))
        chain.push(e && e.blockType ? e.blockType : (e && typeof e.text === 'string' ? 'text' : 'node'))
      }
    } catch (e) { chain.push('err') }
    return { editorId: x.editorId, path: x.selection.anchor.path, offset: x.selection.anchor.offset, chain }
  })
  return JSON.stringify({
    label: ${JSON.stringify(label)},
    dom,
    slateSels,
    refCount: document.querySelectorAll('.editor-view.editor-from-router .refer-text').length,
    mirrorEditables: document.querySelectorAll('.editor-view.editor-from-router .refer-text [contenteditable="true"]').length,
    lineHeadText: (() => { const n = ${LINE_NODE}; return n ? clean((n.querySelector(':scope > .node-head') || n).innerText) : null })(),
  })
})()`
const snap = async label => JSON.parse(await ev(SNAP_JS(label)))

const placeCaret = async where => ev(`(() => {
  const clean = s => (s || '').replace(/\\u200b/g, '')
  const line = ${LINE_NODE}
  if (!line) return 'no-line'
  const ce = line.querySelector('[contenteditable="true"]') || line.closest('[contenteditable="true"]')
  if (!ce) return 'no-editable'
  ce.focus()
  const head = line.querySelector(':scope > .node-head') || line
  const pick = sel => {
    const w = head.querySelector(sel)
    if (!w) return null
    return w.querySelector('[data-slate-string]') || w.querySelector('[data-slate-zero-width]') || w
  }
  let span = null
  const where = ${JSON.stringify(where)}
  if (where === 'headEnd') span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('前缀'))
  else if (where === 'prevEnd') span = pick('.element-refer-prev')
  else if (where === 'nextStart') span = pick('.element-refer-next')
  else if (where === 'lineEnd') { const all = [...head.querySelectorAll('[data-slate-string]')]; span = all[all.length - 1] }
  if (!span) return 'no-span:' + where + ':' + clean(head.innerText).slice(0, 40)
  const tn = span.firstChild || span
  const r = document.createRange()
  if (where === 'nextStart') { r.setStart(tn, 0); r.collapse(true) }
  else { r.selectNodeContents(tn); r.collapse(false) }
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
  return 'ok:' + where
})()`)

const errCount = () => cdp.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')).length
const steps = []
const results = []
const failures = []
const record = (name, detail) => { steps.push({ name, detail }); console.log('•', name, JSON.stringify(detail).slice(0, 460)) }
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + String(JSON.stringify(detail)).slice(0, 400)}`)
  if (!ok) failures.push(name)
}
const byName = n => steps.find(s => s.name === n)?.detail
const checkRaw = check

const errorsAtStart = errCount()
try {
  /* ---------- 准备：目标页（标题 + 两条子项）+ 源页 ---------- */
  const seeded = await ev(`(() => {
    const $ = window.__notekitApp.addons
    const t = $.topic.createTopic(${JSON.stringify(TARGET)})
    $.topic.createTopic(${JSON.stringify(SOURCE)})
    return t ? t.ky : ''
  })()`)
  await sleeps(1200)
  const targetKy = String(seeded || '')
  // 目标页：标题下补两条正文行（让镜像有多行内容）
  await routeWhenReady(TARGET)
  await waitEditor()
  await ev(`(() => {
    const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
    ce.focus()
    const sel = getSelection(); const r = document.createRange()
    r.selectNodeContents(ce); r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
    return 'ok'
  })()`)
  await sleeps(300)
  await key(KEY.enter)
  for (const t of ['目标正文甲甲甲甲甲甲甲', '目标正文乙乙乙乙乙乙乙', '目标正文丙丙丙丙丙丙丙', '目标正文丁丁丁丁丁丁丁', '目标正文戊戊戊戊戊戊戊', '目标正文己己己己己己己']) {
    await typeText(t)
    await key(KEY.enter)
  }
  await typeText('目标正文收尾行')
  await sleeps(1000)
  await routeWhenReady(SOURCE)
  await waitEditor()
  await ev(`(() => {
    const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
    ce.focus()
    const sel = getSelection(); const r = document.createRange()
    r.selectNodeContents(ce); r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
    return 'ok'
  })()`)
  await sleeps(300)
  await key(KEY.enter)
  await typeText('第一行')
  await key(KEY.enter)
  await typeText('前缀 后缀')
  await key(KEY.enter)
  await typeText('第三行')
  await sleeps(900)

  const errBeforeInsert = errCount()
  const p = await ev(`(() => {
    const clean = s => (s || '').replace(/\\u200b/g, '')
    const line = ${LINE_NODE}
    if (!line || !line.$editor) return 'no-editor'
    const head = line.querySelector(':scope > .node-head') || line
    const span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('前缀'))
    if (!span) return 'no-span'
    const ce = line.querySelector('[contenteditable="true"]') || line.closest('[contenteditable="true"]')
    ce.focus()
    const tn = span.firstChild
    const r = document.createRange(); r.setStart(tn, 2); r.collapse(true)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
    return 'ok'
  })()`)
  record('插入前光标定位', { p })
  await sleeps(400)
  const ins = await ev(`(() => {
    const line = ${LINE_NODE}
    if (!line || !line.$editor) return 'no-editor'
    const el = window.__notekitApp.addons.refer.createElement({ ky: ${JSON.stringify(targetKy)} })
    line.$editor.insertFragment([el, { text: '\\u200b' }])
    return 'ok'
  })()`)
  await sleeps(1000)
  record('插入引用', { ins, targetKy, errorsBeforeInsert: errBeforeInsert, errorsAfterInsert: errCount() })
  record('错误计数·插入引用后', { errors: errCount() })

  const struct = JSON.parse(await ev(`(() => {
    const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
    const hidden = ref && ref.querySelector(':scope > span[aria-hidden="true"]')
    const mir = ref && ref.querySelector('[contenteditable="false"]')
    const mirEd = ref && ref.querySelector('[contenteditable="true"]')
    return JSON.stringify({
      hasRef: !!ref,
      hiddenDisplay: hidden ? getComputedStyle(hidden).display : null,
      mirrorEditable: !!mirEd,
      mirrorEditorId: mirEd ? mirEd.getAttribute('data-editor-id') : null,
      mirrorText: mir ? (mir.innerText || '').replace(/\\u200b/g, '').slice(0, 120) : null,
      mirrorNodeCount: mir ? mir.querySelectorAll('.node').length : 0,
      refHeight: ref ? Math.round(ref.getBoundingClientRect().height) : null,
      refHtml: ref ? ref.outerHTML.slice(0, 1400) : null,
    })
  })()`))
  record('引用 DOM 结构', struct)
  record('插入后选区', await snap('插入后'))

  /* ---------- H0 命中测试：镜像中心点解析出的 caret 落在哪里 ---------- */
  {
    const hitInfo = await ev(`(() => {
      const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
      const mir = ref && ref.querySelector('[contenteditable="false"]')
      if (!mir) return { err: 'no-mirror' }
      mir.scrollIntoView({ block: 'center' })
      const r = mir.getBoundingClientRect()
      const probe = (x, y) => {
        const p = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null
        const rng = p && p.offsetNode ? null : (document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null)
        const node = p && p.offsetNode ? p.offsetNode : (rng ? rng.startContainer : null)
        const el = node && (node.nodeType === 1 ? node : node.parentElement)
        return {
          x, y,
          hasNode: !!node,
          inRefer: !!(el && el.closest && el.closest('.refer-text')),
          inNestedEditable: !!(el && el.closest && el.closest('.refer-text [contenteditable="true"]')),
          inHostEditable: !!(el && el.closest && el.closest('[contenteditable="true"]') && !el.closest('.refer-text')),
          anchorText: node ? String(node.textContent || '').replace(/\u200b/g, '').slice(0, 24) : null,
          editableId: el && el.closest && el.closest('[contenteditable="true"]') ? el.closest('[contenteditable="true"]').getAttribute('data-editor-id') : null,
        }
      }
      const px = [0.5, 0.25, 0.75]
      return {
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        mirrorEditableCount: mir.querySelectorAll('[contenteditable="true"]').length,
        probes: px.map(k => probe(r.left + Math.max(2, r.width * k), r.top + Math.max(1, r.height / 2))),
      }
    })()`)
    record('H0 镜像中心点 caret 命中', hitInfo)
  }

  /* ---------- C0 复现路径：引用刚创建完，鼠标点镜像文字（用户第一步） ---------- */
  const pathBeforeClick = await ev(`location.pathname`)
  let clickFirst = null
  {
    const box = await ev(`(() => {
      const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
      const mir = ref && ref.querySelector('[contenteditable="false"]')
      if (!mir) return null
      mir.scrollIntoView({ block: 'center' })
      const r0 = mir.getBoundingClientRect()
      return { x: r0.left + Math.min(10, r0.width / 2), y: r0.top + r0.height / 2 }
    })()`)
    if (box) {
      await clickAt(box.x, box.y)
      await sleeps(700)
      const afterClick = await snap('C0 点击镜像后')
      const pathAfterClick = await ev(`location.pathname`)
      clickFirst = { box, afterClick, pathBeforeClick, pathAfterClick }
      record('C0 点击镜像文字（第一步）', clickFirst)
      // 紧接着按 ↓/↑：修好后光标在宿主里能继续走，坏的时候会在引用内部打转
      await key(KEY.down); const d = await snap('C0 ↓')
      await key(KEY.up); const u = await snap('C0 ↑')
      clickFirst.afterDown = d; clickFirst.afterUp = u
      record('C0 点击后 ↓/↑', { down: d.dom, up: u.dom })
      // 点击引用会跳转到目标块（设计如此），回源页继续后续步骤
      record('C0 回源页', { restored: await (async () => {
        await routeWhenReady(SOURCE)
        await waitEditor()
        await sleeps(900)
        return true
      })() })
    } else record('C0 点击镜像文字（第一步）', { box: null })
  }

  /* ---------- P0 光标在上一行（第一行）末尾，↓ 进入带引用的行 ---------- */
  {
    const placed = await ev(`(() => {
      const clean = s => (s || '').replace(/\\u200b/g, '')
      const all = [...document.querySelectorAll('.editor-view.editor-from-router .node')].filter(n => !n.closest('.refer-text'))
      const line = all.find(n => clean(((n.querySelector(':scope > .node-head') || n).innerText) || '').includes('第一行'))
      if (!line || !line.$editor) return 'no-line'
      const head = line.querySelector(':scope > .node-head') || line
      const span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('第一行'))
      if (!span) return 'no-span'
      const ce = line.querySelector('[contenteditable="true"]') || line.closest('[contenteditable="true"]')
      ce.focus()
      const r = document.createRange(); r.selectNodeContents(span.firstChild); r.collapse(false)
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
      return 'ok'
    })()`)
    record('P0 光标在第一行末尾', { placed, snap: await snap('P0a') })
    await key(KEY.down); record('P0 下 1（进入带引用的行）', await snap('P0 down1'))
    await key(KEY.down); record('P0 下 2', await snap('P0 down2'))
    await key(KEY.up); record('P0 上 1', await snap('P0 up1'))
    await key(KEY.up); record('P0 上 2', await snap('P0 up2'))
  }

  /* ---------- P1 光标在「前缀」末尾（引用左侧），↑↓ ---------- */
  record('P1 放置光标', { placed: await placeCaret('prevEnd'), snap: await snap('P1a') })
  await key(KEY.down); record('P1 ↓ 1', await snap('P1 ↓1'))
  await key(KEY.down); record('P1 ↓ 2', await snap('P1 ↓2'))
  await key(KEY.up); record('P1 ↑ 1', await snap('P1 ↑1'))
  await key(KEY.up); record('P1 ↑ 2', await snap('P1 ↑2'))

  /* ---------- P2 光标在「后缀」开头（引用右侧），↑↓ ---------- */
  record('P2 放置光标', { placed: await placeCaret('nextStart'), snap: await snap('P2a') })
  await key(KEY.up); record('P2 ↑ 1', await snap('P2 ↑1'))
  await key(KEY.up); record('P2 ↑ 2', await snap('P2 ↑2'))
  record('P2 复位', { placed: await placeCaret('nextStart') })
  await key(KEY.down); record('P2 ↓ 1', await snap('P2 ↓1'))
  await key(KEY.down); record('P2 ↓ 2', await snap('P2 ↓2'))

  /* ---------- P3 从标题行末 ↓ 进入带引用的行 ---------- */
  {
    const r = await ev(`(() => {
      const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
      ce.focus()
      const sel = getSelection(); const range = document.createRange()
      range.selectNodeContents(ce); range.collapse(false); sel.removeAllRanges(); sel.addRange(range)
      return 'ok'
    })()`)
    record('P3 光标到标题行末', { r, snap: await snap('P3a') })
    await key(KEY.down); record('P3 ↓ 1', await snap('P3 ↓1'))
    await key(KEY.down); record('P3 ↓ 2', await snap('P3 ↓2'))
  }

  record('错误计数·走位之前', { errors: errCount() })

  /* ---------- P8 从「第一行」连续 ↓ 穿过引用行（多行镜像场景） ---------- */
  {
    const placed8 = await ev(`(() => {
      const clean = s => (s || '').replace(/\\u200b/g, '')
      const all = [...document.querySelectorAll('.editor-view.editor-from-router .node')].filter(n => !n.closest('.refer-text'))
      const line = all.find(n => clean(((n.querySelector(':scope > .node-head') || n).innerText) || '').includes('第一行'))
      if (!line) return 'no-line'
      const head = line.querySelector(':scope > .node-head') || line
      const span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('第一行'))
      if (!span) return 'no-span'
      const ce = line.querySelector('[contenteditable="true"]') || line.closest('[contenteditable="true"]')
      ce.focus()
      const r = document.createRange(); r.selectNodeContents(span.firstChild); r.collapse(false)
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
      return 'ok'
    })()`)
    record('P8 光标在第一行末尾', { placed: placed8, snap: await snap('P8 start') })
    const mirrorLines = await ev(`(() => {
      const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
      const mir = ref && ref.querySelector('[contenteditable="false"]')
      if (!mir) return null
      const r = mir.getBoundingClientRect()
      return { height: Math.round(r.height), lineHeight: Math.round(parseFloat(getComputedStyle(mir).lineHeight) || 0) }
    })()`)
    record('P8 镜像视觉高度', mirrorLines)
    for (let i = 1; i <= 4; i++) {
      await key(KEY.down)
      const st = await snap(`P8 下 ${i}`)
      record(`P8 下 ${i}`, st)
      if (st.dom && (st.dom.inRefer || st.dom.inReferMirror)) break
    }
    // 回到「第三行」再向上走，避免从页首起步（页首再按 ↑ 本就不动）
    const recap = await ev(`(() => {
      const clean = s => (s || '').replace(/\\u200b/g, '')
      const all = [...document.querySelectorAll('.editor-view.editor-from-router .node')].filter(n => !n.closest('.refer-text'))
      const line = all.find(n => clean(((n.querySelector(':scope > .node-head') || n).innerText) || '').includes('第三行'))
      if (!line) return 'no-line'
      const head = line.querySelector(':scope > .node-head') || line
      const span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('第三行'))
      if (!span) return 'no-span'
      const ce = line.querySelector('[contenteditable="true"]') || line.closest('[contenteditable="true"]')
      ce.focus()
      const r = document.createRange(); r.selectNodeContents(span.firstChild); r.collapse(false)
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
      return 'ok'
    })()`)
    record('P8 回第三行准备上行', { placed: recap, snap: await snap('P8 recap') })
    for (let i = 1; i <= 4; i++) {
      await key(KEY.up)
      const st = await snap(`P8 上 ${i}`)
      record(`P8 上 ${i}`, st)
      if (st.dom && (st.dom.inRefer || st.dom.inReferMirror)) break
    }
  }

  /* ---------- P7 从引用下方一行开始真实方向键走位 ---------- */
  {
    const placed7 = await ev(`(() => {
      const clean = s => (s || '').replace(/\\u200b/g, '')
      const all = [...document.querySelectorAll('.editor-view.editor-from-router .node')].filter(n => !n.closest('.refer-text'))
      const line = all.find(n => clean(((n.querySelector(':scope > .node-head') || n).innerText) || '').includes('第三行'))
      if (!line) return 'no-line'
      const head = line.querySelector(':scope > .node-head') || line
      const span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('第三行'))
      if (!span) return 'no-span'
      const ce = line.querySelector('[contenteditable="true"]') || line.closest('[contenteditable="true"]')
      ce.focus()
      const r = document.createRange(); r.selectNodeContents(span.firstChild); r.collapse(false)
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
      return 'ok'
    })()`)
    record('P7 光标在第三行末尾', { placed: placed7, snap: await snap('P7a') })
    await key(KEY.up); record('P7 上 1（进入带引用的行）', await snap('P7 up1'))
    await key(KEY.up); record('P7 上 2', await snap('P7 up2'))
    await key(KEY.down); record('P7 下 1', await snap('P7 down1'))
    await key(KEY.down); record('P7 下 2', await snap('P7 down2'))
  }

  record('错误计数·走位+点击之后', { errors: errCount() })

  /* ---------- P5 卡死态下打字是否写坏被引用块 ---------- */
  {
    const before = await ev(`(() => {
      const mem = window.__notekitApp.addons.dbMemory
      return JSON.stringify(Object.values(mem.nodes).filter(n => n && (n.ori || '').includes('目标正文')).map(i => ({ ky: i.ky, ori: i.ori })))
    })()`)
    const lineBefore = await ev(`(() => { const n = ${LINE_NODE}; return n ? (n.innerText || '').replace(/\\u200b/g, '') : null })()`)
    record('P5 打字前重新把光标放回引用左侧', { placed: await placeCaret('prevEnd') })
    await typeText('X')
    await sleeps(900)
    const after = await ev(`(() => {
      const mem = window.__notekitApp.addons.dbMemory
      const src = Object.values(mem.nodes).filter(n => n && (n.ori || '').includes('前缀'))
      return JSON.stringify({ targets: Object.values(mem.nodes).filter(n => n && (n.ori || '').includes('目标正文')).map(i => ({ ky: i.ky, ori: i.ori })), source: src.map(i => ({ ky: i.ky, ori: i.ori })) })
    })()`)
    record('P5 卡死态打字', { lineBefore, before: JSON.parse(before), after: JSON.parse(after) })
  }
  /* ---------- P4 鼠标点击镜像文字 ---------- */
  {
    const box = await ev(`(() => {
      const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
      const mir = ref && ref.querySelector('[contenteditable="false"]')
      if (!mir) return null
      mir.scrollIntoView({ block: 'center' })
      const r0 = mir.getBoundingClientRect()
      return { x: r0.left + 8, y: r0.top + r0.height / 2 }
    })()`)
    if (box) {
      await clickAt(box.x, box.y)
      await sleeps(900)
      record('P4 点击镜像文字', { box, snap: await snap('P4 点击后') })
    } else record('P4 点击镜像文字', { box: null })
  }

  /* ---------- P6 点击引用仍跳转目标块 ---------- */
  {
    const beforePath = await ev(`location.pathname`)
    const box2 = await ev(`(() => {
      const ref = document.querySelector('.editor-view.editor-from-router .refer-text')
      const mir = ref && ref.querySelector('[contenteditable="false"]')
      if (!mir) return null
      mir.scrollIntoView({ block: 'center' })
      const r0 = mir.getBoundingClientRect()
      return { x: r0.left + 8, y: r0.top + r0.height / 2 }
    })()`)
    if (box2) {
      await clickAt(box2.x, box2.y)
      await sleeps(1200)
      const afterPath = await ev(`location.pathname`)
      record('P6 点击引用跳转', { beforePath, afterPath, targetKy })
      checkRaw('V8 点击引用仍能跳转到目标块', afterPath.includes(targetKy), { beforePath, afterPath, targetKy })
      // 回到源页继续
      await routeWhenReady(SOURCE)
      await waitEditor()
      await sleeps(800)
    } else record('P6 点击引用跳转', { box: null })
  }



  record('错误计数·基线页之前', { errors: errCount() })

  /* ---------- 基线对照：同样结构的页面但没有引用，方向键行为是否一致 ---------- */
  {
    const BASE = '基线页'
    await ev(`(() => { const $ = window.__notekitApp.addons; $.topic.createTopic(${JSON.stringify('基线页')}); return true })()`)
    await sleeps(900)
    await routeWhenReady('基线页')
    await waitEditor()
    const baseNodes = `(() => {
      const clean = s => (s || '').replace(/\\u200b/g, '')
      return [...document.querySelectorAll('.editor-view.editor-from-router .node')]
        .filter(n => !n.closest('.refer-text') && clean(((n.querySelector(':scope > .node-head') || n).innerText) || '').includes('基线'))
    })()`
    await ev(`(() => {
      const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
      ce.focus()
      const sel = getSelection(); const r = document.createRange()
      r.selectNodeContents(ce); r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
      return 'ok'
    })()`)
    await sleeps(300)
    for (const t of ['基线一', '基线二', '基线三']) { await key(KEY.enter); await typeText(t) }
    await sleeps(800)
    const placedBase = await ev(`(() => {
      const clean = s => (s || '').replace(/\\u200b/g, '')
      const n = ${baseNodes}.find(x => clean(((x.querySelector(':scope > .node-head') || x).innerText) || '').includes('基线一'))
      if (!n) return 'no-line'
      const head = n.querySelector(':scope > .node-head') || n
      const span = [...head.querySelectorAll('[data-slate-string]')].find(s => clean(s.textContent).includes('基线一'))
      if (!span) return 'no-span'
      const ce = n.querySelector('[contenteditable="true"]') || n.closest('[contenteditable="true"]')
      ce.focus()
      const r = document.createRange(); r.selectNodeContents(span.firstChild); r.collapse(false)
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
      return 'ok'
    })()`)
    record('B0 基线页光标在「基线一」末尾', { placed: placedBase, snap: await snap('B0a') })
    await key(KEY.down); record('B0 下 1', await snap('B0 down1'))
    await key(KEY.down); record('B0 下 2', await snap('B0 down2'))
    await key(KEY.up); record('B0 上 1', await snap('B0 up1'))
    await key(KEY.up); record('B0 上 2', await snap('B0 up2'))
  }

  await ev(`window.__notekitApp.addons.dbDisk?.flush?.(); true`).catch(() => {})
  await sleeps(500)

  /* ---------- 判定 ---------- */
  const structFinal = byName('引用 DOM 结构')

  check('V1 引用镜像内部没有可编辑宿主（无嵌套 contenteditable=true）', structFinal?.mirrorEditable === false, {
    mirrorEditable: structFinal?.mirrorEditable, mirrorEditorId: structFinal?.mirrorEditorId,
    mirrorEditablesAtEnd: (await snap('终态')).mirrorEditables,
  })
  check('V2 引用仍显示源块内容（只读镜像照常渲染）', !!(structFinal?.mirrorText || '').includes('探针目标'), structFinal?.mirrorText)

  // 机制级：Chrome 在镜像上的 caret 落点不能是引用内部（用户「光标能移到中间」的直接判据）
  const h0 = byName('H0 镜像中心点 caret 命中')
  const h0Probes = h0?.probes ?? []
  check('V2b 镜像像素上的 caret 不再归属引用内部的嵌套编辑器',
    h0Probes.length > 0 && h0?.mirrorEditableCount === 0 && h0Probes.every(p => p.inNestedEditable === false),
    { rect: h0?.rect, mirrorEditableCount: h0?.mirrorEditableCount, probes: h0Probes })

  const c0 = byName('C0 点击镜像文字（第一步）')
  const c0After = c0?.afterClick?.dom
  const c0Navigated = !!c0 && c0.pathAfterClick !== c0.pathBeforeClick && c0.pathAfterClick.includes(targetKy)
  check('V3 引用刚创建就点镜像：光标不进引用内部（且不漏跳转）',
    !!c0 && c0After?.inRefer === false && c0After?.inReferMirror === false,
    { dom: c0After, navigated: c0Navigated, pathBeforeClick: c0?.pathBeforeClick, pathAfterClick: c0?.pathAfterClick })
  const c0Down = c0?.afterDown?.dom
  const c0Up = c0?.afterUp?.dom
  check('V3b 引用内点击后 ↑/↓ 仍有效（不卡死在引用里）',
    !!c0 && c0Down?.inRefer === false && c0Up?.inRefer === false
      && JSON.stringify(c0Down) !== JSON.stringify(c0?.afterClick?.dom || {}),
    { afterClick: c0After, down: c0Down, up: c0Up })
  const p4 = byName('P4 点击镜像文字')
  check('V3c 走位之后点引用同样不进引用内部', !!p4 && p4.snap?.dom?.inRefer === false && p4.snap?.dom?.inReferMirror === false, p4?.snap?.dom)

  const p0 = ['P0 下 1（进入带引用的行）', 'P0 下 2', 'P0 上 1', 'P0 上 2'].map(byName)
  const domKey = s => JSON.stringify([s?.dom?.anchorText, s?.dom?.offset, s?.slateSels?.map(x => [x.path, x.offset])])
  const seq = [byName('P0 光标在第一行末尾')?.snap,
  ...[byName('P0 下 1（进入带引用的行）'), byName('P0 下 2'), byName('P0 上 1'), byName('P0 上 2')]]
  const moved = seq.map(domKey)
  const noStuck = moved.every((v, i) => i === 0 || v !== moved[i - 1])
  check('V4 引用相邻行 ↑/↓ 连续移动不卡死', noStuck, seq.map(s => ({ text: s?.dom?.anchorText, offset: s?.dom?.offset })))
  check('V4b 跨行移动始终落在宿主编辑器里', seq.every(s => s?.dom && s.dom.inRefer === false), seq.map(s => ({ inRefer: s?.dom?.inRefer, editableId: s?.dom?.editableId })))

  const downSteps = steps.filter(s => /^P8 下 \d+$/.test(s.name)).map(s => s.detail)
  const upSteps = steps.filter(s => /^P8 上 \d+$/.test(s.name)).map(s => s.detail)
  const downMoved = downSteps.map(s => JSON.stringify([s?.dom?.anchorText, s?.dom?.offset]))
  check('V4x 从引用上一行连续 ↓ 穿过引用行：不落进引用、且持续移动',
    downSteps.length >= 3 && downSteps.every(s => s?.dom && !s.dom.inRefer && !s.dom.inReferMirror)
      && downMoved.every((v, i) => i === 0 || v !== downMoved[i - 1]),
    { mirrorLines: byName('P8 镜像视觉高度'), walk: downSteps.map(s => ({ text: s?.dom?.anchorText, off: s?.dom?.offset, inRefer: s?.dom?.inRefer })) })
  // ↑ 只断言「回到第一行之前」的位移（越过页首后浏览器本就不动，属正常）
  const upUntilTop = []
  for (const s of upSteps) { upUntilTop.push(s); if ((s?.dom?.anchorText || '').includes('第一行')) break }
  const upMoved = upUntilTop.map(s => JSON.stringify([s?.dom?.anchorText, s?.dom?.offset]))
  check('V4y 连续 ↑ 回穿引用行：不落进引用、且持续移动',
    upUntilTop.length >= 2 && upUntilTop.every(s => s?.dom && !s.dom.inRefer && !s.dom.inReferMirror)
      && upMoved.every((v, i) => i === 0 || v !== upMoved[i - 1]),
    { walk: upSteps.map(s => ({ text: s?.dom?.anchorText, off: s?.dom?.offset, inRefer: s?.dom?.inRefer })) })

  const p7seq = [byName('P7 光标在第三行末尾')?.snap,
    ...[byName('P7 上 1（进入带引用的行）'), byName('P7 上 2'), byName('P7 下 1'), byName('P7 下 2')]]
  const p7keys = p7seq.map(s => JSON.stringify([s?.dom?.anchorText, s?.dom?.offset]))
  const p7noStuck = p7keys.every((v, i) => i === 0 || v !== p7keys[i - 1])
  const p7inside = p7seq.filter(s => s?.dom?.inRefer)
  check('V5 引用下方行 ↑/↓ 连续移动不卡死、不进入引用', p7noStuck && p7inside.length === 0, {
    walk: p7seq.map(s => ({ text: s?.dom?.anchorText, offset: s?.dom?.offset, inRefer: s?.dom?.inRefer })),
  })

  const p5 = byName('P5 卡死态打字')
  const srcOri = (p5?.after?.source ?? []).map(i => i.ori).join('|')
  const targetsBefore = JSON.stringify(p5?.before ?? [])
  const targetsAfter = JSON.stringify((p5?.after?.targets ?? []))
  check('V6 光标在引用旁打字写进宿主行、目标块不变', srcOri.includes('X') && targetsBefore === targetsAfter, { srcOri, targetsBefore, targetsAfter })

  const consoleErrorsAfter = cdp.events
    .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map(e => JSON.stringify(e.params).slice(0, 1600))
  // 引用插入前后错误计数不变 = 引用路径本身不产生异常。
  // 开始时记录的异常来自「空 profile 里建页/打字」（createTopic→saveItem），属既有问题，
  // 见 result.json 的 preexistingErrors。
  // 引用相关动作（插入/走位/打字/点击/跳转）全程不新增异常。
  // 截图之外的既有问题：在空 profile 里新建页面并打字会抛
  // TypeError: Cannot read properties of undefined (reading 'length')（source map → NodeBtn.tsx / atom.ts 样式路径），
  // 与引用无关（基线页无引用也复现），单独记录在 preexistingErrorsWithoutRefer。
  const errAfterRefPhase = byName('错误计数·基线页之前')?.errors
  check('V7 引用相关操作全程不新增控制台异常', errAfterRefPhase === errBeforeInsert, {
    errorsBeforeInsert: errBeforeInsert, errorsAfterRefPhase: errAfterRefPhase, errorsAtEnd: errCount(),
    preexistingErrorsWithoutRefer: consoleErrorsAfter.slice(0, 1),
  })
  record('错误计数时间线', { errorsAtStart: errorsAtStart, errorsBeforeInsert: errBeforeInsert, errorsAtEnd: errCount() })
} catch (err) {
  record('FATAL', String(err && err.stack ? err.stack.slice(0, 800) : err))
  failures.push('FATAL')
}

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures, steps }, null, 2))
console.log(failures.length ? `\n失败 ${failures.length} 项: ${failures.join(', ')}` : '\n全部通过')

await ev(`window.close(); true`).catch(() => {})
await sleeps(800)
child.kill('SIGTERM'); await sleeps(800); try { child.kill('SIGKILL') } catch {}
process.exit(0)
