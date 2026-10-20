/**
 * 站外链接 → 系统默认浏览器 的接缝实测（隔离实例，不动用户数据）
 *
 *   node tools/external-link-verify.mjs
 *
 * 背景（2026-10-20 用户报障）：AI 侧边栏回复里的外链点下去是在 App **当前窗口**里打开的 ——
 * 整个界面被那页网页顶掉，没有后退入口，只能重启 App。
 * 现在：渲染层拦截（Router.tsx）→ POST /api/open-external → 本地服务交系统浏览器。
 *
 * 覆盖：
 *   E1 点站外链接：窗口不导航（App 还在、location 不变、页面没重载）
 *   E2 该点击确实打到 /api/open-external，且带上原始 URL
 *   E3 站内同源链接不被误送去浏览器（不产生 open-external 请求）
 *   E4 跨源/无 Origin 直接调接口 → 403（网页不能借这个口子）
 *   E5 非浏览器协议（file:）→ 400
 *   E6 mailto: 放行（服务端接受，测试态不真的拉起邮件客户端）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'external-link-verify')
const sleeps = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => {
    s.once('error', rej)
    s.listen(0, '127.0.0.1', res)
  })
  const { port } = s.address()
  await new Promise((res, rej) => s.close((e) => (e ? rej(e) : res())))
  return port
}

const APP_PORT = await freePort()
const DEBUG_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    NOTEKIT_PORT: String(APP_PORT),
    NOTEKIT_USER_DATA: profile,
    // 不真的弹浏览器：只让服务端把「要打开什么」写进日志
    NOTEKIT_TEST_NO_OPEN: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const results = []
const failures = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}

let cdp = null
try {
  for (let i = 0; i < 120 && !cdp; i++) {
    try {
      cdp = await connect(DEBUG_PORT)
    } catch {
      await sleeps(500)
    }
  }
  if (!cdp) throw new Error(`CDP 连不上（端口 ${DEBUG_PORT}）`)

  const ev = (expression) => cdp.evaluate(expression)

  // 等应用挂载（水合完成）
  let ready = false
  for (let i = 0; i < 90; i++) {
    ready = await ev('!!window.__notekitApp').catch(() => false)
    if (ready) break
    await sleeps(500)
  }
  if (!ready) throw new Error('应用未就绪（window.__notekitApp 一直没出现）')
  await sleeps(500)

  const before = await ev('location.href')

  // E1 + E2：点一条站外链接。桩住 fetch 以便看清请求到底发没发、发了什么。
  await ev(`(() => {
    window.__nkOpened = []
    const of = window.fetch.bind(window)
    window.fetch = (input, init) => {
      try { window.__nkOpened.push({ url: String(input), body: String(init?.body ?? '') }) } catch {}
      return of(input, init)
    }
    if (!document.getElementById('nk-ext')) {
      const a = document.createElement('a')
      a.id = 'nk-ext'
      a.href = 'https://example.com/x?a=1'
      a.textContent = 'external'
      a.style.cssText = 'position:fixed;left:24px;top:24px;z-index:2147483647'
      document.body.appendChild(a)
    }
    // 存活标记：整页重载会把它抹掉
    window.__nkMarker = 'alive'
    document.getElementById('nk-ext').click()
    return true
  })()`)
  await sleeps(900)

  const after = await ev(`({ marker: window.__nkMarker, href: location.href, opened: window.__nkOpened, hasApp: !!window.__notekitApp })`)

  check('E1 点站外链接：窗口不导航、App 仍在', after.marker === 'alive' && after.hasApp && after.href === before, {
    marker: after.marker,
    hasApp: after.hasApp,
    before,
    after: after.href,
  })

  const hit = (after.opened || []).find((o) => o.url.includes('/api/open-external'))
  check(
    'E2 点击打到 /api/open-external 且带原始 URL',
    !!hit && hit.body.includes('https://example.com/x?a=1'),
    after.opened,
  )

  // E3：站内同源链接不该被送去浏览器
  await ev(`(() => {
    window.__nkOpened = []
    let a = document.getElementById('nk-int')
    if (!a) {
      a = document.createElement('a')
      a.id = 'nk-int'
      a.textContent = 'internal'
      a.style.cssText = 'position:fixed;left:24px;top:64px;z-index:2147483647'
      document.body.appendChild(a)
    }
    a.href = location.origin + '/static/'
    a.click()
    return true
  })()`)
  await sleeps(600)
  const internal = await ev(`({ opened: window.__nkOpened, marker: window.__nkMarker, hasApp: !!window.__notekitApp })`)
  check(
    'E3 站内链接不走 open-external',
    (internal.opened || []).length === 0 && internal.marker === 'alive' && internal.hasApp,
    internal,
  )

  // E4：不带 Origin 的直接调用（等价于跨站/本机其它进程）必须被拒
  const naked = await fetch(`http://127.0.0.1:${APP_PORT}/api/open-external`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/naked' }),
  }).then((r) => r.status).catch(() => 'error')
  check('E4 无 Origin 调用 → 403', naked === 403, { status: naked })

  // E5：非浏览器协议
  const badProto = await ev(`fetch('/api/open-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'file:///etc/passwd' }),
  }).then(r => r.status)`).catch((e) => String(e))
  check('E5 file: 协议被拒 → 400', badProto === 400, { status: badProto })

  // E6：mailto 放行
  const mail = await ev(`fetch('/api/open-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'mailto:a@b.com' }),
  }).then(r => r.status)`).catch((e) => String(e))
  check('E6 mailto 放行 → 200', mail === 200, { status: mail })

  const consoleErrors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => JSON.stringify(e.params).slice(0, 200))
  check('E7 页面无未捕获异常', consoleErrors.length === 0, consoleErrors.slice(0, 3))
} catch (e) {
  check('执行异常', false, String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e))
} finally {
  try {
    cdp?.close()
  } catch {}
  child.kill('SIGTERM')
  await sleeps(800)
  try {
    child.kill('SIGKILL')
  } catch {}
  await mkdir(outDir, { recursive: true })
  await writeFile(
    path.join(outDir, 'result.json'),
    JSON.stringify({ at: new Date().toISOString(), port: APP_PORT, results, failures }, null, 2),
  )
  console.log(failures.length === 0 ? `\n全部通过：${results.length}/${results.length}` : `\n失败：${failures.join('、')}`)
  process.exit(failures.length === 0 ? 0 : 1)
}
