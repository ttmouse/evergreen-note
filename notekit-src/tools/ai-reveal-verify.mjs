/**
 * 验证 AI 面板「正文展开」是不是真的按时间铺开，而不是整块直出。
 *
 * 为什么需要它：ACP 的 agent_message_chunk 是整段提交（实测 1 个事件、跨度 0ms），
 * 所以"流式"完全由前端这一层决定 —— 它退化成"整块出现"的话，肉眼看不出区别，
 * 只有按时间采样渲染长度才能证明它在动。
 *
 * 做法：起一个**隔离实例**（自己的 NOTEKIT_USER_DATA / NOTEKIT_PORT，不碰正式库），
 * 把一整段正文直接塞进 store（不惊动 agent、不消耗额度），然后每 ~50ms 采一次
 * `.ai-md` 的渲染长度。三个场景：
 *   A 新到的正文（到手 2s 内）  → 期望单调增长，跨度远超一帧
 *   B 历史正文（到手 10s 前）   → 期望第一次采样即全长
 *   C 新到正文 + 减少动态效果   → 期望第一次采样即全长
 *
 * 用法：node tools/ai-reveal-verify.mjs
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'ai-reveal-verify')
const sleeps = (ms) => new Promise((r) => setTimeout(r, ms))

const PROBE_TEXT = [
  '## 探针正文',
  '',
  '这是用来测展开节奏的一整段文字，内容本身没有意义，长度才是重点。',
  '',
  '- 第一条：它应该是一点一点出现的，而不是一下子全在。',
  '- 第二条：出现的过程中，渲染出来的字符数应当单调不减。',
  '- 第三条：走完之后必须和完整渲染的结果完全一致，不能少字。',
  '',
  '再加一段普通文字把长度拉起来，避免因为太短而在第一帧就走完。',
  '再补一句：展开只对刚到手的正文生效，历史回看和减少动态效果下应当直接给全量。',
].join('\n')

async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close((e) => (e ? rej(e) : res())))
  return port
}

await rm(outDir, { recursive: true, force: true })
await mkdir(path.join(outDir, 'profile'), { recursive: true })
const profile = path.join(outDir, 'profile')
const appPort = await freePort()
const debugPort = await freePort()
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
// 三个环境相关的开关，缺一个都起不来（都是本机跑隔离实例踩出来的）：
//   --no-sandbox        宿主不允许 Chromium 起自己的 seatbelt 沙箱，不给就直接崩渲染进程
//   --disable-gpu       无 GPU 进程的宿主里省掉一次崩溃重试
//   NOTEKIT_DEV_MODE=1  正式 App 通常在跑，默认 userData 会被它的 single-instance 锁挡住；
//                       这个开关把 Electron 侧 profile 换成 <userData>-HMR-<pid>，互不干扰
const child = spawn(electron, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`, '--no-sandbox', '--disable-gpu'], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_DEV_MODE: '1', NOTEKIT_PORT: String(appPort), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let childLog = ''
child.stderr.on('data', (d) => { childLog = (childLog + d).slice(-2000) })
child.stdout.on('data', (d) => { childLog = (childLog + d).slice(-2000) })

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { child.kill('SIGKILL'); throw new Error('隔离实例没起来（CDP 连不上）\n' + childLog) }
for (let i = 0; i < 90; i++) { if (await cdp.evaluate('!!window.__notekitApp').catch(() => false)) break; await sleeps(1000) }
const exceptions = []

const setup = await cdp.evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const S = window.__nkAiPanelStore
  if (!S) return 'no-store'
  S.open = true
  await sleep(700)
  if (!document.querySelector('.ai-panel-area')) return 'no-panel'
  window.__nkProbe = async (label, atOffset) => {
    const area = document.querySelector('.ai-panel-area')
    S.newConversation()
    await sleep(120)
    const lastLen = () => { const els = area.querySelectorAll('.ai-md'); const l = els[els.length - 1]; return l ? l.innerText.length : -1 }
    const lastCls = () => { const els = area.querySelectorAll('.ai-md'); const l = els[els.length - 1]; return l ? l.className : null }
    const t0 = performance.now()
    S.apply({ type: 'turn_start', at: Date.now(), text: '探针' })
    S.apply({ type: 'text', at: Date.now() + atOffset, text: ${JSON.stringify(PROBE_TEXT)} })
    const samples = []
    let stable = 0
    for (let i = 0; i < 200; i++) {
      const n = lastLen()
      if (samples.length === 0 || samples[samples.length - 1][1] !== n) samples.push([Math.round(performance.now() - t0), n])
      const prev = samples.length > 1 ? samples[samples.length - 2][1] : -1
      stable = n === prev ? stable + 1 : 0
      if (n >= 0 && stable >= 6) break
      await sleep(50)
    }
    return { label, cls: lastCls(), done: lastLen(), steps: samples.length - 1, spanMs: samples.length > 1 ? samples[samples.length - 1][0] - samples[0][0] : 0, samples: samples.slice(0, 16) }
  }
  return 'ok'
})()`)
if (setup !== 'ok') { console.log(JSON.stringify({ fatal: setup })); cdp.close(); child.kill('SIGKILL'); process.exit(1) }

const setMedia = (reduce) =>
  cdp.call('Emulation.setEmulatedMedia', reduce
    ? { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }
    : { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })

await setMedia(false)
const A = JSON.parse(await cdp.evaluate(`(async () => JSON.stringify(await window.__nkProbe('A 新到正文', 0)))()`))
const B = JSON.parse(await cdp.evaluate(`(async () => JSON.stringify(await window.__nkProbe('B 历史正文（到手 10s 前）', -10000)))()`))
await setMedia(true)
const C = JSON.parse(await cdp.evaluate(`(async () => JSON.stringify(await window.__nkProbe('C 新到正文 + 减少动态效果', 1)))()`))

for (const e of cdp.events) if (e.method === 'Runtime.exceptionThrown') exceptions.push(e.params?.exceptionDetails?.exception?.description || 'exception')

// 采样里第一条可能是 -1（React 还没把 .ai-md 挂上去）。判断展开只看**第一次读到内容之后**
// 的形态：steps = 可读采样里长度变化的次数，0 就是"第一次读到即全长"。
const readable = (r) => r.samples.filter((s) => s[1] >= 0)
const stepsOf = (r) => Math.max(0, readable(r).length - 1)
const spanOf = (r) => { const v = readable(r); return v.length > 1 ? v[v.length - 1][0] - v[0][0] : 0 }
const A2 = { steps: stepsOf(A), spanMs: spanOf(A), firstLen: readable(A)[0]?.[1] ?? -1 }
const B2 = { steps: stepsOf(B) }
const C2 = { steps: stepsOf(C) }
const monotonic = readable(A).every((s, i) => i === 0 || s[1] >= readable(A)[i - 1][1])

const verdict = [
  { check: 'A 新到正文逐步展开（≥3 个中间态）', pass: A2.steps >= 3, got: `steps=${A2.steps}` },
  { check: 'A 起步时还没到全长（第一帧不是全量）', pass: A2.firstLen >= 0 && A2.firstLen < A.done, got: `first=${A2.firstLen} full=${A.done}` },
  { check: 'A 展开跨度 ≥120ms（不是一帧内闪完）', pass: A2.spanMs >= 120, got: `spanMs=${A2.spanMs}` },
  { check: 'A 过程中长度单调不减', pass: monotonic, got: JSON.stringify(readable(A).map((s) => s[1])) },
  { check: 'A 收尾与不展开时渲染长度一致（没少字）', pass: A.done > 0 && A.done === C.done, got: `A=${A.done} C=${C.done}` },
  { check: 'A 走展开路径（不带 nk-settle）', pass: !String(A.cls).includes('nk-settle'), got: A.cls },
  { check: 'B 历史正文第一次读到即全长', pass: B2.steps === 0, got: `steps=${B2.steps}` },
  { check: 'C 减少动态效果下第一次读到即全长', pass: C2.steps === 0, got: `steps=${C2.steps}` },
  { check: '无运行时异常', pass: exceptions.length === 0, got: exceptions.slice(0, 2).join(' / ') },
]

const report = { A: { ...A, steps: A2.steps, spanMs: A2.spanMs, firstLen: A2.firstLen }, B: { ...B, steps: B2.steps }, C: { ...C, steps: C2.steps }, exceptions, verdict }
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ verdict, A: { steps: A2.steps, spanMs: A2.spanMs, firstLen: A2.firstLen, full: A.done, samples: A.samples }, B: { steps: B2.steps, samples: B.samples }, C: { steps: C2.steps, samples: C.samples }, exceptions }, null, 2))
cdp.close()
child.kill('SIGKILL')
process.exit(verdict.every((v) => v.pass) ? 0 : 1)
