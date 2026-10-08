/**
 * 草稿主题「双真相源」回归套件
 *
 * 背景：发起保存的编辑器被 Refresh 排除（Refresh.ts 的 addExcludeEditors），
 * 所以 saveItem cover 做的身份变更（草稿转正、改名）不会回写编辑器内存节点，
 * 该节点会一直停在草稿态（draft:true、无 topic）。若下游信任内存节点的身份，
 * 就会重放「第一次保存」的前置分支，产生自撞、身份被整份写回抹掉等一串缺陷。
 *
 * 本套件断言的是修复后的行为（修复前同一脚本的对照结论见下方每个场景注释）：
 *   R1 全新标题：打字不标红 → 回车进正文不弹「已存在」、恰好转正 1 条   （修复前：回车必弹「已存在」）
 *   R2 主题页按 ⌘M：不再误报「已存在」                                  （修复前：误报且空操作）
 *   R3 转正后清空标题：主题身份必须存活、仍在主题列表                    （修复前：topic/isTopic 被抹掉，主题消失）
 *   R4 标题只由被 refine 抹掉的符号组成（如 `==`）：不得建成空名主题     （修复前：isTopic:true + topic:''）
 *   R5 被放弃的空草稿仍会落盘（已知存量问题，仅 INFO 不计失败）
 *
 * 隔离实例（NOTEKIT_PORT + NOTEKIT_USER_DATA + remote-debugging-port），不碰用户数据。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'topic-draft-regression')
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
// 宿主环境可能带 ELECTRON_RUN_AS_NODE=1（Electron 会退化成纯 Node 直接崩），
// 且宿主沙箱下 Chromium 子进程无法初始化沙箱；两者都必须处理，否则 CDP 端口永不监听。
const childEnv = { ...process.env, NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile, ELECTRON_DISABLE_SANDBOX: '1' }
delete childEnv.ELECTRON_RUN_AS_NODE
delete childEnv.NODE_OPTIONS
const child = spawn(ELECTRON_BIN, ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', 'desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { console.error('无法连接 CDP，Electron 未起来'); child.kill(); process.exit(2) }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }
for (let i = 0; i < 60; i++) {
  if (await ev(`!!window.__notekitApp.addons.libAdmin?.current`, 3000).catch(() => false)) break
  await sleeps(1000)
}

const results = []
const assert = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const note = (name, detail) => console.log(`INFO ${name} — ${detail}`)

const clearSnack = () => ev(`(() => { document.querySelectorAll('.snack,[class*="snack"],[role="alert"]').forEach(n => n.remove()); return true })()`)
const readSnack = () => ev(`(() => { const n = document.querySelector('.snack,[class*="snack"],[role="alert"]'); return n ? n.textContent : '' })()`)
const focusHead = () => ev(`(() => {
  const head = document.querySelector('.editor-view.editor-from-router .node-head')
  if (!head) return false
  head.focus()
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
const waitHead = async () => {
  for (let i = 0; i < 30; i++) {
    if (await ev(`!!document.querySelector('.editor-view.editor-from-router .node-head')`).catch(() => false)) return true
    await sleeps(1000)
  }
  return false
}
const key = async (k, code, vk, modifiers = 0) => {
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers })
  await sleeps(120)
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers })
  await sleeps(600)
}
const pressEnter = () => key('Enter', 'Enter', 13)

const storedState = ky => ev(`(() => {
  const it = window.__notekitApp.addons.dbMemory.getItem(${JSON.stringify('')} + ${JSON.stringify(ky)})
  if (!it || !it.ky) return null
  return { ky: it.ky, draft: it.draft ?? null, topic: it.topic ?? null, isTopic: it.isTopic ?? null,
           ori: it.ori ?? null, status: it.status ?? null, path: it.path ?? null }
})()`)
// 标题是否落上以 DOM 为准（渲染出来的 head 文本即用户所见）；
// 内存节点的标题读法见 editorItem()，head 部件里还套着 node-text 层，直接读会拿到空。
const headText = () => ev(`(() => {
  const head = document.querySelector('.editor-view.editor-from-router .node-head')
  return head ? head.textContent : ''
})()`)
const editorItem = () => ev(`(() => {
  const n = window.$editor?.children?.[0]
  if (!n) return null
  return { ky: n.ky ?? null, draft: 'draft' in n ? n.draft : null,
           topic: n.topic ?? null, isTopic: 'isTopic' in n ? n.isTopic : null }
})()`)
const newNodeCount = () => ev(`Object.keys(window.__notekitApp.addons.dbMemory.nodes).length`)
const inTopicList = ky => ev(`window.__notekitApp.addons.topic.getList().some(x => x.ky === ${JSON.stringify(ky)})`)
const topicCount = t => ev(`window.__notekitApp.addons.topic.getList().filter(x => x.topic === ${JSON.stringify(t)}).length`)
const newDraft = async () => {
  const r = await ev(`(() => { const a = window.__notekitApp.addons; const i = a.topic.createDraftTopic(); a.router.to(i); return { ky: i.ky } })()`)
  await waitHead()
  return r
}
const typeTitle = async (text) => {
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleeps(700)
    await focusHead()
    await sleeps(250)
    await cdp.call('Input.insertText', { text })
    await sleeps(900)
    if ((await headText()).includes(text)) return true
  }
  return (await headText()).includes(text)
}

await sleeps(1500)
const TITLE = '举一反三回归主题'

// ── R1 全新标题：回车进正文不得报「已存在」 ──────────────────────
await clearSnack()
const r1 = await newDraft()
assert('R1 草稿页面已打开', await ev(`!!document.querySelector('.editor-view.editor-from-router .node-head')`))
assert('R1 标题打字成功落上', await typeTitle(TITLE))
await pressEnter()
await sleeps(2000)
const r1snack = await readSnack()
const r1count = await topicCount(TITLE)
const r1stored = await storedState(r1.ky)
note('R1 stored', JSON.stringify(r1stored))
assert('R1 回车进正文不弹「已存在」', !/已存在|already exists/i.test(r1snack), `snack=${JSON.stringify(r1snack)}`)
assert('R1 恰好转正 1 条主题', r1count === 1 && r1stored?.isTopic === true && r1stored?.topic === TITLE, `count=${r1count} stored=${JSON.stringify(r1stored)}`)

// ── R2 自身主题做「转成子主题」不得误报「已存在」 ─────────────────
// 直接走 ⌘M 处理器的第一步 check()，且用编辑器真身节点（window.$editor）：
// 修复前 check() 会在主题索引里查到「自己」而返回 false 并弹「已存在」、动作空转。
await clearSnack()
const r2 = await ev(`(() => {
  const a = window.__notekitApp.addons
  document.querySelectorAll('.snack,[class*="snack"],[role="alert"]').forEach(n => n.remove())
  const item = window.$editor?.children?.[0]
  const checkOk = a.topic.check(item)
  const snack = document.querySelector('.snack,[class*="snack"],[role="alert"]')?.textContent ?? ''
  return { ky: item?.ky, checkOk, snack }
})()`)
note('R2 check(内存节点)', JSON.stringify(r2))
// check() 的第一条分支就是「标题为空 → false」，所以 checkOk===true 本身就证明
// 被检查的内存节点带着标题；再断言它就是刚转正的这条主题，确保测的是「自己撞自己」。
assert('R2 检查的是刚转正的那条主题自身节点', r2?.ky === r1.ky, `r2.ky=${r2?.ky} r1.ky=${r1.ky}`)
assert('R2 对自身主题 check() 通过（自撞已修）', r2?.checkOk === true, JSON.stringify(r2))
assert('R2 未弹出「已存在」', !/已存在|already exists/i.test(r2?.snack ?? ''), `snack=${JSON.stringify(r2?.snack)}`)
assert('R2 库内主题依然是 1 条', (await topicCount(TITLE)) === 1)

// ── R3 转正后清空标题：主题身份必须存活 ──────────────────────────
await clearSnack()
const selected = await ev(`(() => {
  const head = document.querySelector('.editor-view.editor-from-router .node-head')
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
  return !!text
})()`)
await sleeps(300)
await key('Backspace', 'Backspace', 8)
await sleeps(3000)
const r3stored = await storedState(r1.ky)
const r3count = await topicCount(TITLE)
const r3snack = await readSnack()
note('R3 stored', JSON.stringify(r3stored))
note('R3 snack', JSON.stringify(r3snack))
assert('R3 已清空标题文本', selected === true && (await headText()).trim() === '', `head=${JSON.stringify(await headText())}`)
assert('R3 清空标题后主题身份存活（topic/isTopic 未被抹掉）', r3stored?.isTopic === true && r3stored?.topic === TITLE, JSON.stringify(r3stored))
assert('R3 主题仍在主题列表中', r3count === 1, `count=${r3count}`)

// ── R4 refine 后为空的名字不得建成主题 ──────────────────────────
await clearSnack()
const r4 = await newDraft()
assert('R4 净化后为空的标题打字成功', await typeTitle('=='))
await pressEnter()
await sleeps(2000)
const r4stored = await storedState(r4.ky)
note('R4 stored', JSON.stringify(r4stored))
assert('R4 未建成 isTopic:true 但 topic 为空的主题', !(r4stored?.isTopic === true && !r4stored?.topic), JSON.stringify(r4stored))

// ── R5 被放弃的空草稿仍落盘（存量问题，仅记录） ──────────────────
const before = await newNodeCount()
const r5ky = await ev(`(() => { const a = window.__notekitApp.addons; const i = a.topic.createDraftTopic(); return i.ky })()`)
await sleeps(1500)
const after = await newNodeCount()
const r5stored = await storedState(r5ky)
note('R5 孤儿草稿', `nodes ${before}→${after}, stored=${JSON.stringify(r5stored)}, 主题列表可见=${await inTopicList(r5ky)}`)

console.log('\n==== 结果汇总 ====')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`)
console.log(`${results.filter(r => r.ok).length}/${results.length} 通过`)
child.kill()
process.exit(results.every(r => r.ok) ? 0 : 1)
