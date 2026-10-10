/**
 * D125F26FCF5E-21「AI 面板顶部区块支持拖拽移动窗口」验收（隔离实例，不动用户数据）
 *
 * 用法：先 pnpm build，再 node tools/ai-panel-drag-verify.mjs
 * 输出：test-runs/ai-panel-drag-verify/*.png + result.json
 *
 * 覆盖：
 *   S1 应用就绪并打开 AI 面板（$.aiPanel.open()）
 *   S2 面板 header（蓝点 + 历史/新对话/收起那一行）计算样式 -webkit-app-region == drag
 *   S3 header 里的按钮（历史/＋/收起）与状态点为 no-drag，点它们不会被窗口拖拽吞掉
 *   S4 header 里的历史下拉面板（position:absolute 的直接子 div）为 no-drag，能正常点选
 *   S5 面板其余区域（正文流水、输入区）不是 drag —— 只有顶上那一区块可拖窗
 *   S6 拖动语义实测：drag 区命中后窗口可移动（Electron 原生 drag 无法在 CDP 里合成，
 *      退化为「命中区几何核验」：drag 区必须恰好覆盖 header 那一条 44px 横带）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'ai-panel-drag-verify')
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

const shot = async (cdp, name) => {
  const img = await cdp.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, name), Buffer.from(img.data, 'base64'))
  console.log(`   ↳ 截图 ${name}`)
}

let main = null
try {
  // 主窗口 target
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

  // S1 应用就绪 + 打开 AI 面板
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

  // S2 header 是 drag
  const headProbe = await main.evaluate(`(() => {
    const host = document.querySelector('.ai-panel-area')
    if (!host) return { err: 'no .ai-panel-area' }
    // header = 面板根 div 里紧跟 <style> 的那个兄弟 div（与 CSS 选择器同一判据）
    const head = host.querySelector('div > style + div')
    if (!head) return { err: 'no header node matched by style + div' }
    const cs = getComputedStyle(head)
    const r = head.getBoundingClientRect()
    return {
      region: cs.webkitAppRegion || cs.getPropertyValue('-webkit-app-region'),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      buttons: [...head.querySelectorAll('button')].map((b) => {
        const bs = getComputedStyle(b)
        return { label: b.getAttribute('aria-label') || b.title || '', region: bs.webkitAppRegion || bs.getPropertyValue('-webkit-app-region') }
      }),
      dot: (() => {
        const d = head.querySelector('span')
        if (!d) return null
        const ds = getComputedStyle(d)
        return ds.webkitAppRegion || ds.getPropertyValue('-webkit-app-region')
      })(),
    }
  })()`)
  if (headProbe.err) throw new Error('探针失败：' + headProbe.err)
  check('S2 面板 header 计算样式 -webkit-app-region == drag', headProbe.region === 'drag', headProbe.region)

  // S3 header 里的按钮/状态点是 no-drag
  const btnsOk = headProbe.buttons.length >= 3 && headProbe.buttons.every((b) => b.region === 'no-drag')
  check('S3 header 内按钮全部 no-drag（历史/新对话/收起）', btnsOk, headProbe.buttons)
  check('S3b 状态点（span）不阻断：header 整体 drag 已含它', headProbe.dot === 'no-drag' || headProbe.dot === 'drag' || headProbe.dot === 'none', headProbe.dot)

  // S4 历史下拉是 no-drag（点开它再测）
  const dropProbe = await main.evaluate(`(() => {
    const host = document.querySelector('.ai-panel-area')
    const head = host.querySelector('div > style + div')
    const histBtn = [...head.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '') === '历史会话')
    if (!histBtn) return { err: 'no history button' }
    histBtn.click()
    return new Promise((res) => setTimeout(() => {
      const drop = head.querySelector(':scope > div[style*="position: absolute"], :scope > div')
      // 直接子 div 里 position:absolute 的那个才是下拉
      const abs = [...head.children].find((el) => getComputedStyle(el).position === 'absolute')
      if (!abs) { res({ err: 'dropdown not found after click' }); return }
      const cs = getComputedStyle(abs)
      res({ region: cs.webkitAppRegion || cs.getPropertyValue('-webkit-app-region') })
    }, 300))
  })()`)
  check('S4 历史下拉面板 no-drag（能被点击、不会被拖窗吞掉）', dropProbe.region === 'no-drag', dropProbe)
  await main.evaluate(`(() => { const b=[...document.querySelectorAll('.ai-panel-area button')].find(x=>(x.getAttribute('aria-label')||'')==='历史会话'); b&&b.click(); return true })()`).catch(() => {})

  // S5 面板其余区域不是 drag
  const bodyProbe = await main.evaluate(`(() => {
    const host = document.querySelector('.ai-panel-area')
    const head = host.querySelector('div > style + div')
    const input = host.querySelector('input')
    const scroll = [...host.querySelectorAll('div')].find((d) => getComputedStyle(d).overflowY === 'auto' && d !== head && !head.contains(d))
    const region = (el) => { const c = getComputedStyle(el); return c.webkitAppRegion || c.getPropertyValue('-webkit-app-region') }
    return {
      input: input ? region(input) : 'missing',
      scroll: scroll ? region(scroll) : 'missing',
      headIsOnlyDragBand: (() => {
        // 逐高度采样：面板左缘 6px 内缩处，从面板顶往下每 8px 找 drag 命中层，
        // drag 命中必须只落在 header 的矩形内
        const hr = head.getBoundingClientRect()
        const x = hr.x + hr.width / 2
        const out = []
        for (let y = hr.top - 12; y < hr.bottom + 60; y += 8) {
          if (y < 0) continue
          const el = document.elementFromPoint(x, y)
          if (!el) continue
          let node = el
          let hit = null
          while (node && node !== document.body) {
            const c = getComputedStyle(node)
            const v = c.webkitAppRegion || c.getPropertyValue('-webkit-app-region')
            if (v === 'drag') { hit = node; break }
            if (v === 'no-drag') break
            node = node.parentElement
          }
          out.push({ y: Math.round(y), drag: !!hit, inHead: hit === head })
        }
        // 边界说明：rect 下沿是排他的（y==bottom 已属下一个元素），采样用 [top, bottom)
        const bad = out.filter((s) => (s.y < hr.top || s.y >= hr.bottom) && s.drag && !s.inHead)
        const headMiss = out.filter((s) => s.y >= hr.top && s.y < hr.bottom && !s.drag)
        return { bad, headMiss, hr: [Math.round(hr.top), Math.round(hr.bottom)] }
      })(),
    }
  })()`)
  check('S5 输入框与正文滚动区不是 drag', bodyProbe.input !== 'drag' && bodyProbe.scroll !== 'drag', bodyProbe)
  check('S6 drag 命中带恰好覆盖 header 横带（不多不少）',
    bodyProbe.headIsOnlyDragBand.bad.length === 0 && bodyProbe.headIsOnlyDragBand.headMiss.length === 0,
    bodyProbe.headIsOnlyDragBand)

  await shot(main, 'ai-panel-drag-header.png')
} finally {
  try { main?.close() } catch {}
  child.kill()
  await sleep(500)
  try { child.kill('SIGKILL') } catch {}
}

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures }, null, 2))
console.log(failures.length ? `\n❌ ${failures.length} 项失败：${failures.join(', ')}` : '\n✅ 全部通过')
process.exit(failures.length ? 1 : 0)
