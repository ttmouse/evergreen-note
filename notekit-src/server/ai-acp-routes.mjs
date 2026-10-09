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
  /** 会话级忙标记：多会话下不能用一个全局 bool —— A 在跑不该把 B 也锁住 */
  const busySessions = new Map()
  const anyBusy = () => busySessions.size > 0
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
      state: !client ? 'stopped' : anyBusy() ? 'busy' : sessionId ? 'ready' : 'starting',
      sessionId,
      busy: anyBusy(),
      sessions: client ? [...client.sessions.keys()] : [],
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
      // ⚠️ 每个事件都必须带 sessionId：多会话下渲染层靠它分流，否则 A 的回复会串进 B。
      if (k === 'agent_message_chunk') push('text', { sessionId: sid, text: update.content?.text ?? '' })
      else if (k === 'agent_thought_chunk') push('thought', { sessionId: sid, text: update.content?.text ?? '' })
      else if (k === 'tool_call')
        push('tool', {
          sessionId: sid,
          toolCallId: update.toolCallId,
          title: update.title || update.kind || 'tool',
          kind: update.kind,
          // rawInput 给 UI 拼「动词 + 宾语」用（DSH 的 title 只有工具名，如 "bash"）。
          // 明确不吃 rawOutput：那是完整工具输出，可能很大，UI 一行放不下。
          rawInput: update.rawInput || null,
          status: update.status || 'pending',
          locations: update.locations || null,
        })
      else if (k === 'tool_call_update')
        push('tool_update', {
          sessionId: sid,
          toolCallId: update.toolCallId,
          status: update.status,
          title: update.title,
          kind: update.kind,
          rawInput: update.rawInput || null,
          locations: update.locations || null,
        })
      else if (k === 'usage_update') push('usage', { sessionId: sid, used: update.used, size: update.size })
      else if (k === 'config_option_update') push('config', { sessionId: sid, configOptions: update.configOptions })
    })

    // agent 反向请求：目前只有 session/request_permission —— 必须应答
    c.on('request', ({ id, method, params, respond }) => {
      if (method !== 'session/request_permission') {
        respond(undefined, { code: -32601, message: `不支持的客户端方法：${method}` })
        return
      }
      const requestId = `perm-${id}`
      const permSid = params?.sessionId || sessionId || undefined
      const timer = setTimeout(() => {
        if (pendingPermissions.has(requestId)) {
          pendingPermissions.delete(requestId)
          respond({ outcome: { outcome: 'cancelled' } })
          push('permission_result', { requestId, sessionId: permSid, decision: 'timeout' })
        }
      }, PERMISSION_TIMEOUT_MS)
      pendingPermissions.set(requestId, { respond, timer, sessionId: permSid })
      push('permission_request', {
        requestId,
        sessionId: permSid,
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
      busySessions.clear()
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

  /**
   * 拿到一个可用的会话 id：在活跃池里直接用；不在就先 session/resume。
   * App/agent 重启后，渲染层手里还是旧 sessionId —— 靠这一步接回原来的上下文
   * （2026-10-09 实测：新 agent 进程 resume 旧会话后，它仍答得出上一进程里埋的暗号）。
   */
  async function useSession(wanted) {
    const sid = String(wanted || '').trim()
    if (!sid) return ensure()
    // ⚠️ 必须先 ensure：App 重启后第一件事往往就是"拿旧 sid 发消息"，
    // 此时 client 还是 null（agent 没起），直接 resume 会 NPE（实测踩过）。
    const fresh = await ensure()
    if (client?.sessions?.has(sid)) return sid
    try {
      const r = await client.resumeSession(sid, { cwd: workspace })
      const back = r?.sessionId || sid
      sessionId = back
      if (back !== sid) push('session_remap', { sessionId: back, from: sid })
      log(`[acp] resume ${sid} → ${back}`)
      return back
    } catch (e) {
      // 会话在 agent 侧真的没了：别让用户卡死，退回 ensure 建的那条并说清楚。
      lastError = `无法接回旧会话（${e.message}），本轮改用了新会话`
      log('[acp] ' + lastError)
      push('session_remap', { sessionId: fresh, from: sid, downgraded: true })
      return fresh
    }
  }

  async function runTurn(text, note, wantedSession) {
    const sid = await useSession(wantedSession)
    if (busySessions.get(sid)) throw new Error('该会话上一轮还没结束')
    busySessions.set(sid, true)
    push('turn_start', { sessionId: sid, text })
    try {
      const stopReason = await client.prompt(sid, composePrompt(text, note))
      push('turn_end', { sessionId: sid, stopReason })
      return stopReason
    } catch (e) {
      lastError = e.message
      push('error', { sessionId: sid, message: e.message })
      throw e
    } finally {
      busySessions.delete(sid)
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
    busySessions.clear()
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

    // 新开一条会话。面板每段对话一条，上下文互不污染（实测：A 埋暗号 B 看不见）。
    if (rest === 'session/new' && req.method === 'POST') {
      try {
        await ensure()
        const sess = await client.newSession({ cwd: workspace })
        sessionId = sess.sessionId
        writeJson(res, { ok: true, sessionId: sess.sessionId, configOptions: sess.configOptions || null })
      } catch (e) {
        lastError = e.message
        writeJson(res, { ok: false, error: e.message, ...state() }, 500)
      }
      return true
    }

    // agent 侧的会话池（按 cwd 分桶）—— 排障用，也方便以后对齐 DSH 桌面端的会话列表。
    if (rest === 'sessions' && req.method === 'GET') {
      try {
        await ensure()
        const l = await client.listSessions()
        const ids = (l?.sessions || []).map((x) => x?.sessionId).filter(Boolean)
        writeJson(res, { ok: true, sessions: ids })
      } catch (e) {
        writeJson(res, { ok: false, error: e.message }, 500)
      }
      return true
    }

    // 显式接回一条旧会话（不在活跃池时）。prompt 内部也会自动 resume，这条给渲染层做即时反馈。
    if (rest === 'resume' && req.method === 'POST') {
      try {
        await ensure()
        const sid = await useSession(body.sessionId)
        writeJson(res, { ok: true, ...state(), sessionId: sid })
      } catch (e) {
        lastError = e.message
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
      runTurn(text, body.note, body.sessionId).catch((e) => log('[acp] 回合失败：' + e.message))
      writeJson(res, { ok: true, accepted: true })
      return true
    }

    if (rest === 'cancel' && req.method === 'POST') {
      const cancelSid = String(body.sessionId || sessionId || '')
      if (client && cancelSid) client.cancel(cancelSid)
      push('cancel_sent', { sessionId: cancelSid || undefined })
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
      push('permission_result', { requestId, sessionId: entry.sessionId, decision })
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
