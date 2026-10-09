/**
 * ACP（Agent Client Protocol）客户端 —— 零依赖，跑在 server.mjs 里。
 *
 * 设计要点（依据 2026-10-09 的实测与方案 notes/AI侧边栏ACP接入方案-20261009.md）：
 *  1. 传输：把 `dsh --profile acp` 拉成子进程，stdout 走 NDJSON 的 JSON-RPC 2.0，一行一帧。
 *  2. stdout 只准有协议帧；日志一律 stderr。第三方插件污染 stdout 会炸帧流，这里做容错丢弃。
 *  3. 会话生命周期归 agent（DSH 支持 list/resume/close；session/load 与历史重放不支持）。
 *  4. 取消是通知语义：cancel 之后仍会收到 tool_call_update，客户端必须继续消费到该 prompt 以
 *     stopReason=cancelled 收尾，不能提前把状态清掉。
 *  5. 进程生死由这里兜：SIGTERM → 宽限 → SIGKILL；退出时把所有挂起请求作废（绝不静默挂起）。
 */

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

const DEFAULT_GRACE_MS = 5000

/** 把一行文本按 NDJSON 解析；不是合法 JSON 就返回 null（容错，不抛）。 */
function parseFrame(line) {
  const s = line.trim()
  if (!s) return null
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

export class AcpClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} [opts.command] 可执行文件，默认 dsh
   * @param {string[]} [opts.args]  默认 ['--profile','acp']
   * @param {string} opts.cwd       agent 的工作目录（绝对路径）
   * @param {object} [opts.env]     额外环境变量
   * @param {number} [opts.graceMs] SIGTERM 后等多久 SIGKILL
   */
  constructor(opts = {}) {
    super()
    this.command = opts.command || process.env.NOTEKIT_ACP_CMD || 'dsh'
    this.args = opts.args || ['--profile', 'acp']
    this.cwd = opts.cwd || process.cwd()
    this.extraEnv = opts.env || {}
    this.graceMs = opts.graceMs ?? DEFAULT_GRACE_MS

    this.proc = null
    this.nextId = 1
    this.pending = new Map() // id -> {resolve, reject, method}
    this.buf = ''
    this.sessions = new Map() // sessionId -> { id, cwd, configOptions }
    this.inflight = new Map() // sessionId -> true（每会话同一时刻只允许一个 prompt）
    this.ready = false
    this.exited = false
    this.stderrTail = []
  }

  // ---------------------------------------------------------------- 生命周期

  start() {
    if (this.proc) return this
    this.exited = false
    this.proc = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (chunk) => this._onStdout(chunk))

    this.proc.stderr.setEncoding('utf8')
    this.proc.stderr.on('data', (chunk) => {
      const s = String(chunk)
      this.stderrTail.push(s)
      if (this.stderrTail.length > 40) this.stderrTail.shift()
      this.emit('stderr', s)
    })

    this.proc.on('error', (err) => {
      this._failAll(new Error(`ACP 子进程启动失败：${err.message}`))
      this.emit('exit', { code: null, signal: null, error: err })
    })

    this.proc.on('exit', (code, signal) => {
      this.exited = true
      this.ready = false
      this._failAll(new Error(`ACP 子进程已退出（code=${code} signal=${signal}）`))
      this.emit('exit', { code, signal, stderr: this.stderrTail.join('') })
    })

    return this
  }

  /** SIGTERM → 宽限 → SIGKILL，并保证不留僵尸。 */
  stop() {
    const p = this.proc
    if (!p || this.exited) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => resolve()
      p.once('exit', done)
      try {
        p.kill('SIGTERM')
      } catch {
        return done()
      }
      setTimeout(() => {
        if (p.exitCode === null && p.signalCode === null) {
          try {
            p.kill('SIGKILL')
          } catch {}
        }
        resolve()
      }, this.graceMs)
    })
  }

  _failAll(err) {
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
    this.inflight.clear()
  }

  // ------------------------------------------------------------------ 收发帧

  _write(obj) {
    if (!this.proc || this.exited) throw new Error('ACP 子进程不可用')
    this.proc.stdin.write(JSON.stringify(obj) + '\n')
  }

  _request(method, params, timeoutMs = 120000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`ACP 请求超时：${method}`))
        }
      }, timeoutMs)
      this.pending.set(id, {
        method,
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      try {
        this._write({ jsonrpc: '2.0', id, method, params })
      } catch (e) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(e)
      }
    })
  }

  _notify(method, params) {
    this._write({ jsonrpc: '2.0', method, params })
  }

  _respond(id, result, error) {
    const msg = { jsonrpc: '2.0', id }
    if (error) msg.error = error
    else msg.result = result
    this._write(msg)
  }

  _onStdout(chunk) {
    this.buf += chunk
    let idx
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx)
      this.buf = this.buf.slice(idx + 1)
      const msg = parseFrame(line)
      if (!msg) {
        // 非协议输出：丢弃但留痕（stdout 只该有协议帧）
        if (line.trim()) this.emit('garbage', line)
        continue
      }
      this._dispatch(msg)
    }
  }

  _dispatch(msg) {
    const { id, method, result, error, params } = msg

    // ① 我方请求的响应
    if (id !== undefined && id !== null && method === undefined) {
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      if (error) p.reject(new Error(error.message || JSON.stringify(error)))
      else p.resolve(result)
      return
    }

    // ② agent 反向请求（如 session/request_permission）→ 必须应答，否则它会一直等
    if (method && id !== undefined && id !== null) {
      this.emit('request', { id, method, params, respond: (r, e) => this._respond(id, r, e) })
      return
    }

    // ③ 通知（session/update 等）
    if (method) {
      if (method === 'session/update') {
        const sid = params?.sessionId
        const upd = params?.update
        this.emit('update', { sessionId: sid, update: upd })
        if (upd?.sessionUpdate === 'config_option_update') {
          const s = this.sessions.get(sid)
          if (s) s.configOptions = upd.configOptions ?? s.configOptions
        }
      }
      this.emit('notification', { method, params })
    }
  }

  // -------------------------------------------------------------------- 协议

  async initialize(clientCapabilities = {}) {
    this.start()
    const res = await this._request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { ...clientCapabilities },
    })
    this.ready = true
    this.agentInfo = res?.agentInfo
    this.agentCapabilities = res?.agentCapabilities
    this.emit('ready', res)
    return res
  }

  async newSession({ cwd, mcpServers = [] } = {}) {
    const res = await this._request('session/new', { cwd: cwd || this.cwd, mcpServers })
    if (res?.sessionId) {
      this.sessions.set(res.sessionId, { id: res.sessionId, cwd: cwd || this.cwd, configOptions: res.configOptions })
    }
    return res
  }

  async listSessions({ cwd } = {}) {
    return this._request('session/list', cwd ? { cwd } : {})
  }

  /** 接续一个已持久化的旧会话（不重放旧内容，上下文在 agent 侧恢复）。 */
  async resumeSession(sessionId, { cwd, mcpServers = [] } = {}) {
    const res = await this._request('session/resume', { sessionId, cwd: cwd || this.cwd, mcpServers })
    this.sessions.set(sessionId, { id: sessionId, cwd: cwd || this.cwd, configOptions: res?.configOptions })
    return res
  }

  async closeSession(sessionId) {
    const res = await this._request('session/close', { sessionId })
    this.sessions.delete(sessionId)
    return res
  }

  /** 发一轮。返回 stopReason；流式内容通过 'update' 事件出来。 */
  async prompt(sessionId, text) {
    if (this.inflight.get(sessionId)) throw new Error('该会话已有一轮在飞（ACP 每会话同一时刻只允许一个 prompt）')
    this.inflight.set(sessionId, true)
    try {
      const res = await this._request(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text: String(text ?? '') }] },
        30 * 60 * 1000
      )
      return res?.stopReason ?? 'end_turn'
    } finally {
      this.inflight.delete(sessionId)
    }
  }

  /** 取消是通知；取消后仍会到达 tool_call_update，属正常。 */
  cancel(sessionId) {
    this._notify('session/cancel', { sessionId })
  }

  async setConfigOption(sessionId, configId, value) {
    return this._request('session/set_config_option', { sessionId, configId, value })
  }
}

export default AcpClient
