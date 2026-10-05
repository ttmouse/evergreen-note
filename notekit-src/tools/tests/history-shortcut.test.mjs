import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { connect } from '../cdp-client.mjs'

/**
 * ⌘[ / ⌘] 历史前进后退（对应原版 hotkey.add("cmd+[:浏览器后退")）。
 *
 * 这条链路只有真按键才能验：快捷键同时存在「编辑器里的 hotkey.listen()」与「文档级
 * 监听」两条派发路径，用真实输入事件按键，断言每次按键恰好退/进一步（多一步就说明
 * 一次按键被处理了两遍）。需要先 `npm run build`。
 */
const root = fileURLToPath(new URL('../..', import.meta.url))
const sleeps = ms => new Promise(r => setTimeout(r, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitFor(fn, timeout, step = 500) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) return value
      last = value
    } catch (error) {
      last = error.message
    }
    await sleeps(step)
  }
  throw new Error(`等待超时：${JSON.stringify(last)}`)
}

test('⌘[ / ⌘] 在编辑器内外都恰好退进历史一步', { timeout: 180000 }, async () => {
  const bundle = (await readdir(path.join(root, 'dist', 'assets')).catch(() => []))
    .find(file => /^index-.*\.js$/.test(file))
  assert.ok(bundle, '缺少 dist 构建产物，请先执行 npm run build')

  const profile = path.join(root, 'tmp', 'history-shortcut-test', 'profile')
  await rm(profile, { recursive: true, force: true })
  await mkdir(profile, { recursive: true })

  const port = await freePort()
  const debugPort = await freePort()
  const child = spawn(
    path.join(root, 'node_modules', '.bin', 'electron'),
    ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`],
    {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(port), NOTEKIT_USER_DATA: profile },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let logs = ''
  child.stdout.on('data', data => { logs += data })
  child.stderr.on('data', data => { logs += data })

  let cdp = null
  try {
    cdp = await waitFor(async () => {
      try { return await connect(debugPort) } catch { return null }
    }, 60000).catch(() => { throw new Error(`应用未启动：\n${logs.slice(-2000)}`) })

    // 必须真的跑在这次构建上：端口被别的进程占用时会连到旧产物
    await waitFor(() => cdp.evaluate(`[...document.scripts].some(s => s.src.endsWith('/${bundle}'))`), 90000, 1000)
      .catch(() => { throw new Error(`页面加载的不是本次构建 ${bundle}，请确认端口未被占用：\n${logs.slice(-2000)}`) })
    await waitFor(() => cdp.evaluate(`!!document.querySelector('.editor-view [contenteditable="true"]')`), 60000, 1000)

    const commands = await cdp.evaluate(`Object.values(window.__notekitApp.addons.hotkey.commands)
      .filter(c => c.hotkey === 'mod+[' || c.hotkey === 'mod+]')
      .map(c => ({ id: c.id, hotkey: c.hotkey, context: c.context }))`)
    assert.deepEqual(
      commands.map(c => c.hotkey).sort(),
      ['mod+[', 'mod+]'],
      '⌘[ / ⌘] 必须注册进快捷键系统',
    )

    const press = async key => {
      const code = key === '[' ? 219 : 221
      const base = {
        modifiers: 4, // Meta
        key,
        code: key === '[' ? 'BracketLeft' : 'BracketRight',
        windowsVirtualKeyCode: code,
        nativeVirtualKeyCode: code,
      }
      await cdp.call('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' })
      await cdp.call('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
      await sleeps(600)
    }
    const currentPath = () => cdp.evaluate(`location.pathname`)

    const goto = async route => {
      await cdp.evaluate(`window.__notekitApp.addons.router.to('${route}')`)
      await sleeps(900)
      return currentPath()
    }

    const initialPath = await currentPath()
    const diariesPath = await goto('/diaries')
    const andyPath = await goto('/andyMode')

    await press('[')
    assert.equal(await currentPath(), diariesPath, '⌘[ 必须只退一步')
    await press(']')
    assert.equal(await currentPath(), andyPath, '⌘] 必须只前进一步')
    await press('[')
    assert.equal(await currentPath(), diariesPath)

    // 光标点进笔记里（编辑器路径），快捷键同样要生效
    const nodeText = await cdp.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.editor-view .node-text')]
      const el = nodes.find(el => { const r = el.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight - 20 && r.width > 20 && r.height > 5 })
      if (!el) return null
      el.setAttribute('data-history-shortcut-target', '1')
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2), text: el.innerText }
    })()`)
    assert.ok(nodeText, '页面里找不到可点击的笔记节点')
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.call('Input.dispatchMouseEvent', { type, x: nodeText.x, y: nodeText.y, button: 'left', clickCount: 1 })
    }
    await sleeps(500)
    assert.equal(
      await cdp.evaluate(`document.activeElement?.matches?.('.editor-view *') === true`),
      true,
      '光标没有落在笔记区域内，编辑器内路径无法验证',
    )

    // window 上的监听在上面两条之后才收到事件，据此看默认行为有没有被拦住
    await cdp.evaluate(`(() => {
      window.__keyLog = []
      window.addEventListener('keydown', event => window.__keyLog.push({ key: event.key, prevented: event.defaultPrevented }))
      return true
    })()`)
    await press('[')
    assert.equal(await currentPath(), initialPath, '光标在笔记里时 ⌘[ 也必须只退一步')
    assert.deepEqual(
      await cdp.evaluate(`window.__keyLog.at(-1)`),
      { key: '[', prevented: true },
      '⌘[ 的默认行为必须被拦住，不能漏进正文',
    )
    await press(']')
    assert.equal(await currentPath(), diariesPath, '光标在笔记里时 ⌘] 也必须只前进一步')

    // 同一次按键被两条路径各派发一遍时，也只能后退一步
    const dedupe = await cdp.evaluate(`(() => {
      const app = window.__notekitApp
      const router = app.addons.router
      let hits = 0
      const original = router.back.bind(router)
      router.back = () => { hits++; return original() }
      const event = new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft', metaKey: true, bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      const afterDocumentListener = hits
      app.addons.hotkey.listen({ app, event: { nativeEvent: event, key: '[', metaKey: true, preventDefault: () => {} } })
      const afterBoth = hits
      router.back = original
      return { afterDocumentListener, afterBoth }
    })()`)
    assert.deepEqual(dedupe, { afterDocumentListener: 1, afterBoth: 1 }, '同一次按键被处理了多次')
    await sleeps(900)
    assert.equal(await currentPath(), initialPath, '双路径派发后必须只退一步')

    const exceptions = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown')
    assert.equal(exceptions.length, 0, `运行时报错：${JSON.stringify(exceptions).slice(0, 500)}`)
  } finally {
    child.kill('SIGTERM')
    await sleeps(300)
  }
})

