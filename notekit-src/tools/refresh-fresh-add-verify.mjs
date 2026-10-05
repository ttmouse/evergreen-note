/**
 * OP-036: freshAdd itemChanged must not make Refresh read a missing old path.
 *
 * Usage:
 *   node tools/refresh-fresh-add-verify.mjs [output-json]
 *
 * The script launches an isolated Electron profile and saves a unique new
 * item. It fails if the old Refresh TypeError ("Cannot read properties of
 * undefined (reading 'length')") appears.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  )
  return port
}

const runId = new Date().toISOString().replace(/[:.]/g, '-')
const defaultOutDir = path.join(root, '..', 'test-runs', 'refresh-fresh-add-verify', runId)
const outputFile = process.argv[2] || path.join(defaultOutDir, 'result.json')
const profile = path.join(defaultOutDir, 'profile')
await mkdir(path.dirname(outputFile), { recursive: true })
await mkdir(profile, { recursive: true })

const appPort = await freePort()
const debugPort = await freePort()
const electronBin = path.join(
  root,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron'
)

const child = spawn(electronBin, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    NOTEKIT_PORT: String(appPort),
    NOTEKIT_USER_DATA: profile,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', chunk => { logs += chunk })
child.stderr.on('data', chunk => { logs += chunk })

let cdp = null
try {
  for (let i = 0; i < 120 && !cdp; i++) {
    try {
      cdp = await connect(debugPort)
    } catch {
      await sleep(500)
    }
  }
  if (!cdp) throw new Error('CDP not ready')

  for (let i = 0; i < 90; i++) {
    const ready = await cdp.evaluate(`(() => {
      const app = window.__notekitApp
      return !!app?.addons?.dbMemory?.initFinished &&
        app?.addons?.dbDisk?.storageMode === 'sqlite'
    })()`).catch(() => false)
    if (ready) break
    await sleep(1000)
  }

  const title = `OP036 freshAdd ${Date.now()}`
  const beforeEventCount = cdp.events.length
  const routeResult = await cdp.evaluate(`(async () => {
    try {
      const app = window.__notekitApp
      const ky = 'op036-' + Date.now().toString(36)
      const now = Date.now()
      const item = {
        ky,
        pky: '-',
        path: [],
        ori: ${JSON.stringify(title)},
        leaves: [{ text: ${JSON.stringify(title)} }],
        created: now,
        updated: 0,
        layout: '',
        weight: now
      }
      app.addons.dbMemory.saveItem(item)
      await new Promise(resolve => setTimeout(resolve, 1200))
      const saved = app.addons.dbMemory.getItem(ky)
      await app.addons.dbDisk.flush()
      const persisted = await app.addons.dbDisk.open(app.addons.libAdmin.current.ky).node.get(ky)
      return {
        title: ${JSON.stringify(title)},
        ky,
        savedKy: saved?.ky || null,
        persistedKy: persisted?.ky || null,
        itemCount: app.addons.dbMemory.list.length,
        storageMode: app.addons.dbDisk.storageMode,
      }
    } catch (error) {
      return {
        title: ${JSON.stringify(title)},
        error: String(error?.stack || error),
      }
    }
  })()`)
  await sleep(1200)

  const runtimeErrors = cdp.events
    .slice(beforeEventCount)
    .filter(event =>
      event.method === 'Runtime.exceptionThrown' ||
      (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
    )
    .map(event => JSON.stringify(event.params).slice(0, 1200))

  const originalTypeErrors = runtimeErrors.filter(error =>
    error.includes('Cannot read properties of undefined') &&
    error.includes('length')
  )
  const result = {
    ok: originalTypeErrors.length === 0 && !!routeResult.savedKy && !!routeResult.persistedKy,
    profile,
    appPort,
    debugPort,
    routeResult,
    runtimeErrorCount: runtimeErrors.length,
    originalTypeErrors,
    runtimeErrors,
    logTail: logs.slice(-2000),
  }
  await writeFile(outputFile, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
} finally {
  try {
    await cdp?.evaluate('window.close(); true')
  } catch {}
  cdp?.close()
  child.kill('SIGTERM')
  await sleep(1000)
  if (child.exitCode === null) {
    try { child.kill('SIGKILL') } catch {}
  }
}
