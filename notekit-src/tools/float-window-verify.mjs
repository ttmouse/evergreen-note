/**
 * 「浮层 → 独立窗口」验收（隔离实例，不动用户数据）
 *
 * 用法：先 pnpm build，再 node tools/float-window-verify.mjs
 * 输出：test-runs/float-window-verify/*.png + result.json
 *
 * 覆盖：
 *   S0 应用就绪，拿到当前笔记 ky
 *   S1 浮层卡片标题栏出现「↗ 弹出为独立窗口」按钮（.nk-popout-btn）
 *   S2 点它 → 主进程开出第二个原生窗口（CDP 出现 ?pop=<ky> 的 page target）
 *   S3 新窗口里 body.nk-float-window 生效、主界面 .app-root-node 收起、
 *      浮层卡片铺满窗口、正文渲染出来、窗口标题=笔记标题
 *   S4 同一 ky 再点一次不新增窗口（去重）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'float-window-verify')
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

async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`)
  return res.json()
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

/** 等到出现满足条件的 CDP page target（浮窗是另一个 target，必须按 URL 挑） */
async function connectTarget(port, predicate, label, tries = 240) {
  for (let i = 0; i < tries; i++) {
    try {
      const target = (await listTargets(port)).find((t) => t.type === 'page' && !t.url.startsWith('devtools:') && predicate(t))
      if (target) return openWs(target.webSocketDebuggerUrl)
    } catch {}
    await sleep(500)
  }
  throw new Error(`找不到 CDP 目标：${label}`)
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

/** 页面侧探针：卡片节点数 vs 真正可见的卡片数（关闭后可能残留零高占位节点）*/
const CARD_PROBE = `(() => {
  const cards = [...document.querySelectorAll('.nui-dialog.dialog-float-viewer')]
  const ids = cards.map((el) => el.id)
  const visible = cards.filter((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.height > 1 && r.width > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'
  })
  return {
    count: cards.length,
    ids,
    visible: visible.length,
    sizes: cards.map((el) => {
      const r = el.getBoundingClientRect()
      return [Math.round(r.width), Math.round(r.height)]
    }),
  }
})()`

const clickAt = async (cdp, box) => {
  if (!box) throw new Error('点不到坐标：目标元素不存在或不可见')
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.call('Input.dispatchMouseEvent', { type, x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 })
  }
  return box
}

const clickSelector = async (cdp, selector) => {
  const box = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (!box) throw new Error(`点不到元素：${selector}`)
  return clickAt(cdp, box)
}

/**
 * 搜索面板里定位「真笔记」那一行。不靠文案（界面语言可能是中文也可能是英文），
 * 而按结构区分：真笔记行的正文以自己的标题开头；列表首位的「创建主题」动作行
 * 是「动作文案 + 关键词」，以关键词开头却不以关键词结尾于行首——所以用
 * startsWith(标题) 判定笔记行，其余含关键词的行即动作行。
 */
const NOTE_ROW_FINDER = (titlePart) => `(() => {
  const rows = [...document.querySelectorAll('.search-result-item')]
  const text = (el) => (el.textContent || '').trim()
  return rows.find((el) => text(el).startsWith(${JSON.stringify(titlePart)}))
})()`

/** 搜索面板里找到那行笔记，返回行内某个入口图标的中心坐标 */
const rowIconCenter = (cdp, titlePart, cls) =>
  cdp.evaluate(`(() => {
    const row = ${NOTE_ROW_FINDER(titlePart)}
    if (!row) return null
    const el = row.querySelector(${JSON.stringify(cls)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) }
  })()`)

/** 搜索面板里那行笔记标题区（避开右侧图标）的中心坐标——用于回归「点行本体走原逻辑」 */
const rowBodyCenter = (cdp, titlePart) =>
  cdp.evaluate(`(() => {
    const row = ${NOTE_ROW_FINDER(titlePart)}
    if (!row) return null
    const head = row.querySelector('.node-head') || row
    const r = head.getBoundingClientRect()
    return { x: r.x + 40, y: r.y + r.height / 2 }
  })()`)

