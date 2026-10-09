/**
 * 干净地重启正式 App（用户 2026-10-09 18:26 明确授权我自行重启）。
 *
 * 为什么需要它：App 的 live-update 只做 `webContents.reloadIgnoringCache()`，
 * **只换渲染层**。ACP 服务端是主进程 spawn 的子进程，`server/` 下任何改动
 * 都必须「退出 App 再打开」才生效（⌘R 不够）。
 *
 * 用法：
 *   node tools/restart-app.mjs            # 重启
 *   node tools/restart-app.mjs --check    # 只看现状，不动
 *   node tools/restart-app.mjs --force    # 允许最后手段 SIGKILL
 *
 * ⚠️ 身份判据是**主进程**，不是端口。
 * 2026-10-09 18:41 真实故障：主进程活着、服务端子进程已死（11820 无人监听），
 * 而它握着单实例锁 → 新起的实例秒退（`[LAUNCH] main.cjs top` → `exit 0`）。
 * 当时本脚本用端口认 App，判定「App 没在跑」直接退出 —— 恰好帮不上这个故障。
 * 所以现在：**活着 = 主进程存在**；端口只用来判断服务端起来了没有。
 *
 * 安全纪律（沿用仓库规矩：不强杀正式应用、退出前等保存队列排空）：
 *   ① 先走 AppleEvent quit —— 等同 ⌘Q，会触发 before-quit：flush SQLite → 备份 → kill 子进程
 *   ② 20s 未退才 SIGTERM（再给 10s）
 *   ③ SIGKILL 是最后手段，默认拒绝，只在 --force 时用
 *   ④ 重启用 LaunchServices（open），不带进调用方的进程组
 */
import { execFileSync, spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK_ONLY = process.argv.includes('--check')
const ALLOW_FORCE = process.argv.includes('--force')

const root = fileURLToPath(new URL('../', import.meta.url))
const APP_BUNDLE = process.env.NOTEKIT_APP_BUNDLE || path.join(root, 'build', 'Evergreen note.app')
const APP_BIN = path.join(APP_BUNDLE, 'Contents', 'MacOS', 'Evergreen note')
const SERVER_ROUTE = path.join(APP_BUNDLE, 'Contents', 'Resources', 'app', 'server', 'ai-acp-routes.mjs')
const PORT = Number(process.env.NOTEKIT_PORT || 11820)

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 主进程：命令行指向 App 二进制、且**不是** helper（helper 都带 --type=） */
const mainPids = () =>
  sh('ps', ['-ax', '-o', 'pid=,command='])
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const sp = l.indexOf(' ')
      return { pid: Number(l.slice(0, sp)), cmd: l.slice(sp + 1) }
    })
    // 排除两类冒充者：Electron helper（带 --type=）；
    // 以及服务端子进程 —— main.cjs 用 process.execPath（= App 二进制）以
    // ELECTRON_RUN_AS_NODE 起 server.mjs，所以它的命令行里也有 APP_BIN。
    .filter(({ cmd }) =>
      cmd.includes(APP_BIN) && !cmd.includes('--type=') && !cmd.includes('server.mjs') && !cmd.includes('--experimental-sqlite'),
    )
    .map((o) => o.pid)
    .filter(Number.isFinite)

const serverPid = () => {
  const line = sh('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN']).split('\n').filter(Boolean).pop() || ''
  return line ? Number(line.trim().split(/\s+/)[1]) : null
}

const startedAt = (pid) => {
  const t = sh('ps', ['-o', 'lstart=', '-p', String(pid)])
  return t ? Date.parse(t.replace(/\s+/g, ' ')) : null
}

