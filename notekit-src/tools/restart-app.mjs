/**
 * 干净地重启正式 App（用户 2026-10-09 18:26 明确授权我自行重启）。
 *
 * 为什么需要它：App 的 live-update 只做 `webContents.reloadIgnoringCache()`，
 * **只换渲染层**。ACP 服务端是主进程 spawn 的子进程，`server/` 下任何改动
 * 都必须「退出 App 再打开」才生效（⌘R 不够）。没有这个脚本时，每次服务端改动
 * 都要请用户手动 ⌘Q，还会出现「渲染层新、服务端旧」的半新半旧状态。
 *
 * 用法：
 *   node tools/restart-app.mjs            # 重启
 *   node tools/restart-app.mjs --check    # 只看现状，不动
 *
 * 安全纪律（沿用仓库规矩：不强杀正式应用、退出前等保存队列排空）：
 *   ① 先走 AppleEvent quit —— 等同 ⌘Q，会触发 before-quit：flush SQLite → 备份 → kill 子进程
 *   ② 端口迟迟不放才 SIGTERM（再给 10s）
 *   ③ SIGKILL 是最后手段，会显式警告，且只在 --force 时才用
 *   ④ 重启用 LaunchServices（open），不带 shell 的进程组，避免被父 shell 带走
 */
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
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

const listener = () => {
  const out = sh('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN'])
  const line = out.split('\n').filter(Boolean).pop() || ''
  return line ? Number(line.trim().split(/\s+/)[1]) : null
}

/** 端口答不答得上来 */
const alive = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/static/`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

const parentOf = (pid) => Number(sh('ps', ['-o', 'ppid=', '-p', String(pid)])) || null
const startedAt = (pid) => {
  const t = sh('ps', ['-o', 'lstart=', '-p', String(pid)])
  return t ? Date.parse(t.replace(/\s+/g, ' ')) : null
}

/** 从运行中的进程里捞 NOTEKIT_* 环境，重启时原样复现（正式实例通常为空） */
const envOf = (pid) => {
  const raw = sh('ps', ['eww', '-p', String(pid)])
  const out = {}
  for (const tok of raw.split(/\s+/)) {
    const m = /^(NOTEKIT_[A-Z_]+)=(.*)$/.exec(tok)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const report = async (label) => {
  const serverPid = listener()
  if (!serverPid) {
    console.log(`${label} 端口 ${PORT} 无人监听（App 没在跑？）`)
    return null
  }
  const mainPid = parentOf(serverPid)
  const srvStart = startedAt(serverPid)
  let fileMtime = null
  try {
    fileMtime = statSync(SERVER_ROUTE).mtimeMs
  } catch {}
  const fresh = srvStart && fileMtime ? srvStart > fileMtime : null
  console.log(`${label} 主进程 ${mainPid} · 服务端 ${serverPid} · 启动 ${srvStart ? new Date(srvStart).toLocaleTimeString('zh-CN') : '?'}`)
  if (fileMtime) {
    console.log(
      `        服务端代码文件改动 ${new Date(fileMtime).toLocaleTimeString('zh-CN')} → ` +
        (fresh === null ? '无法判断' : fresh ? '✅ 跑的是新代码' : '❌ 进程比文件旧，需要重启'),
    )
  }
  return { mainPid, serverPid, srvStart, fileMtime, fresh }
}

const before = await report('【重启前】')
if (CHECK_ONLY || !before) process.exit(0)

const serverEnv = envOf(before.mainPid)

// ① AppleEvent quit（等同 ⌘Q，会走 before-quit 的 flush + 备份）
console.log('→ 正常退出（AppleEvent quit，等 SQLite 队列排空）…')
sh('osascript', ['-e', 'tell application id "com.local.evergreennote" to quit'])
for (let i = 0; i < 20 && (await alive()); i++) await sleep(1000)
if (await alive()) {
  // ② SIGTERM
  console.log('→ 20s 未退，发 SIGTERM')
  sh('kill', ['-TERM', String(before.mainPid)])
  for (let i = 0; i < 10 && (await alive()); i++) await sleep(1000)
}
if (await alive()) {
  if (!ALLOW_FORCE) {
    console.error('✗ 仍存活，未强杀（正式应用不 SIGKILL）。请手动退出后再跑。加 --force 可强制。')
    process.exit(1)
  }
  console.log('→ 仍存活，--force：SIGKILL')
  sh('kill', ['-9', String(before.mainPid), String(before.serverPid)])
  await sleep(2000)
}
if (await alive()) {
  console.error(`✗ 端口 ${PORT} 还被占着，重启中止。手动命令：open "${APP_BUNDLE}"`)
  process.exit(1)
}

// ③ 重启：有 NOTEKIT_* 才走裸二进制（那是隔离/测试实例），否则 LaunchServices（干净、不带进我的进程组）
if (Object.keys(serverEnv).length > 0) {
  console.log(`→ 带环境重启：${Object.keys(serverEnv).join(' ')}`)
  spawn(APP_BIN, [], { env: { ...process.env, ...serverEnv }, detached: true, stdio: 'ignore' }).unref()
} else {
  console.log('→ LaunchServices 重启（open）')
  sh('open', [APP_BUNDLE])
}

let up = false
for (let i = 0; i < 40; i++) {
  if (await alive()) {
    up = true
    break
  }
  await sleep(1000)
}
if (!up) {
  console.error(`✗ 重启后 ${PORT} 没起来。手动：open "${APP_BUNDLE}"`)
  process.exit(1)
}

const after = await report('【重启后】')
console.log(
  after?.fresh === false
    ? '⚠️ 新服务端进程仍比代码文件旧 —— 包内文件可能没更新，先跑发布再重启。'
    : '✅ 完成。服务端已加载最新代码。',
)
