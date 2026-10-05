import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { connect } from '../cdp-client.mjs'

/**
 * 快捷键派发的两条硬规则（都是实测踩出来的）：
 *
 * 1. 点进笔记、还没打字时，Slate 的 selection 是 null；编辑器类快捷键不能因此整条失效
 *    （修复前：⌘B 之类在「点进笔记后」一次都不派发，必须打一个字才恢复）。
 * 2. 同一次按键会被「编辑器路径」与「文档级监听」各派发一遍，`everywhere` 类命令不能
 *    执行两次（修复前：⌘P/⌘W/⌘[ 在光标位于笔记内时会执行两遍）。
 *
 * 需要先 `npm run build`；用隔离实例，不碰用户数据。
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

/** 起一个隔离实例，装上「记录调用了哪些命令」的探针（探针不改命令行为） */
async function withApp(run) {
  const bundle = (await readdir(path.join(root, 'dist', 'assets')).catch(() => []))
    .find(file => /^index-.*\.js$/.test(file))
  assert.ok(bundle, '缺少 dist 构建产物，请先执行 npm run build')

  const profile = path.join(root, 'tmp', 'hotkey-dispatch-test', 'profile')
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
    }, 60000).catch(() => { throw new Error(`应用未启动：\n${logs.slice(-1500)}`) })
    await waitFor(() => cdp.evaluate(`[...document.scripts].some(s => s.src.endsWith('/${bundle}'))`), 90000, 1000)
      .catch(() => { throw new Error(`页面加载的不是本次构建 ${bundle}`) })
    await waitFor(() => cdp.evaluate(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`), 60000, 1000)

    // 记录派发（真的执行，只是计数），并同时调用原实现
    await cdp.evaluate(`(() => {
      const app = window.__notekitApp
      const hk = app.addons.hotkey
      window.__called = []
      const original = app.execCommand.bind(app)
      app.execCommand = (cmd, params) => {
        const key = Object.keys(hk.commands).find(k => hk.commands[k] === cmd)
        window.__called.push(key ?? cmd?.id ?? '(未知)')
        return original(cmd, params)
      }
      // 走 React fiber 拿到当前编辑器实例（测试里要断言它的 selection / value）
      window.__slateEditor = () => {
        const el = document.querySelector('.editor-view.editor-from-router [data-slate-editor]')
        if (!el) return null
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
        let fiber = el[fiberKey], editor = null, depth = 0
        while (fiber && depth++ < 60) {
          const props = fiber.memoizedProps
          if (props?.editor?.children) { editor = props.editor; break }
          fiber = fiber.return
        }
        return editor
      }
      return true
    })()`)

    const press = async key => {
      const code = key === '[' ? 219 : 221
      const base = {
        modifiers: 4,
        key,
        code: key === '[' ? 'BracketLeft' : 'BracketRight',
        windowsVirtualKeyCode: code,
        nativeVirtualKeyCode: code,
      }
      await cdp.call('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' })
      await cdp.call('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
      await sleeps(600)
    }

    const clickIntoNote = async () => {
      const point = await cdp.evaluate(`(() => {
        const el = document.querySelector('.editor-view.editor-from-router .node-text')
        if (!el) return null
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        for (let dx = 2; dx < Math.min(r.width, 200); dx += 2) {
          const range = document.caretRangeFromPoint(r.left + dx, r.top + r.height / 2)
          if (range && range.startContainer?.nodeType === 3 && el.contains(range.startContainer)) {
            return { x: Math.round(r.left + dx), y: Math.round(r.top + r.height / 2), text: el.innerText }
          }
        }
        return null
      })()`)
      assert.ok(point, '找不到可点击的笔记正文')
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.call('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
      }
      await sleeps(400)
      assert.equal(
        await cdp.evaluate(`document.activeElement?.isContentEditable === true`),
        true,
        '点击后光标没有落进编辑器',
      )
      return point
    }

    await run({ cdp, press, clickIntoNote })
  } finally {
    child.kill('SIGTERM')
    await sleeps(300)
  }
}

test('点进笔记（不打字）后编辑器类快捷键依然生效', { timeout: 180000 }, async () => {
  await withApp(async ({ cdp, press, clickIntoNote }) => {
    // Strmap 会包装编辑器的 onKeyDown，它在 selection 为 null 时曾直接抛错，
    // 把整条按键链掐断（快捷键派发就在链子后面），所以「点进笔记、一个字没打」
    // 这段时间里编辑器类快捷键一次都不派发。
    await clickIntoNote()
    await cdp.evaluate(`window.__called = []`)
    await press('b')
    assert.equal(
      await cdp.evaluate(`window.__called.filter(id => id === 'marks.bold').length`),
      1,
      '点进笔记后 ⌘B 必须恰好派发一次',
    )

    // 「按键到达时 Slate 还没有选区」也要能工作（deselect 造出这个状态）
    const deselected = await cdp.evaluate(`(() => {
      const editor = window.__slateEditor()
      if (!editor || !editor.selection) return 'no-selection-to-drop'
      editor.selection = null
      return editor.selection === null
    })()`)
    assert.equal(deselected, true, '没能造出「Slate 无选区」的状态')
    await cdp.evaluate(`window.__called = []`)
    await press('u')
    assert.equal(
      await cdp.evaluate(`window.__called.filter(id => id === 'marks.underline').length`),
      1,
      'Slate 没有选区时 ⌘U 也必须派发一次（用浏览器里的光标把选区补回来）',
    )
  })
})

test('选中文字后 ⌘B 真的加粗（mark 生效）', { timeout: 180000 }, async () => {
  await withApp(async ({ cdp, press, clickIntoNote }) => {
    await clickIntoNote()
    const span = await cdp.evaluate(`(() => {
      const el = document.querySelector('.editor-view.editor-from-router .node-text')
      const r = el.getBoundingClientRect()
      const usable = dx => {
        const range = document.caretRangeFromPoint(r.left + dx, r.top + r.height / 2)
        return range && range.startContainer?.nodeType === 3 && el.contains(range.startContainer) ? r.left + dx : null
      }
      let first = null, last = null
      for (let dx = 2; dx < Math.min(r.width, 200); dx++) { const x = usable(dx); if (x !== null) { if (first === null) first = x; last = x } }
      return first === null ? null : { first: Math.round(first), last: Math.round(last), y: Math.round(r.top + r.height / 2) }
    })()`)
    assert.ok(span, '找不到可拖选的正文字符')
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: span.first, y: span.y, button: 'left', clickCount: 1 })
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round((span.first + span.last) / 2), y: span.y, button: 'left', buttons: 1 })
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: span.last, y: span.y, button: 'left', buttons: 1 })
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: span.last, y: span.y, button: 'left', clickCount: 1 })
    await sleeps(400)
    const selection = await cdp.evaluate(`(() => {
      const editor = window.__slateEditor()
      if (!editor?.selection) return null
      const { anchor, focus } = editor.selection
      return { collapsed: anchor.offset === focus.offset && JSON.stringify(anchor.path) === JSON.stringify(focus.path) }
    })()`)
    assert.ok(selection, '拖选后 Slate 里应有选区')
    assert.equal(selection.collapsed, false, '拖选后应是非折叠选区（否则加粗无从生效）')

    await cdp.evaluate(`window.__called = []`)
    await press('b')
    assert.equal(
      await cdp.evaluate(`window.__called.filter(id => id === 'marks.bold').length`),
      1,
      '选中文字后 ⌘B 必须恰好派发一次',
    )
    assert.equal(
      await cdp.evaluate(`!!document.querySelector('.editor-view.editor-from-router [data-mark-bold]')`),
      true,
      '⌘B 必须真的给选中的文字加粗',
    )
  })
})

test('同一次按键只执行一次（⌘P 不会开两遍）', { timeout: 180000 }, async () => {
  await withApp(async ({ cdp, press, clickIntoNote }) => {
    await clickIntoNote()
    // 打一个字再删掉，让 Slate 建立起自己的选区：此时编辑器路径与文档级监听都会跑
    await cdp.call('Input.insertText', { text: 'x' })
    await sleeps(300)
    await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 0, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 0, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
    await sleeps(400)
    assert.equal(await cdp.evaluate(`window.__notekitApp.addons.hotkey.isDispatched({}) === false`), true)

    await cdp.evaluate(`window.__called = []`)
    const dialogsBefore = await cdp.evaluate(`document.querySelectorAll('.nui-dialog').length`)
    await press('p')
    const called = await cdp.evaluate(`window.__called.filter(id => id === 'app.floatSearch').length`)
    assert.equal(called, 1, '⌘P 必须恰好执行一次')
    assert.ok(
      await cdp.evaluate(`document.querySelectorAll('.nui-dialog').length`) >= dialogsBefore,
      '搜索面板的显示状态不该被回滚',
    )
  })
})