let main = null
let pop = null
try {
  main = await connectTarget(DEBUG_PORT, (t) => !t.url.includes('pop='), '主窗口')
  // 应用就绪：知识库加载完成且正文编辑器已挂载
  let ready = null
  for (let i = 0; i < 240; i++) {
    ready = await main.evaluate(`(() => {
      const $ = window.__notekitApp?.addons
      return {
        db: !!$?.dbMemory?.initFinished,
        editor: !!document.querySelector('.item-editor[contenteditable=true]'),
        ky: $?.main?.workspaceActiveKey || '',
      }
    })()`).catch(() => null)
    if (ready?.db && ready?.editor) break
    await sleep(500)
  }
  if (!ready?.db || !ready?.editor) throw new Error('应用未就绪，日志尾部：' + logs.slice(-1200))

  // 空白库里工作区落在虚拟页（diaries）上，它没有可被第二个窗口读到的 ky。
  // 用应用自己的 createTopic 建一篇真主题，并 flush 落库——独立窗口是另一个
  // renderer，只能看到服务端 SQLite 里的数据，草稿/未落库的节点它读不到。
  const ky = await main.evaluate(`(() => {
    const $ = window.__notekitApp.addons
    const topic = $.topic.createTopic('独立窗口验收笔记 ' + Date.now())
    return topic?.ky || ''
  })()`)
  await main.evaluate(`window.__notekitApp.addons.dbDisk.flush()`)
  check('S0 应用就绪并建好验收笔记（已落库）', !!ky, { ky })
  if (!ky) throw new Error('没能建出验收笔记')

  // ── S1 浮层卡片带「↗」按钮 ─────────────────────────────────────────────
  await main.evaluate(`window.__notekitApp.addons.floatViewer.show({ item: ${JSON.stringify(ky)}, isPin: true })`)
  let btn = null
  for (let i = 0; i < 60; i++) {
    btn = await main.evaluate(`(() => {
      const el = document.querySelector('.nk-popout-btn')
      const dlg = document.querySelector('.nui-dialog.dialog-float-viewer')
      return el && dlg ? { btn: !!el, dlg: true } : null
    })()`).catch(() => null)
    if (btn) break
    await sleep(300)
  }
  check('S1 浮层卡片标题栏出现「弹出为独立窗口」按钮', !!btn, btn)
  await shot(main, '01-float-layer-main-window.png')
  // 标题栏局部放大图（CDP clip 直接抓，不靠事后裁剪坐标猜位置），
  // 证据图里用它把 ↗ 摆到用户眼前。
  const headClip = await main.evaluate(`(() => {
    const head = document.querySelector('.nui-dialog.dialog-float-viewer .nui-dialog-head')
    if (!head) return null
    const r = head.getBoundingClientRect()
    return { x: Math.max(0, r.x - 210), y: Math.max(0, r.y - 6), width: r.width + 220, height: r.height + 12 }
  })()`)
  if (headClip) {
    const zoom = await main.call('Page.captureScreenshot', { format: 'png', clip: { ...headClip, scale: 2 } })
    await writeFile(path.join(outDir, '01b-card-head-zoom.png'), Buffer.from(zoom.data, 'base64'))
    console.log('   ↳ 截图 01b-card-head-zoom.png')
  }

  // ── S2 点按钮 → 开出第二个原生窗口 ─────────────────────────────────────
  const popoutBox = await clickSelector(main, '.nk-popout-btn')
  pop = await connectTarget(DEBUG_PORT, (t) => t.url.includes('pop='), '独立窗口')
  const popUrl = (await listTargets(DEBUG_PORT)).find((t) => t.type === 'page' && t.url.includes('pop='))?.url ?? ''
  check('S2 点「↗」后开出第二个原生窗口（?pop=<ky>）', popUrl.includes(`pop=${encodeURIComponent(ky)}`), { popUrl })

  // ── S6 弹出后主窗口里的浮层应当收掉（同一篇笔记不同时开两处）───────────
  let cardGone = false
  for (let i = 0; i < 40; i++) {
    cardGone = await main.evaluate(`!document.querySelector('.nui-dialog.dialog-float-viewer')`)
    if (cardGone) break
    await sleep(200)
  }
  const leftover = await main.evaluate(`(() => {
    const app = window.__notekitApp
    return {
      dom: !!document.querySelector('.nui-dialog.dialog-float-viewer'),
      list: (app.states.floatViewerList || []).length,
      stack: (app.addons.floatViewer.activeWindowStack || []).length,
      preview: (app.addons.floatViewer.previewDialogIds || { size: 0 }).size,
    }
  })()`)
  check(
    'S6 弹出后主窗口浮层已收掉且列表/栈清干净',
    cardGone && !leftover?.dom && leftover?.list === 0 && leftover?.stack === 0,
    leftover
  )
  await shot(main, '03-main-window-after-popout.png')

  // ── S3 浮窗里只渲染那篇笔记 ────────────────────────────────────────────
  let state = null
  for (let i = 0; i < 120; i++) {
    state = await pop.evaluate(`(() => {
      const root = document.querySelector('.app-root-node')
      const dlg = document.querySelector('.nui-dialog.dialog-float-viewer')
      const head = document.querySelector('.nui-dialog-head')
      const editor = document.querySelector('.nui-dialog-body .editor-view')
      const r = dlg?.getBoundingClientRect()
      return {
        klass: document.body.classList.contains('nk-float-window'),
        rootHidden: root ? getComputedStyle(root).display === 'none' : null,
        hasDialog: !!dlg,
        headHidden: head ? getComputedStyle(head).display === 'none' : null,
        hasEditor: !!editor,
        title: document.title,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        client: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
      }
    })()`).catch(() => null)
    if (state?.hasDialog && state?.hasEditor) break
    await sleep(500)
  }
  check('S3a body 带 nk-float-window 且主界面收起', !!state?.klass && state?.rootHidden === true, state)
  check('S3b 浮层卡片铺满窗口', !!state?.rect && Math.abs(state.rect.w - state.client.w) <= 2 && Math.abs(state.rect.h - state.client.h) <= 2, state)
  check('S3c 卡片标题栏在浮窗内隐藏（交给原生标题栏）', state?.headHidden === true, state)
  check('S3d 正文编辑器渲染出来', state?.hasEditor === true, state)
  check('S3e 窗口标题取到笔记标题', !!state?.title && state.title !== 'Evergreen note', { title: state?.title })
  await shot(pop, '02-independent-window.png')

  // ── S4 去重：同一笔记再弹一次不新增窗口，卡片也照样收掉 ────────────────
  const popCount = async () => (await listTargets(DEBUG_PORT)).filter((t) => t.type === 'page' && t.url.includes('pop=')).length
  const before = await popCount()
  await main.evaluate(`window.__notekitApp.addons.floatViewer.show({ item: ${JSON.stringify(ky)}, isPin: true })`)
  for (let i = 0; i < 60; i++) {
    if (await main.evaluate(`!!document.querySelector('.nk-popout-btn')`)) break
    await sleep(300)
  }
  await clickSelector(main, '.nk-popout-btn')
  await sleep(1600)
  const after = await popCount()
  const cardGoneAgain = await main.evaluate(`!document.querySelector('.nui-dialog.dialog-float-viewer')`)
  check('S4 重复弹不新增窗口，且卡片再次收掉', before === 1 && after === 1 && cardGoneAgain === true, { before, after, cardGoneAgain })

  // ── S7 Cmd+P 搜索行右侧的两个额外入口 ─────────────────────────────────
  const titlePart = '独立窗口验收笔记'
  const openSearch = () =>
    main.evaluate(`window.__notekitApp.addons.search.showDialog({ keyword: ${JSON.stringify(titlePart)} })`)
  const searchState = () =>
    main.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.search-result-item')]
      const text = (el) => (el.textContent || '').trim()
      const row = ${NOTE_ROW_FINDER(titlePart)}
      // 含关键词但不以它开头的行 = 列表首位那个「创建主题 / Create topic」动作行
      const actionRows = rows.filter(
        (el) => (el.textContent || '').includes(${JSON.stringify(titlePart)}) && !text(el).startsWith(${JSON.stringify(titlePart)})
      )
      const panel = document.querySelector('.SearchDialog')
      const pr = panel?.getBoundingClientRect()
      return {
        rows: rows.length,
        found: !!row,
        card: !!(row && row.querySelector('.nk-search-open-card')),
        win: !!(row && row.querySelector('.nk-search-open-window')),
        // 动作行不是笔记，不该有这两个入口（曾因守卫看错字段而开出 floatview-undefined 空壳卡片）
        actionRows: actionRows.length,
        actionClean: actionRows.every(
          (el) => !el.querySelector('.nk-search-open-card') && !el.querySelector('.nk-search-open-window')
        ),
        panelOpen: !!panel && !!pr && pr.height > 0,
      }
    })()`)
  const waitSearch = async (pred, ms = 10000) => {
    const until = Date.now() + ms
    let s = null
    while (Date.now() < until) {
      s = await searchState()
      if (pred(s)) return s
      await sleep(200)
    }
    return s
  }

  await openSearch()
  const s7 = await waitSearch((s) => s.found)
  check('S7 搜索行右侧有「浮层 / 独立窗口」两个入口', !!s7?.found && s7.card === true && s7.win === true, s7)
  check(
    'S7b 列表首位的「创建主题」动作行不带这两个入口',
    s7?.actionRows === 1 && s7?.actionClean === true,
    { actionRows: s7?.actionRows, actionClean: s7?.actionClean }
  )
  await shot(main, '04-search-row-entries.png')

  // ── S7d 悬浮提示走 i18n：缺 key 时 Tip 会静默不渲染，所以必须实测提示文案 ──
  const hoverTip = async (cls) => {
    const box = await rowIconCenter(main, titlePart, cls)
    if (!box) return { text: '' }
    await main.call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(box.x),
      y: Math.round(box.y),
    })
    await sleep(1300)
    const text = await main.evaluate(
      `(document.querySelector('.MuiTooltip-tooltip')?.textContent || '').trim()`
    )
    return { text, x: Math.round(box.x), y: Math.round(box.y) }
  }
  const tipCard = await hoverTip('.nk-search-open-card')
  const tipWin = await hoverTip('.nk-search-open-window')
  check(
    'S7d 两个入口的悬浮提示能解析出文案（i18n 有 key）',
    tipCard.text.length > 0 && tipWin.text.length > 0,
    { tipCard, tipWin }
  )

  // ── S7c 双主题：两个入口在浅色/夜间都要看得见（DESIGN.md §4 交互状态双主题自证）──
  const themeProbe = () =>
    main.evaluate(`(() => {
      const row = ${NOTE_ROW_FINDER(titlePart)}
      const icon = (cls) => {
        const el = row?.querySelector(cls)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { w: Math.round(r.width), h: Math.round(r.height), color: cs.color, opacity: cs.opacity }
      }
      return {
        night: document.body.classList.contains('night-mode'),
        card: icon('.nk-search-open-card'),
        win: icon('.nk-search-open-window'),
      }
    })()`)
  const probeOk = (p) =>
    !!p?.card &&
    !!p?.win &&
    p.card.w >= 8 &&
    p.win.w >= 8 &&
    Number(p.card.opacity) > 0.3 &&
    Number(p.win.opacity) > 0.3
  const lightProbe = await themeProbe()
  // 供证据图精准圈注：把搜索行与两个图标的几何（CSS px，另带 dpr）一并落盘
  const searchGeometry = await main.evaluate(`(() => {
    const row = ${NOTE_ROW_FINDER(titlePart)}
    const rect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    return {
      dpr: window.devicePixelRatio,
      panel: rect(document.querySelector('.SearchDialog')),
      row: rect(row),
      card: rect(row?.querySelector('.nk-search-open-card')),
      win: rect(row?.querySelector('.nk-search-open-window')),
      head: rect(row?.querySelector('.node-head')),
    }
  })()`)
  // 隔离实例默认跟随系统深色，所以「切换前」不一定是浅色——按实测主题命名截图
  const firstTheme = await themeProbe()
  await main.evaluate(`window.__notekitApp.addons.nightMode.toggleNightMode()`)
  await sleep(800)
  const secondTheme = await themeProbe()
  await shot(main, `04b-search-row-entries-${secondTheme?.night ? 'night' : 'light'}.png`)
  await main.evaluate(`window.__notekitApp.addons.nightMode.toggleNightMode()`)
  await sleep(800)
  check(
    'S7c 两个入口在浅色/夜间两种主题下都渲染可见',
    probeOk(firstTheme) && probeOk(secondTheme) && firstTheme?.night !== secondTheme?.night,
    { firstTheme, secondTheme }
  )

  // ── S8 点「浮层」入口：主窗口出现卡片、面板收起、不新开窗口 ───────────────
  const cardIcon = await rowIconCenter(main, titlePart, '.nk-search-open-card')
  const popBefore8 = await popCount()
  await clickAt(main, cardIcon)
  let s8 = null
  for (let i = 0; i < 40; i++) {
    s8 = await main.evaluate(`(() => {
      const card = document.querySelector('.nui-dialog.dialog-float-viewer')
      const panel = document.querySelector('.SearchDialog')
      const pr = panel?.getBoundingClientRect()
      return {
        card: !!card && card.getBoundingClientRect().height > 0,
        panelOpen: !!panel && !!pr && pr.height > 0,
      }
    })()`)
    if (s8.card && !s8.panelOpen) break
    await sleep(200)
  }
  const popAfter8 = await popCount()
  check(
    'S8 点「浮层」入口：卡片出现、面板收起、不新开窗口',
    s8?.card === true && s8?.panelOpen === false && popAfter8 === popBefore8,
    { ...s8, popBefore8, popAfter8 }
  )
  await shot(main, '05-open-in-float-card.png')

  // ── S9 点「独立窗口」入口：开出原生窗口、面板收起、主窗口不留卡片 ─────────
  // 先清场（关掉卡片与既有浮窗），验证这条入口能真的新开一个窗口
  await main.evaluate(`window.__notekitApp.addons.floatViewer.closeCardsOf(${JSON.stringify(ky)})`)
  await pop.evaluate(`window.notekitShell.closeFloatWindow()`)
  for (let i = 0; i < 40 && (await popCount()) > 0; i++) await sleep(250)
  const closedPop = await popCount()
  const afterCleanup = await main.evaluate(`(() => {
    const app = window.__notekitApp
    return { card: ${CARD_PROBE}, list: (app.states.floatViewerList || []).map((d) => ({ id: d.dialogId, key: d.key })), ky: ${JSON.stringify(ky)} }
  })()`)
  console.log('   ↳ S9 清场后：' + JSON.stringify(afterCleanup))
  await openSearch()
  const s9pre = await waitSearch((s) => s.found)
  const winIcon = await rowIconCenter(main, titlePart, '.nk-search-open-window')
  await clickAt(main, winIcon)
  let s9 = null
  for (let i = 0; i < 60; i++) {
    const state = await main.evaluate(`(() => {
      const panel = document.querySelector('.SearchDialog')
      const pr = panel?.getBoundingClientRect()
      return { card: ${CARD_PROBE}, panelOpen: !!panel && !!pr && pr.height > 0 }
    })()`)
    s9 = { ...state, pop: await popCount(), list: await main.evaluate(`(window.__notekitApp.states.floatViewerList || []).map((d) => ({ id: d.dialogId, key: d.key }))`) }
    if (s9.pop === 1 && !s9.panelOpen) break
    await sleep(300)
  }
  check(
    'S9 点「独立窗口」入口：新开原生窗口、面板收起、主窗口无残留卡片',
    closedPop === 0 && s9?.pop === 1 && s9?.panelOpen === false && s9?.card?.visible === 0,
    { closedPop, s9, s9pre: s9pre?.found }
  )
  await shot(main, '06-open-in-window.png')

  // ── S10 回归：点行本体（非图标）仍走搜索原本的逻辑 ───────────────────────
  await openSearch()
  await waitSearch((s) => s.found)
  const popBefore10 = await popCount()
  await clickAt(main, await rowBodyCenter(main, titlePart))
  let s10 = null
  for (let i = 0; i < 40; i++) {
    s10 = await main.evaluate(`(() => {
      const panel = document.querySelector('.SearchDialog')
      const pr = panel?.getBoundingClientRect()
      return {
        card: ${CARD_PROBE},
        panelOpen: !!panel && !!pr && pr.height > 0,
        activeKey: window.__notekitApp.addons.main.workspaceActiveKey,
        showsNote: (document.body.innerText || '').includes(${JSON.stringify(titlePart)}),
      }
    })()`)
    if (!s10.panelOpen && s10.showsNote) break
    await sleep(300)
  }
  check(
    'S10 回归：点行本体仍走原逻辑（打开该笔记，不开卡片/新窗口）',
    s10?.card?.visible === 0 &&
      s10?.panelOpen === false &&
      s10?.showsNote === true &&
      (await popCount()) === popBefore10,
    s10
  )

  // ── S5 浮窗启动不触发「只有主窗口能调」的主进程报错 ─────────────────────
  const bootErrors = logs.split('\n').filter((line) => line.includes('仅允许应用主窗口'))
  check('S5 浮窗启动无越权 IPC 报错', bootErrors.length === 0, { bootErrors, tail: logs.slice(-400) })

  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ ky, popoutBox, searchGeometry, results, failures }, null, 2))
  console.log(`\n结果：${results.length - failures.length}/${results.length} 通过`)
  if (failures.length) console.log('失败：' + failures.join('、'))
} catch (error) {
  console.error('❌ 验收中断：', error?.message ?? error)
  console.error('应用日志尾部：\n' + logs.slice(-2000))
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures, fatal: String(error?.message ?? error) }, null, 2))
  process.exitCode = 1
} finally {
  try { pop?.close() } catch {}
  try { main?.close() } catch {}
  child.kill('SIGKILL')
}
