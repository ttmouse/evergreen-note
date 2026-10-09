/**
 * /api/ai/acp/* —— 把 AcpClient 包成 HTTP + SSE，供渲染层的 AI 面板使用。
 *
 * 约定（v1，单会话）：
 *   GET  /api/ai/acp/status                  → {state, sessionId, busy, agent}
 *   GET  /api/ai/acp/stream                  → SSE：push 会话事件
 *   POST /api/ai/acp/session                 → 确保 agent + 会话就绪
 *   POST /api/ai/acp/prompt  {text, note}    → 发一轮（异步，事件走 SSE）
 *   POST /api/ai/acp/cancel                  → 取消当前轮
 *   POST /api/ai/acp/permission {requestId, decision} → 应答 agent 的审批请求
 *   POST /api/ai/acp/stop                    → 杀掉 agent（应用退出时用）
 *
 * 三条纪律（来自方案 §4）：
 *   1. 退出/崩溃必须显式告诉 UI，绝不留静默挂起；
 *   2. cancel 之后仍会收到 tool_call_update，照常转发到 UI；
 *   3. 审批请求必须有应答（超时按拒绝处理）。
 */

import path from 'node:path'
import os from 'node:os'
import { mkdirSync } from 'node:fs'
import { AcpClient } from './acp-client.mjs'

const PERMISSION_TIMEOUT_MS = 120000

