/**
 * D125F26FCF5E-22「AI 的侧边栏：顶部绿点 + 最右侧收起图标多余」验收（隔离实例，不动用户数据）
 *
 * 用法：先 pnpm build，再 node tools/ai-panel-header-verify.mjs [--label before|after]
 * 输出：test-runs/ai-panel-header-verify/*.png + result.json
 *
 * 覆盖：
 *   S1 应用就绪并打开 AI 面板（$.aiPanel.open()）
 *   S2 header 内不再有状态色点（6px 圆形、圆角 50% 的实心 span）
 *   S3 header 按钮集合收敛为「历史会话 / 新对话」，不再有「收起面板」（最右侧箭头图标）
 *   S4 「收起/展开 AI 面板」的能力仍在别处：addon 的全局热键命令 mod+shift+9 存在，
 *      且 $.aiPanel.toggle() 能真实开合（open 状态随之变化）
 *   S5 无回归：header 仍是可拖窗的 drag 横带，header 里的按钮是 no-drag
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const labelArg = process.argv.indexOf('--label')
const label = labelArg > -1 ? process.argv[labelArg + 1] : 'run'
const outDir = path.join(root, '..', 'test-runs', 'ai-panel-header-verify', label)
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res) => s.close(res))
  return port
}

async function openWs(wsUrl) {
  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = (e) => {
    const message = JSON.parse(e.data)
    if (message.id && pending.has(message.id)) {
      const p = pending.get(message.id)
      pending.delete(message.id)
      message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result)
    }
  }
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id
    pending.set(key, { resolve, reject })
    socket.send(JSON.stringify({ id: key, method, params }))
  })
  await call('Runtime.enable')
  await call('Page.enable')
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 120000 })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { call, evaluate, close: () => socket.close() }
}

const APP_PORT = await freePort()
const DEBUG_PORT = await freePort()
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', (d) => { logs += d })
child.stderr.on('data', (d) => { logs += d })

const results = []
const failures = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}

const shot = async (cdp, name, clip) => {
  const img = await cdp.call('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' })
  await writeFile(path.join(outDir, name), Buffer.from(img.data, 'base64'))
  console.log(`   ↳ 截图 ${name}`)
}

// header = 面板根 div 里紧跟 <style> 的那个兄弟 div（与 CSS/既有脚本同一判据）
const HEADER_SEL = `.ai-panel-area > div > style + div`

let main = null
try {
  let target = null
  for (let i = 0; i < 240 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      target = (await res.json()).find((t) => t.type === 'page' && !t.url.startsWith('devtools:') && !t.url.includes('pop='))
    } catch {}
    if (!target) await sleep(500)
  }
  if (!target) throw new Error('找不到主窗口 CDP 目标，日志尾部：' + logs.slice(-1200))
  main = await openWs(target.webSocketDebuggerUrl)

  // S1 应用就绪 + 打开面板
  let ready = null
  for (let i = 0; i < 240; i++) {
    ready = await main.evaluate(`(() => {
      const $ = window.__notekitApp?.addons
      return { db: !!$?.dbMemory?.initFinished, panel: !!$?.aiPanel }
    })()`).catch(() => null)
    if (ready?.db && ready?.panel) break
    await sleep(500)
  }
  if (!ready?.db || !ready?.panel) throw new Error('应用未就绪，日志尾部：' + logs.slice(-1200))
  await main.evaluate(`window.__notekitApp.addons.aiPanel.open(); true`)
  await sleep(800)
  check('S1 应用就绪且 AI 面板已打开', true, ready)

  // S2 header 里没有状态色点
  const headerProbe = await main.evaluate(`(() => {
    const head = document.querySelector('${HEADER_SEL}')
    if (!head) return { err: 'header not found' }
    const r = head.getBoundingClientRect()
    const dots = [...head.querySelectorAll('span')].map((el) => {
      const cs = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return {
        w: Math.round(b.width), h: Math.round(b.height),
        radius: cs.borderRadius, bg: cs.backgroundColor,
        text: (el.textContent || '').slice(0, 12),
      }
    }).filter((d) => d.radius === '50%' || (d.w <= 8 && d.h <= 8 && d.bg !== 'rgba(0, 0, 0, 0)'))
    const buttons = [...head.querySelectorAll('button')].map((b) => ({
      label: b.getAttribute('aria-label') || b.title || '',
      icon: b.querySelector('svg')?.getAttribute('data-icon') || b.querySelector('svg')?.id || '',
      region: (() => { const c = getComputedStyle(b); return c.webkitAppRegion || c.getPropertyValue('-webkit-app-region') })(),
    }))
    const cs = getComputedStyle(head)
    return {
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      region: cs.webkitAppRegion || cs.getPropertyValue('-webkit-app-region'),
      dots,
      buttons,
      svgCount: head.querySelectorAll('svg').length,
    }
  })()`)
  if (headerProbe.err) throw new Error('探针失败：' + headerProbe.err)
  check('S2 header 内已无状态色点（6px 圆点）', headerProbe.dots.length === 0, headerProbe.dots)

  // S3 按钮收敛为两个，且不再有「收起面板」
  const labels = headerProbe.buttons.map((b) => b.label)
  check('S3 header 按钮只剩「历史会话 / 新对话」', labels.length === 2 && labels.includes('历史会话') && labels.includes('新对话'), labels)
  check('S3b header 内不再有「收起面板」按钮', !labels.some((l) => l.includes('收起')), labels)

  // S4 收面板能力仍在别处（热键命令 + toggle API）
  const ability = await main.evaluate(`(async () => {
    const $ = window.__notekitApp.addons
    const cmds = $?.aiPanel?.addonCommands?.() || {}
    const before = $.aiPanel.isOpen()
    $.aiPanel.toggle(); await new Promise((r) => setTimeout(r, 200))
    const afterClose = $.aiPanel.isOpen()
    $.aiPanel.toggle(); await new Promise((r) => setTimeout(r, 200))
    const afterOpen = $.aiPanel.isOpen()
    // 右上角工具条入口：注册在 $.main.extraCommands 里（MainComp 渲染它）
    const extra = Object.keys($?.main?.extraCommands || {})
    const toolbarEntry = $?.main?.extraCommands?.aiPanel || null
    return {
      hotkey: cmds?.aiPanel?.hotkey || null,
      title: cmds?.aiPanel?.title || null,
      before, afterClose, afterOpen,
      extra,
      toolbarEntry: toolbarEntry ? { title: toolbarEntry.title, icon: toolbarEntry.icon } : null,
    }
  })()`)
  check('S4 面板仍可关闭/重开（热键命令存在 + toggle 生效）',
    ability?.hotkey === 'mod+shift+9' && ability.before === true && ability.afterClose === false && ability.afterOpen === true,
    ability)
  check('S4b 右上角工具条仍有 AI 入口（同一个 toggle 动作的正式入口）',
    ability?.toolbarEntry?.icon === 'svg_ai' && String(ability?.toolbarEntry?.title || '').includes('AI'), ability)

  // S5 无回归：header 仍是 drag 横带、按钮与色点区域 no-drag
  check('S5 header 仍是 drag 横带（D125F26FCF5E-21 不回归）', headerProbe.region === 'drag', headerProbe.region)
  check('S5b header 内按钮全部 no-drag', headerProbe.buttons.every((b) => b.region === 'no-drag'), headerProbe.buttons)

  await shot(main, `${label}-panel.png`)
  const [x, y, w, h] = headerProbe.rect
  await shot(main, `${label}-header.png`, { x, y: Math.max(0, y - 6), width: w, height: h + 12, scale: 2 })
} finally {
  try { main?.close() } catch {}
  child.kill()
  await sleep(500)
  try { child.kill('SIGKILL') } catch {}
}

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ label, results, failures, headerProbe: null }, null, 2))
console.log(failures.length ? `\n❌ ${failures.length} 项失败：${failures.join(', ')}` : '\n✅ 全部通过')
process.exit(failures.length ? 1 : 0)
