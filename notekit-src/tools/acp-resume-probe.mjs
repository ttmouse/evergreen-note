/**
 * 能力探针：ACP 的多会话 / 会话恢复到底能不能用。
 * 决定 AI 面板「历史会话可切换并继续聊」按哪种语义做 —— 真·多会话，还是只切显示。
 *
 * 三个问题：
 *   ① 同一 agent 进程里，两个会话能否并存且互不串上下文
 *   ② 切回去（重发问）能不能接着聊
 *   ③ agent 重启后，旧会话能否 resume 回来（= App 重启后历史会话还能不能续）
 *
 * 用法：node tools/acp-resume-probe.mjs
 * 隔离：cwd 落在 /tmp 独立目录，不碰真库、不碰正式会话池。
 */
import { AcpClient } from '../server/acp-client.mjs'
import { mkdirSync } from 'node:fs'
import os from 'node:os'

const WS = process.env.PROBE_CWD || '/tmp/nk-acp-resume-probe'
mkdirSync(WS, { recursive: true })

const home = os.homedir()
const PATH = [home + '/.npm-global/bin', home + '/.local/bin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].join(':')

const t0 = Date.now()
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
const log = (...a) => console.log(el(), ...a)

function makeClient() {
  const c = new AcpClient({ cwd: WS, env: { PATH } })
  let buf = ''
  c.on('update', ({ update }) => {
    if (update?.sessionUpdate === 'agent_message_chunk') buf += update.content?.text ?? ''
  })
  c.on('request', ({ respond }) => respond({ outcome: { outcome: 'selected', optionId: 'reject' } }))
  const ask = async (sid, text) => {
    buf = ''
    const stop = await c.prompt(sid, text)
    return { stop, text: buf.trim().replace(/\s+/g, ' ').slice(0, 80) }
  }
  return { c, ask }
}

const out = {}
const R = (k, v) => { out[k] = v; log(k, '→', JSON.stringify(v)) }

// ---------------------------------------------------------------- 阶段一
const p1 = makeClient()
p1.c.on('exit', () => log('[阶段一] agent 已退出'))
const init1 = await p1.c.initialize()
R('agent', `${init1.agentInfo?.name} v${init1.agentInfo?.version}`)

const A = (await p1.c.newSession({ cwd: WS })).sessionId
const B = (await p1.c.newSession({ cwd: WS })).sessionId
R('A', A); R('B', B)
R('A埋暗号(期望OK)', await p1.ask(A, '记住暗号：FALCON-77。只回复 OK，不要使用任何工具。'))
R('B埋暗号(期望OK)', await p1.ask(B, '记住暗号：EAGLE-11。只回复 OK，不要使用任何工具。'))
// ② 切回 A / B 各问一次
R('切回A问暗号(期望FALCON-77)', await p1.ask(A, '暗号是什么？只回暗号本身。不要使用任何工具。'))
R('切到B问暗号(期望EAGLE-11)', await p1.ask(B, '暗号是什么？只回暗号本身。不要使用任何工具。'))
try {
  const l = await p1.c.listSessions()
  R('listSessions', Array.isArray(l?.sessions) ? `${l.sessions.length} 个: ` + l.sessions.slice(0, 6).map((s) => String(s.sessionId).slice(0, 8)).join(',') : JSON.stringify(l).slice(0, 200))
} catch (e) { R('listSessions', 'ERROR: ' + e.message) }
try { await p1.c.closeSession(B); R('closeSession(B)', 'OK') } catch (e) { R('closeSession(B)', 'ERROR: ' + e.message) }
await p1.c.stop(); log('[阶段一] 子进程已停')
await new Promise((r) => setTimeout(r, 1500))

// ---------------------------------------------------------------- 阶段二：跨进程接续
const p2 = makeClient()
const init2 = await p2.c.initialize()
log('[阶段二] 新 agent 起来', init2.agentInfo?.name)
try {
  const r = await p2.c.resumeSession(A, { cwd: WS })
  R('resume(A) 旧会话', r?.sessionId === A ? 'OK 返回同一 id' : JSON.stringify(r).slice(0, 120))
  R('重启后问A暗号(期望FALCON-77)', await p2.ask(A, '暗号是什么？只回暗号本身。不要使用任何工具。'))
} catch (e) { R('resume(A)', 'ERROR: ' + e.message) }
await p2.c.stop()

console.log('\n=== 结论数据 ===\n' + JSON.stringify(out, null, 1))
process.exit(0)