/** agent 子进程要能看见 dsh / ev（GUI 启动的进程 PATH 往往很窄，这里显式补） */
function agentEnv() {
  const home = process.env.HOME || ''
  const extraPaths = [
    home && path.join(home, '.npm-global/bin'), // dsh 在这里
    home && path.join(home, '.local/bin'),
    '/opt/homebrew/bin', // ev 在这里
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter(Boolean)
  const cur = process.env.PATH || ''
  const PATH = [...new Set([...extraPaths, ...cur.split(':').filter(Boolean)])].join(':')
  return { PATH }
}

export function createAiAcpService({ dataDir, readBody, writeJson, log = () => {} }) {
  // 工作目录：默认对齐用户主目录——DSH 的会话池按 cwd 分桶，对齐后面板的会话
  // 才会出现在桌面端的会话列表里（双向可见/可接续）。可用 NOTEKIT_ACP_CWD 覆盖。
  const agentCwd = process.env.NOTEKIT_ACP_CWD || os.homedir()
  const workspace = agentCwd
  mkdirSync(workspace, { recursive: true })

  /** @type {AcpClient|null} */
  let client = null
  let sessionId = null
  let busy = false
  let starting = null
  let agentInfo = null
  let lastError = null

  const subscribers = new Set() // res（SSE）
  const pendingPermissions = new Map() // requestId -> {respond, timer}

  const now = () => Date.now()

  // ------------------------------------------------------------------ 事件广播

  function push(type, payload = {}) {
    const ev = { type, at: now(), ...payload }
    const line = `data: ${JSON.stringify(ev)}\n\n`
    for (const res of subscribers) {
      try {
        res.write(line)
      } catch {
        subscribers.delete(res)
      }
    }
  }

  function state() {
    return {
      state: !client ? 'stopped' : busy ? 'busy' : sessionId ? 'ready' : 'starting',
      sessionId,
      busy,
      agent: agentInfo ? `${agentInfo.name} v${agentInfo.version}` : null,
      workspace,
      error: lastError,
    }
  }

  // ------------------------------------------------------------------ agent 生命周期

  function wire(c) {
    c.on('update', ({ sessionId: sid, update }) => {
      if (!update) return
      const k = update.sessionUpdate
      if (k === 'agent_message_chunk') push('text', { text: update.content?.text ?? '' })
      else if (k === 'agent_thought_chunk') push('thought', { text: update.content?.text ?? '' })
      else if (k === 'tool_call')
        push('tool', {
          toolCallId: update.toolCallId,
          title: update.title || update.kind || 'tool',
          kind: update.kind,
          status: update.status || 'pending',
          locations: update.locations || null,
        })
      else if (k === 'tool_call_update')
        push('tool_update', {
          toolCallId: update.toolCallId,
          status: update.status,
          title: update.title,
          locations: update.locations || null,
        })
      else if (k === 'usage_update') push('usage', { used: update.used, size: update.size })
      else if (k === 'config_option_update') push('config', { configOptions: update.configOptions })
    })

    // agent 反向请求：目前只有 session/request_permission —— 必须应答
    c.on('request', ({ id, method, params, respond }) => {
      if (method !== 'session/request_permission') {
        respond(undefined, { code: -32601, message: `不支持的客户端方法：${method}` })
        return
      }
      const requestId = `perm-${id}`
      const timer = setTimeout(() => {
        if (pendingPermissions.has(requestId)) {
          pendingPermissions.delete(requestId)
          respond({ outcome: { outcome: 'cancelled' } })
          push('permission_result', { requestId, decision: 'timeout' })
        }
      }, PERMISSION_TIMEOUT_MS)
      pendingPermissions.set(requestId, { respond, timer })
      push('permission_request', {
        requestId,
        toolCall: params?.toolCall || null,
        options: params?.options || null,
      })
    })

    c.on('stderr', (s) => log('[acp:stderr] ' + s.trim().slice(0, 500)))
    c.on('garbage', (s) => log('[acp:非协议输出] ' + s.slice(0, 200)))

    c.on('exit', ({ code, signal }) => {
      const wasRunning = !!client
      client = null
      sessionId = null
      busy = false
      starting = null
      if (wasRunning) {
        lastError = `agent 已退出（code=${code} signal=${signal}）`
        push('agent_exit', { code, signal, message: lastError })
      }
    })
  }

  async function ensure() {
    if (client && sessionId) return sessionId
    if (starting) return starting
    starting = (async () => {
      lastError = null
      const c = new AcpClient({ cwd: workspace, env: agentEnv() })
      wire(c)
      const init = await c.initialize()
      agentInfo = init?.agentInfo || null
      const sess = await c.newSession({ cwd: workspace })
      client = c
      sessionId = sess.sessionId
      push('ready', { sessionId, agent: agentInfo, configOptions: sess.configOptions || null })
      log(`[acp] 就绪 session=${sessionId} agent=${agentInfo?.name}`)
      return sessionId
    })()
    try {
      return await starting
    } catch (e) {
      lastError = e.message
      client = null
      sessionId = null
      push('error', { message: `启动失败：${e.message}` })
      throw e
    } finally {
      starting = null
    }
  }

  /** 把当前笔记拼进 prompt（我们没有"文件路径"可给 agent 自己读） */
  function composePrompt(text, note) {
    const parts = []
    if (note && (note.title || note.ky || note.body)) {
      const id = note.ky ? `（ky=${note.ky}）` : ''
      parts.push(`【环境信息】用户正在 Evergreen note 中查看笔记「${note.title || '(无标题)'}」${id}。若本次请求与这篇笔记相关，可用 ev get --ky ${note.ky} 读取或向它追加；若无关（例如整理整个库、处理别的内容），忽略此条即可。`)
    }
    parts.push(String(text || ''))
    return parts.join('\n\n')
  }

  async function runTurn(text, note) {
    if (busy) throw new Error('上一轮还没结束')
    const sid = await ensure()
    busy = true
    push('turn_start', { text })
    try {
      const stopReason = await client.prompt(sid, composePrompt(text, note))
      push('turn_end', { stopReason })
      return stopReason
    } catch (e) {
      lastError = e.message
      push('error', { message: e.message })
      throw e
    } finally {
      busy = false
    }
  }

  async function stop() {
    for (const [, p] of pendingPermissions) {
      clearTimeout(p.timer)
      try {
        p.respond({ outcome: { outcome: 'cancelled' } })
      } catch {}
    }
    pendingPermissions.clear()
    const c = client
    client = null
    sessionId = null
    busy = false
    if (c) await c.stop()
    push('stopped', {})
  }

  // ------------------------------------------------------------------ 路由

  /** @returns {boolean} 是否由本服务处理 */
  async function handle(req, res, p) {
    if (!p.startsWith('/api/ai/acp/')) return false
    const rest = p.slice('/api/ai/acp/'.length)

    if (rest === 'status' && req.method === 'GET') {
      writeJson(res, state())
      return true
    }

    // SSE
    if (rest === 'stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.write(`retry: 2000\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'hello', at: now(), ...state() })}\n\n`)
      subscribers.add(res)
      const keep = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {}
      }, 15000)
      req.on('close', () => {
        clearInterval(keep)
        subscribers.delete(res)
      })
      return true
    }

    const body = req.method === 'POST' ? await readBody(req) : {}

    if (rest === 'session' && req.method === 'POST') {
      try {
        const sid = await ensure()
        writeJson(res, { ok: true, ...state(), sessionId: sid })
      } catch (e) {
        writeJson(res, { ok: false, error: e.message, ...state() }, 500)
      }
      return true
    }

    if (rest === 'prompt' && req.method === 'POST') {
      const text = String(body.text || '').trim()
      if (!text) {
        writeJson(res, { ok: false, error: '空提示词' }, 400)
        return true
      }
      // 立刻返回，内容走 SSE（避免 HTTP 长挂）
      runTurn(text, body.note).catch((e) => log('[acp] 回合失败：' + e.message))
      writeJson(res, { ok: true, accepted: true })
      return true
    }

    if (rest === 'cancel' && req.method === 'POST') {
      if (client && sessionId) client.cancel(sessionId)
      push('cancel_sent', {})
      writeJson(res, { ok: true })
      return true
    }

    if (rest === 'permission' && req.method === 'POST') {
      const { requestId, decision } = body || {}
      const entry = pendingPermissions.get(requestId)
      if (!entry) {
        writeJson(res, { ok: false, error: '审批请求不存在或已超时' }, 404)
        return true
      }
      clearTimeout(entry.timer)
      pendingPermissions.delete(requestId)
      const opts = entry.options || {}
      // ACP：从 agent 给的 options 里挑一个 optionId
      let optionId = null
      const list = opts.options || []
      if (decision === 'allow') optionId = list.find((o) => o.kind === 'allow_once')?.optionId ?? list[0]?.optionId
      else if (decision === 'always') optionId = list.find((o) => o.kind === 'allow_always')?.optionId ?? list[0]?.optionId
      else optionId = list.find((o) => o.kind === 'reject_once')?.optionId ?? list[list.length - 1]?.optionId

      if (optionId) entry.respond({ outcome: { outcome: 'selected', optionId } })
      else entry.respond({ outcome: { outcome: 'cancelled' } })
      push('permission_result', { requestId, decision })
      writeJson(res, { ok: true, optionId })
      return true
    }

    if (rest === 'stop' && req.method === 'POST') {
      await stop()
      writeJson(res, { ok: true })
      return true
    }

    writeJson(res, { ok: false, error: `未知的 AI 端点：${rest}` }, 404)
    return true
  }

  return { handle, stop, state, push, _internal: { get client() { return client } } }
}

export default createAiAcpService