/** 从运行中的进程里捞 NOTEKIT_* 环境，重启时原样复现（正式实例通常为空） */
const envOf = (pid) => {
  const out = {}
  for (const tok of sh('ps', ['eww', '-p', String(pid)]).split(/\s+/)) {
    const m = /^(NOTEKIT_[A-Z_]+)=(.*)$/.exec(tok)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const portAlive = async () => {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/static/`, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

const inspect = async () => {
  const mains = mainPids()
  const srv = serverPid()
  let fileMtime = null
  try {
    fileMtime = statSync(SERVER_ROUTE).mtimeMs
  } catch {}
  const srvStart = srv ? startedAt(srv) : null
  return { mains, srv, srvStart, fileMtime, fresh: srvStart && fileMtime ? srvStart > fileMtime : null }
}

const describe = (label, s) => {
  if (s.mains.length === 0) {
    console.log(`${label} 主进程未运行（App 没在跑）`)
    return
  }
  console.log(`${label} 主进程 ${s.mains.join(',')} · 服务端 ${s.srv ?? '**已死**'}`)
  if (!s.srv) {
    // 这正是 18:41 那类半死状态：窗口还在、服务端点不着、单实例锁还在 → 新实例秒退
    console.log('        ⚠️ 端口无人监听但主进程活着 —— 半死状态（新开的实例会被单实例锁秒退），需要重启')
    return
  }
  console.log(`        服务端启动 ${s.srvStart ? new Date(s.srvStart).toLocaleTimeString('zh-CN') : '?'}`)
  if (s.fileMtime) {
    const fm = new Date(s.fileMtime).toLocaleTimeString('zh-CN')
    console.log(
      `        服务端代码文件改动 ${fm} → ` +
        (s.fresh === null ? '无法判断' : s.fresh ? '✅ 跑的是新代码' : '❌ 进程比文件旧，需要重启'),
    )
  }
}

const before = await inspect()
await describe('【重启前】', before)

if (CHECK_ONLY) process.exit(0)
if (before.mains.length === 0) {
  console.log('→ 没在跑，直接起')
} else {
  const mainPid = before.mains[0]
  const env = envOf(mainPid)

  console.log('→ 正常退出（AppleEvent quit，等 SQLite 队列排空）…')
  sh('osascript', ['-e', 'tell application id "com.local.evergreennote" to quit'])
  for (let i = 0; i < 20 && mainPids().length > 0; i++) await sleep(1000)

  if (mainPids().length > 0) {
    console.log('→ 20s 未退，发 SIGTERM')
    sh('kill', ['-TERM', String(mainPid)])
    for (let i = 0; i < 10 && mainPids().length > 0; i++) await sleep(1000)
  }
  if (mainPids().length > 0) {
    if (!ALLOW_FORCE) {
      console.error('✗ 仍存活，未强杀（正式应用不 SIGKILL）。手动退出后再跑，或加 --force。')
      process.exit(1)
    }
    console.log('→ 仍存活，--force：SIGKILL')
    for (const pid of mainPids()) sh('kill', ['-9', String(pid)])
    await sleep(2500)
  }
  if (mainPids().length > 0) {
    console.error(`✗ 进程仍在。手动命令：kill -9 ${mainPids().join(' ')}`)
    process.exit(1)
  }

  // 有 NOTEKIT_* 才走裸二进制（隔离/测试实例），否则 LaunchServices（干净、不带进我的进程组）
  if (Object.keys(env).length > 0) {
    console.log(`→ 带环境重启：${Object.keys(env).join(' ')}`)
    spawn(APP_BIN, [], { env: { ...process.env, ...env }, detached: true, stdio: 'ignore' }).unref()
  } else {
    console.log('→ LaunchServices 重启（open）')
    sh('open', [APP_BUNDLE])
  }
}

let up = false
for (let i = 0; i < 60; i++) {
  if (await portAlive()) {
    up = true
    break
  }
  await sleep(1000)
}
if (!up) {
  console.error(`✗ 重启后 ${PORT} 没起来。手动：open "${APP_BUNDLE}"`)
  process.exit(1)
}

const after = await inspect()
await describe('【重启后】', after)
console.log(after.fresh === false ? '⚠️ 服务端进程仍比代码文件旧 —— 包内文件可能没更新，先发布再重启。' : '✅ 完成。')
