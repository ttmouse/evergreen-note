import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import net from 'node:net'

const children = new Set()
let stopping = false
let vitePort
let apiPort

async function reservePort(host) {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function isPortListening(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect(port, host)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  children.add(child)
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (child === viteProcess && !stopping) {
      console.error(`[dev:desktop] Vite 已退出。请确认 localhost:${vitePort} 未被其他服务占用。`)
      stop(1)
      return
    }
    if (!stopping) stop(code ?? (signal ? 1 : 0))
  })
  return child
}

let viteProcess = null

async function waitForVite(child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Vite 已退出，无法启动桌面窗口')
    const ready = await new Promise((resolve) => {
      const socket = net.connect(vitePort, 'localhost')
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
    })
    if (ready) return
    await delay(250)
  }
  throw new Error(`等待 Vite 在 localhost:${vitePort} 就绪超时`)
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 100).unref()
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

try {
  vitePort = Number(process.env.NOTEKIT_DEV_PORT) || await reservePort('localhost')
  const reuseServer = !process.env.NOTEKIT_API_PORT && await isPortListening(11820, '127.0.0.1')
  apiPort = Number(process.env.NOTEKIT_API_PORT) || (reuseServer ? 11820 : await reservePort('127.0.0.1'))
  viteProcess = start('pnpm', ['exec', 'vite', '--host', 'localhost', '--strictPort'], {
    NOTEKIT_DEV_PORT: String(vitePort),
    NOTEKIT_PORT: String(apiPort),
    VITE_NOTEKIT_ASSET_PORT: String(apiPort),
  })
  await waitForVite(viteProcess)
  start('pnpm', ['exec', 'electron', 'desktop/main.cjs'], {
    NOTEKIT_START_URL: `http://localhost:${vitePort}/static/`,
    NOTEKIT_PORT: String(apiPort),
    PORT: String(apiPort),
    NOTEKIT_DEV_PORT: String(vitePort),
    VITE_NOTEKIT_ASSET_PORT: String(apiPort),
    NOTEKIT_DEV_MODE: '1',
    NOTEKIT_REUSE_SERVER: reuseServer ? '1' : '0',
  })
} catch (error) {
  console.error(`[dev:desktop] ${error.message}`)
  stop(1)
}
