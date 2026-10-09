/**
 * ACP 传输层冒烟测试（不碰笔记库）。
 * 用法：node tools/acp-smoke.mjs ["提示词"]
 */
import { mkdirSync } from 'node:fs'
import { AcpClient } from '../server/acp-client.mjs'

const WS = '/tmp/nk-acp-ws'
mkdirSync(WS, { recursive: true })

const promptText = process.argv[2] || '只回复两个字：可用'
const t0 = Date.now()
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'

const c = new AcpClient({ cwd: WS })

c.on('stderr', (s) => process.stderr.write('[agent stderr] ' + s))
c.on('garbage', (s) => console.log(`${el()} [非协议输出·已丢弃] ${s.slice(0, 120)}`))

let text = ''
let toolCount = 0
c.on('update', ({ update }) => {
  if (!update) return
  const k = update.sessionUpdate
  if (k === 'agent_message_chunk') {
    const t = update.content?.text ?? ''
    text += t
    process.stdout.write(t)
  } else if (k === 'agent_thought_chunk') {
    console.log(`\n${el()} [思考] ${(update.content?.text ?? '').slice(0, 100)}`)
  } else if (k === 'tool_call') {
    toolCount++
    console.log(`\n${el()} [工具·开始] ${update.title || update.kind} status=${update.status}`)
    if (update.locations?.length) console.log(`            位置: ${JSON.stringify(update.locations).slice(0, 200)}`)
  } else if (k === 'tool_call_update') {
    console.log(`${el()} [工具·更新] ${update.toolCallId?.slice(0, 12)} status=${update.status}`)
  } else if (k === 'usage_update') {
    console.log(`\n${el()} [用量] ${JSON.stringify(update).slice(0, 160)}`)
  } else {
    console.log(`\n${el()} [其它] ${k} ${JSON.stringify(update).slice(0, 160)}`)
  }
})

c.on('request', ({ method, params, respond }) => {
  console.log(`\n${el()} [agent 反向请求] ${method} ${JSON.stringify(params).slice(0, 300)}`)
  respond({ outcome: { outcome: 'selected', optionId: 'reject' } })
})

c.on('exit', (e) => console.log(`\n${el()} [子进程退出] code=${e.code} signal=${e.signal}`))

try {
  const init = await c.initialize()
  console.log(`${el()} initialize OK → ${init.agentInfo?.name} v${init.agentInfo?.version}`)
  console.log(`       capabilities: ${JSON.stringify(init.agentCapabilities)}`)

  const sess = await c.newSession({ cwd: WS })
  console.log(`${el()} session/new OK → ${sess.sessionId}`)
  console.log(`       模型项: ${JSON.stringify(sess.configOptions?.[0]?.options?.[0]?.options?.slice(0, 3))}`)

  console.log(`\n--- 发一轮：「${promptText}」 ---`)
  const stop = await c.prompt(sess.sessionId, promptText)
  console.log(`\n${el()} 回合结束 stopReason=${stop}`)
  console.log(`       正文长度=${text.length} 工具调用=${toolCount}`)

  await c.closeSession(sess.sessionId)
  console.log(`${el()} session/close OK`)
} catch (e) {
  console.error(`\n${el()} 失败：${e.message}`)
} finally {
  await c.stop()
  console.log(`${el()} 子进程已停`)
  process.exit(0)
}
