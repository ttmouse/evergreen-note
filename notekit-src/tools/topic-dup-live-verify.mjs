/**
 * 草稿主题保存链路验证（自撞回归 + 重名拦截）：
 * 场景A 全新标题：打字不标红（无重复）→ 回车进正文 → 不弹「已存在」、转正成功、无重复主题
 * 场景B 重名标题：打字时实时标红 → 回车保存被拦，不产生第二个同名主题
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'topic-dup-live')
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
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }

const results = []
const assert = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const clearSnack = () => ev(`(() => { document.querySelectorAll('.snack,[class*="snack"],[role="alert"]').forEach(n => n.remove()); return true })()`)
const readSnack = () => ev(`(() => { const n = document.querySelector('.snack,[class*="snack"],[role="alert"]'); return n ? n.textContent : '' })()`)
const focusHead = () => ev(`(() => {
  const head = document.querySelector('.editor-view.editor-from-router .node-head')
  head.focus()
  // 光标必须落进 Slate 文本节点内：空标题时是 data-slate-zero-width（内含 \uFEFF），
  // 折叠到 head 开头会被 Slate 规范化到别的块，打字会掉进正文（见 Topic.newTopic 同款处理）
  const text = (head.querySelector('[data-slate-string]') ??
    head.querySelector('[data-slate-zero-width]'))?.firstChild
  const sel = getSelection()
  if (sel && text) {
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, text.length)
    sel.removeAllRanges()
    sel.addRange(range)
  }
  return true
})()`)
const newDraft = () => ev(`(() => { const a = window.__notekitApp.addons; const i = a.topic.createDraftTopic(); a.router.to(i); return true })()`)
const waitHead = async () => {
  for (let i = 0; i < 30; i++) {
    if (await ev(`!!document.querySelector('.editor-view.editor-from-router .node-head')`).catch(() => false)) return true
    await sleeps(1000)
  }
  return false
}
const pressEnter = async () => {
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await sleeps(900)
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await sleeps(900)
}
const typeTitle = async (text) => {
  // 编辑器挂载/重渲染会丢弃过早的输入：以 Slate 状态为准校验标题真的落上了，没有就重聚焦重试
  let st = { text: '', slateTitle: '', dup: false }
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleeps(800)
    await focusHead()
    await sleeps(300)
    await cdp.call('Input.insertText', { text })
    await sleeps(900)
    st = await headState()
    if (st.slateTitle.includes(text)) return st
  }
  return st
}
const headState = () => ev(`(() => {
  const head = document.querySelector('.editor-view.editor-from-router .node-head')
  // 读 Slate 状态而不是 DOM：EditorView fromRouter 时暴露 window.$editor
  let slateTitle = ''
  try {
    const node = window.$editor?.children?.[0]
    const headNode = node?.children?.find?.(c => c.type === 'head')
    slateTitle = (headNode?.children ?? []).map(l => l.text ?? '').join('')
  } catch {}
  return {
    dup: head.classList.contains('topic-dup-title'),
    text: head.textContent,
    slateTitle,
  }
})()`)

// ── 场景A：全新标题「全新独有名字」────────────────────────────
await sleeps(1500)
await newDraft()
await waitHead()
assert('A0 新建草稿页面已打开', await ev(`!!document.querySelector('.editor-view.editor-from-router .node-head')`))
const aTyping = await typeTitle('全新独有名字')
// 标红类由 item 数据经 React memo 渲染，dup=false 即数据层无重复判定通过
assert('A1 全新标题打字过程中不标红（无重复）', aTyping.dup === false && aTyping.text.includes('全新独有名字'), JSON.stringify(aTyping))
await clearSnack()
await pressEnter()
const aSnack = await readSnack()
const aAfter = await ev(`(() => {
  const t = window.__notekitApp.addons.topic
  return { count: t.getList().filter(x => x.topic === '全新独有名字').length }
})()`)
assert('A2 回车进正文不弹「已存在」', !aSnack.includes('已存在') && !aSnack.includes('already exists'), `snack=${JSON.stringify(aSnack)}`)
assert('A3 全新主题转正成功且仅一条', aAfter.count === 1, JSON.stringify(aAfter))

// ── 场景B：重名标题（用场景A刚创建的主题）──────────────────────
await clearSnack()
await newDraft()
await waitHead()
const bTyping = await typeTitle('全新独有名字')
assert('B1 重名标题打字过程中实时标红', bTyping.dup === true, JSON.stringify(bTyping))
await pressEnter()
const bAfter = await ev(`(() => {
  const t = window.__notekitApp.addons.topic
  return { count: t.getList().filter(x => x.topic === '全新独有名字').length, snack: document.querySelector('.snack,[class*="snack"],[role="alert"]')?.textContent ?? '' }
})()`)
assert('B2 回车后仍只有一个同名主题（保存被拦）', bAfter.count === 1, JSON.stringify(bAfter))

child.kill()
process.exit(results.every(r => r.ok) ? 0 : 1)
