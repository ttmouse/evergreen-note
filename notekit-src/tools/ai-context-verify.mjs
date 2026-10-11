/**
 * 在**真 App**（隔离实例，不动用户数据）里验证 AI 面板的「上下文感知快捷操作」。
 *
 * 用法：node tools/ai-context-verify.mjs [--keep]
 * 前置：npm run build（读 dist 产物）。输出：test-runs/ai-context-verify/（result.json + shots/）。
 *
 * 覆盖（验收标准逐条）：
 *   C1 空态：没打开笔记时，上下文行显示「无」，归纳/下一步禁用且提示怎么解
 *   C2 页面上下文：打开笔记后标签显示页标题；按钮可用
 *   C3 选中块上下文：真拖选 3 个块后，标签显示「3 个选中块 · 页「标题」」（块 > 页）
 *   C4 归纳：真点击按钮 → POST /prompt 的 text 是归纳指令，note.selection 内联 3 块原文，note.ky=页 ky
 *   C5 下一步：重选后真点击按钮 → text 是建议指令且仍带 3 块
 *   C6 结果可见：模拟回合事件 → 正文以 markdown 渲染进流水，截图存档
 *   C7 取消选择回退：点击别处 → 标签回退到页面；自由输入发送 → note 只带页面引用（不内联选块）
 *   C8 夜间主题：面板控件在夜间模式下主题色翻转（与浅色实测值对照），截图存档
 *
 * 隔离与安全：NOTEKIT_USER_DATA/NOTEKIT_PORT 均为独立目录与空闲端口；
 * fetch 拦截 /api/ai/acp/*，不会拉起真 agent、不会碰用户知识库。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'ai-context-verify')
const shotsDir = path.join(outDir, 'shots')
await rm(outDir, { recursive: true, force: true })
await mkdir(shotsDir, { recursive: true })
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

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let appLogs = ''
child.stdout.on('data', d => { appLogs += d })
child.stderr.on('data', d => { appLogs += d })

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }

const results = []
const failures = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail: detail ?? null })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}
const shot = async name => {
  const r = await cdp.call('Page.captureScreenshot', { format: 'png' })
  const file = path.join(shotsDir, name)
  await writeFile(file, Buffer.from(r.data, 'base64'))
  return file
}

try {
  if (!cdp) throw new Error('CDP 未就绪：\n' + appLogs.slice(-1500))
  const ev = e => cdp.evaluate(e)
  const evalR = async (expression, ms = 20000) => Promise.race([
    ev(expression), sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) }),
  ])
  const waitFor = async (expression, ms = 15000) => {
    const t0 = Date.now()
    for (;;) {
      const v = await evalR(expression).catch(() => false)
      if (v) return v
      if (Date.now() - t0 > ms) throw new Error(`等待超时: ${expression}`)
      await sleeps(400)
    }
  }
  const clickAt = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.call('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
    }
    await sleeps(300)
  }
  const pressEnter = async () => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.call('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    }
  }

  await waitFor(`document.readyState === 'complete' && !!window.__notekitApp`, 60000)
  await sleeps(1200)
  // 强制浅色基线：新 profile 也可能带夜间偏好，C8 要做「翻转」对照就得先钉死起点
  await evalR(`(() => { document.body.classList.remove('night-mode'); return true })()`)
  await sleeps(300)

  // ---------------------------------------------------------------- fetch 拦截（不拉真 agent）
  await evalR(`(() => {
    const orig = window.fetch.bind(window)
    window.__capturedPrompts = []
    window.__fakeSid = 'fake-sid-verify'
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      const i = url.indexOf('/api/ai/acp/')
      if (i < 0) return orig(input, init)
      const rest = url.slice(i + '/api/ai/acp/'.length)
      if (rest === 'session' || rest === 'session/new') {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, sessionId: window.__fakeSid, agent: 'stub v0' }), { headers: { 'Content-Type': 'application/json' } }))
      }
      if (rest === 'prompt') {
        try { window.__capturedPrompts.push(JSON.parse(init.body)) } catch (e) {}
        return Promise.resolve(new Response(JSON.stringify({ ok: true, accepted: true }), { headers: { 'Content-Type': 'application/json' } }))
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }))
    }
    return true
  })()`)

  const contextRowText = `(() => {
    const span = [...document.querySelectorAll('.ai-panel-area span')].find(s => (s.textContent || '').startsWith('上下文：'))
    return span ? span.textContent : null
  })()`
  const dragSelect3 = async blocks => {
    const blocksJson = JSON.stringify(blocks)
    const boxes = JSON.parse(await evalR(`(() => {
      const targets = ${blocksJson}
      const out = []
      for (const n of document.querySelectorAll('.editor-view.editor-from-router .node')) {
        const t = (n.querySelector(':scope > .node-head .node-text')?.textContent || '').trim()
        const i = targets.indexOf(t)
        if (i >= 0) {
          const r = n.querySelector(':scope > .node-head .node-text').getBoundingClientRect()
          out[i] = { t, x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2 }
        }
      }
      return JSON.stringify(out.filter(Boolean))
    })()`))
    if (boxes.length < 3) throw new Error('找不到 3 个可拖选块')
    const first = boxes[0]
    const third = boxes[2]
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(first.x), y: Math.round(first.y), button: 'left', clickCount: 1 })
    for (let step = 1; step <= 8; step++) {
      await sleeps(60)
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(first.x + ((third.x - first.x) * step) / 8),
        y: Math.round(first.y + ((third.y - first.y) * step) / 8),
        button: 'left',
      })
    }
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(third.x), y: Math.round(third.y), button: 'left' })
    await sleeps(900)
  }
  const quickBtnBox = async label => evalR(`(() => {
    const b = [...document.querySelectorAll('.ai-panel-area button.ai-quick-btn')].find(b => (b.textContent || '').includes(${JSON.stringify(label)}))
    if (!b) return null
    const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)

  // ---------------------------------------------------------------- C1 空态
  await evalR(`(async () => { const S = window.__nkAiPanelStore; S.open = true; await new Promise(r => setTimeout(r, 500)); return true })()`)
  await waitFor(`!!document.querySelector('.ai-panel-area') && !!(${contextRowText})`, 10000)
  const c1row = await evalR(contextRowText)
  const c1btns = await evalR(`(() => {
    const btns = [...document.querySelectorAll('.ai-panel-area button.ai-quick-btn')]
    return { n: btns.length, disabled: btns.map(b => b.disabled) }
  })()`)
  check('C1 空态标签', c1row === '上下文：无（光标不在笔记内）', { got: c1row })
  check('C1 快捷按钮存在且禁用', c1btns.n === 2 && c1btns.disabled.every(d => d === true), c1btns)
  await shot('c1-empty-context.png')

  // ---------------------------------------------------------------- 建一篇笔记：3 个块
  const TITLE = 'AI上下文验证'
  const BLOCKS = ['第一块：苹果是一种常见水果', '第二块：苹果富含维生素与膳食纤维', '第三块：每天吃一个苹果对身体有益']
  await evalR(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(TITLE)}); return true })()`)
  await waitFor(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`, 20000)
  await sleeps(600)
  // 新主题正文是空的：点进标题 → 回车建出第一个正文块，再逐块打字
  await clickAt(
    await evalR(`(() => { const el = document.querySelector('.editor-view.editor-from-router .node-top > .node-head .node-text'); const r = el.getBoundingClientRect(); return r.left + Math.min(60, r.width / 2) })()`),
    await evalR(`(() => { const el = document.querySelector('.editor-view.editor-from-router .node-top > .node-head .node-text'); const r = el.getBoundingClientRect(); return r.top + r.height / 2 })()`),
  )
  await pressEnter()
  await waitFor(`!!document.querySelector('.editor-view.editor-from-router .node-subitems .node .node-text')`, 15000)
  await sleeps(400)
  for (let bi = 0; bi < BLOCKS.length; bi++) {
    if (bi > 0) {
      await pressEnter()
      await sleeps(350)
    }
    await cdp.call('Input.insertText', { text: BLOCKS[bi] })
    await sleeps(350)
  }
  const typed = await evalR(`(() => {
    return [...document.querySelectorAll('.editor-view.editor-from-router .node-head .node-text')]
      .map(n => (n.textContent || '').trim()).filter(t => t.length > 0)
  })()`)
  check('前置：3 个块已建好', typed.length >= 3 && BLOCKS.every(b => typed.includes(b)), typed)

  // ---------------------------------------------------------------- C2 页面上下文
  await sleeps(600)
  const c2row = await evalR(contextRowText)
  check('C2 页面上下文标签', typeof c2row === 'string' && c2row.includes('页「AI上下文验证」'), { got: c2row })
  const c2btns = await evalR(`(() => [...document.querySelectorAll('.ai-panel-area button.ai-quick-btn')].map(b => b.disabled))()`)
  check('C2 按钮解禁', c2btns.length === 2 && c2btns.every(d => d === false), c2btns)
  const lightBtnBorder = await evalR(`getComputedStyle(document.querySelectorAll('.ai-panel-area button.ai-quick-btn')[0]).borderTopColor`)

  // ---------------------------------------------------------------- C3 真拖选 3 个块
  await dragSelect3(BLOCKS)
  const c3row = await evalR(contextRowText)
  check('C3 拖选后标签=3 个选中块 · 页', typeof c3row === 'string' && c3row.startsWith('上下文：3 个选中块') && c3row.includes('页「AI上下文验证」'), { got: c3row })
  const c3sel = await evalR(`(() => {
    const ids = window.__notekitApp.addons.blockSelection.selectedIds || []
    return { n: ids.length, styled: document.querySelectorAll('.node-block-selected').length }
  })()`)
  check('C3 BlockSelection 记录 3 块', c3sel.n === 3 && c3sel.styled === 3, c3sel)

  // ---------------------------------------------------------------- C4 归纳
  const sb1 = await quickBtnBox('归纳')
  await clickAt(sb1.x, sb1.y)
  await sleeps(900)
  const prompts1 = JSON.parse(await evalR(`JSON.stringify(window.__capturedPrompts)`))
  const p1 = prompts1[0]
  check('C4 归纳指令文本', !!p1 && p1.text === '请归纳我选中的这 3 个块：核心要点是什么，整体在讲什么。', p1?.text)
  check('C4 选块内联', !!p1 && Array.isArray(p1.note?.selection?.blocks) && p1.note.selection.blocks.length === 3 &&
    BLOCKS.every((b, i) => p1.note.selection.blocks[i].text === b), p1?.note?.selection)
  check('C4 页面引用仍在', !!p1 && !!p1.note?.ky && p1.note.title === TITLE, { ky: p1?.note?.ky, title: p1?.note?.title })

  // ---------------------------------------------------------------- C5 下一步（重选后再点，两种世界里都确定）
  await dragSelect3(BLOCKS)
  const sb2 = await quickBtnBox('下一步')
  await clickAt(sb2.x, sb2.y)
  await sleeps(900)
  const prompts2 = JSON.parse(await evalR(`JSON.stringify(window.__capturedPrompts)`))
  const p2 = prompts2[1]
  check('C5 下一步指令文本', !!p2 && p2.text === '基于我选中的这 3 个块，给出下一步建议：最多 5 条，按价值排序，每条一句话说明理由。', p2?.text)
  check('C5 第二次点击仍带 3 块', !!p2 && Array.isArray(p2.note?.selection?.blocks) && p2.note.selection.blocks.length === 3, p2?.note?.selection?.blocks?.length)

  // ---------------------------------------------------------------- C6 模拟回合 → 结果可见
  await evalR(`(async () => {
    const S = window.__nkAiPanelStore
    const sid = window.__fakeSid
    const conv = S.active
    if (conv && conv.acpSessionId !== sid) conv.acpSessionId = sid
    S.apply({ type: 'turn_start', sessionId: sid, at: Date.now(), text: '基于我选中的这 3 个块，给出下一步建议：最多 5 条，按价值排序，每条一句话说明理由。' })
    S.apply({ type: 'text', sessionId: sid, at: Date.now(), text: '**归纳要点**\\n\\n1. 三个块都在讲苹果：是什么、有什么营养、怎么吃。\\n2. 建议下一步：**合并成一条「苹果」主题笔记**，并补充权威来源。' })
    S.apply({ type: 'turn_end', sessionId: sid, at: Date.now() })
    await new Promise(r => setTimeout(r, 600))
    return document.querySelectorAll('.ai-panel-area .ai-md').length
  })()`)
  const c6md = await evalR(`(() => {
    const mds = [...document.querySelectorAll('.ai-panel-area .ai-md')]
    const last = mds[mds.length - 1]
    return { n: mds.length, hasBold: !!(last && last.querySelector('strong')), text: last ? last.textContent.slice(0, 40) : null }
  })()`)
  check('C6 结果以 markdown 渲染', c6md.n >= 1 && c6md.hasBold && (c6md.text || '').includes('归纳要点'), c6md)
  await shot('c6-result-light.png')

  // ---------------------------------------------------------------- C7 取消选择回退 + 自由输入
  // 语义先钉住：点在选区**内**（首块文字上）浏览器不清选区（拖动语义），上下文应保持选中块
  const inSelBox = JSON.parse(await evalR(`(() => {
    for (const n of document.querySelectorAll('.editor-view.editor-from-router .node')) {
      const t = (n.querySelector(':scope > .node-head .node-text')?.textContent || '').trim()
      if (t === ${JSON.stringify(BLOCKS[0])}) {
        const r = n.querySelector(':scope > .node-head .node-text').getBoundingClientRect()
        return JSON.stringify({ x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2 })
      }
    }
    return 'null'
  })()`))
  await clickAt(inSelBox.x, inSelBox.y)
  await sleeps(800)
  const c7keep = await evalR(contextRowText)
  check('C7 点选区内不清选区', typeof c7keep === 'string' && c7keep.startsWith('上下文：3 个选中块'), { got: c7keep })
  // 点选区**外**（末尾的 Unlinked References 提示块）→ 选区收拢，上下文回退到页面
  const outSelBox = JSON.parse(await evalR(`(() => {
    const heads = [...document.querySelectorAll('.editor-view.editor-from-router .node-head .node-text')]
    const el = heads.find(n => !(n.textContent || '').includes('苹果'))
    if (!el) return 'null'
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 })
  })()`))
  if (!outSelBox) throw new Error('找不到选区外的可点块')
  await clickAt(outSelBox.x, outSelBox.y)
  await sleeps(800)
  const c7row = await evalR(contextRowText)
  check('C7 取消选择回退到页面', typeof c7row === 'string' && c7row.includes('页「AI上下文验证」') && !c7row.includes('选中块'), { got: c7row })
  const inputBox = await evalR(`(() => { const el = document.querySelector('.ai-panel-area input'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  await clickAt(inputBox.x, inputBox.y)
  await cdp.call('Input.insertText', { text: '帮我看看这篇还缺什么' })
  await sleeps(200)
  await clickAt(
    await evalR(`(() => { const b = document.querySelector('.ai-panel-area button[title="发送"]'); const r = b.getBoundingClientRect(); return r.left + r.width / 2 })()`),
    await evalR(`(() => { const b = document.querySelector('.ai-panel-area button[title="发送"]'); const r = b.getBoundingClientRect(); return r.top + r.height / 2 })()`),
  )
  await sleeps(900)
  const prompts3 = JSON.parse(await evalR(`JSON.stringify(window.__capturedPrompts)`))
  const p3 = prompts3[prompts3.length - 1]
  check('C7 自由输入只带页面引用', !!p3 && p3.text === '帮我看看这篇还缺什么' && !!p3.note?.ky && !p3.note?.selection, p3)

  // ---------------------------------------------------------------- C8 夜间主题（与浅色实测值对照）
  await evalR(`(() => { document.body.classList.add('night-mode'); return true })()`)
  await sleeps(500)
  const nightBtnBorder = await evalR(`(() => {
    const b = document.querySelectorAll('.ai-panel-area button.ai-quick-btn')[0]
    const row = [...document.querySelectorAll('.ai-panel-area span')].find(s => (s.textContent || '').startsWith('上下文：'))
    if (!b || !row) return null
    return JSON.stringify({ btnBorder: getComputedStyle(b).borderTopColor, btnBg: getComputedStyle(b).backgroundColor, rowColor: getComputedStyle(row).color })
  })()`)
  const night = nightBtnBorder ? JSON.parse(nightBtnBorder) : null
  check('C8 夜间模式主题色翻转（边框色 ≠ 浅色实测值）', !!night && night.btnBorder && night.btnBorder !== lightBtnBorder, { light: lightBtnBorder, night })
  await shot('c8-result-night.png')

  const exceptions = cdp.events
    .filter(e => e.method === 'Runtime.exceptionThrown')
    .map(e => (e.params.exceptionDetails?.exception?.description || '').slice(0, 200))
    .filter(Boolean)
  check('无运行时异常', exceptions.length === 0, exceptions.slice(0, 3))
} catch (e) {
  check('流程完成', false, { error: String(e).slice(0, 500), appLogTail: appLogs.slice(-800) })
  try { await shot('fatal.png') } catch {}
} finally {
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures, at: new Date().toISOString() }, null, 2))
  console.log(`\n结果：${results.filter(r => r.ok).length}/${results.length} 通过${failures.length ? '，失败：' + failures.join('、') : ''}`)
  console.log('截图：' + shotsDir)
  if (!process.argv.includes('--keep')) child.kill('SIGTERM')
  process.exit(failures.length ? 1 : 0)
}
