/**
 * 行内链接悬停铅笔按钮（InlinesBar2Comp 的 .inlines-edit-btn）验收（隔离实例，不动用户数据）
 *
 * 议题 D125F26FCF5E-20：在链接上悬停时出现的小图标，悬停时会变成半透明。
 *
 * 用法：node tools/inlines-edit-btn-verify.mjs
 * 前置：pnpm build。输出 test-runs/inlines-edit-btn-verify/
 *
 * 覆盖（浅色/夜间各跑一遍）：
 *   A1 悬停行内链接 → 铅笔按钮出现（visibility visible、opacity 1）
 *   A2 鼠标移到铅笔按钮上 → 按钮保持可见、opacity 恒为 1（不得变淡）
 *   A3 按钮有实底色（不是靠透明撑形状的幽灵按钮；形状全靠填充表达）
 *   A4 按钮不画描边线（outline/border/box-shadow 皆无），且实底与笔记底面可分辨
 *      （≥1.10:1，防止填充退化到看不见）——用户要求「去掉轮廓边缘线，只用背景色」
 *   A5 铅笔对按钮底色对比 ≥ 4.5:1
 *   A6 悬停态不弱于静止态（同为主题内更强的状态，而不是变淡）
 *   A7 鼠标停在按钮上 ≥700ms 不被隐藏定时器收掉
 *   A8 停滞在链接与按钮之间不出现「半透明悬挂态」
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'inlines-edit-btn-verify')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const APP_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })

const NODE_TITLE = '铅笔按钮测试'
const LINK_TEXT = '四流合一'
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const DEBUG_PORT = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) { console.error('❌ 未能连上 CDP'); child.kill(); process.exit(1) }
const ev = e => cdp.evaluate(e)
const call = (m, p = {}) => cdp.call(m, p)
const evalT = (expression, ms = 15000) => Promise.race([ev(expression), sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) })])
const callT = (method, params = {}, ms = 15000) => Promise.race([call(method, params), sleeps(ms).then(() => { throw new Error(`${method} 超时 ${ms}ms`) })])

const results = []
const failures = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}
const shot = async (name, clip) => {
  // captureBeyondViewport=false：否则 CDP 会临时改视口去截「超出视口」的区域，
  // 触发一次窗口尺寸变化 → 应用重渲染，把被测的悬停态打散。
  const img = await callT('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip: { ...clip, scale: 3 } } : {}) }, 20000)
  const p = path.join(outDir, name)
  await writeFile(p, Buffer.from(img.data, 'base64'))
  return p
}
/* 真实鼠标是连续移动的：插值分步派发，避免一次性跳变时浏览器只重算 hover
   而不派发 mousemove（组件按坐标复核指针位置时会读到旧坐标）。 */
let mousePos = { x: 0, y: 0 }
const moveMouse = async (x, y, settle = 350) => {
  const tx = Math.round(x)
  const ty = Math.round(y)
  const steps = 4
  for (let i = 1; i <= steps; i++) {
    const ix = Math.round(mousePos.x + ((tx - mousePos.x) * i) / steps)
    const iy = Math.round(mousePos.y + ((ty - mousePos.y) * i) / steps)
    await callT('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ix, y: iy, button: 'none', buttons: 0 })
    await sleeps(16)
  }
  mousePos = { x: tx, y: ty }
  await sleeps(settle)
}
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await callT('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  await sleeps(300)
}

/* ---------- 对比度工具（WCAG） ---------- */
const parseColor = s => {
  const m = /rgba?\(([^)]+)\)/.exec(s || '')
  if (!m) return null
  const p = m[1].split(',').map(v => parseFloat(v.trim()))
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
}
const lum = c => {
  const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}
const over = (fg, bg) => fg.a >= 1 ? fg : { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return +( (x + 0.05) / (y + 0.05) ).toFixed(2) }

/* ---------- 启动与造数据 ---------- */
for (let i = 0; i < 90; i++) { try { if (await evalT(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch { /* noop */ } ; await sleeps(1000) }
await evalT(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(NODE_TITLE)}); return true })()`, 15000).catch(() => {})
await sleeps(1200)
for (let i = 0; i < 30; i++) {
  if (await evalT(`!!document.querySelector('.editor-view [contenteditable="true"]')`).catch(() => false)) break
  await sleeps(1000)
}
{
  const point = await evalT(`(() => {
    const el = document.querySelector('.editor-view [contenteditable="true"]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + 30, y: r.top + Math.min(20, r.height / 2) }
  })()`)
  if (!point) throw new Error('找不到可编辑笔记')
  await clickAt(point.x, point.y)
}
await callT('Input.insertText', { text: `前缀 ${LINK_TEXT} 后缀` }, 10000)
await sleeps(400)
{
  const r = await evalT(`(() => {
    const node = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(LINK_TEXT)}))
    if (!node) return 'no-node'
    const ce = node.closest('[contenteditable="true"]') || node.querySelector('[contenteditable="true"]')
    if (!ce) return 'no-editable'
    ce.focus()
    const span = [...node.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes(${JSON.stringify(LINK_TEXT)}))
    if (!span) return 'no-span'
    const range = document.createRange()
    const tn = span.firstChild
    const i = (span.textContent || '').indexOf(${JSON.stringify(LINK_TEXT)})
    range.setStart(tn, i); range.setEnd(tn, i + ${JSON.stringify(LINK_TEXT)}.length)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
    return sel.toString()
  })()`)
  if (typeof r === 'string' && r.startsWith('no-')) throw new Error('选区失败: ' + r)
  await sleeps(400)
}
const linkKind = await evalT(`(() => {
  const $ = window.__notekitApp.addons
  const node = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(LINK_TEXT)}))
  if (!node) return 'no-node'
  try {
    const el = $.hyperlink.createElement({ url: 'https://example.com/liuliuhyi', title: ${JSON.stringify(LINK_TEXT)} })
    $.inlines.wrap(node.$editor, el)
    return 'hyperlink'
  } catch (e) { /* fallthrough */ }
  try { $.bilink.linkSelection(node.$editor); return 'bilink' } catch (e) { return 'none:' + String(e && e.message) }
})()`)
await sleeps(700)
console.log('链接类型：', linkKind)

/* ---------- 状态读取 ---------- */
const readState = () => evalT(`(() => {
  const btn = document.querySelector('.inlines-edit-btn')
  if (!btn) return { exists: false }
  const cs = getComputedStyle(btn)
  const icon = btn.querySelector('.node-icon')
  const ics = icon ? getComputedStyle(icon) : null
  const svg = btn.querySelector('svg')
  const ss = svg ? getComputedStyle(svg) : null
  const r = btn.getBoundingClientRect()
  const ir = icon ? icon.getBoundingClientRect() : null
  const surf = getComputedStyle(document.querySelector('.node-body') || document.body).backgroundColor
  const page = getComputedStyle(document.body).backgroundColor
  return {
    exists: true,
    theme: document.body.classList.contains('night-mode') ? 'night' : 'day',
    btn: {
      opacity: cs.opacity, visibility: cs.visibility, display: cs.display,
      background: cs.backgroundColor, borderRadius: cs.borderRadius,
      /* 归一化「有没有可见的线」：0 宽 / none / 全透明阴影都算没有 */
      boxShadow: cs.boxShadow === 'none' || cs.boxShadow.endsWith('0)') ? 'none' : cs.boxShadow,
      outline: parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none' ? cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor : 'none',
      border: parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' ? cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor : 'none',
      color: cs.color, transition: cs.transition, transform: cs.transform, hovered: btn.matches(':hover'),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    },
    icon: ics ? { opacity: ics.opacity, background: ics.backgroundColor, color: ics.color, outline: ics.outlineColor + ' ' + ics.outlineWidth, transform: ics.transform, rect: ir ? { x: ir.left, y: ir.top, w: ir.width, h: ir.height } : null } : null,
    svg: ss ? { fill: ss.fill, color: ss.color, opacity: ss.opacity } : null,
    surface: surf, page,
  }
})()`)
const linkPoint = () => evalT(`(() => {
  const el = document.querySelector('.editor-view .inline-element')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: { x: r.left, y: r.top, width: r.width, height: r.height } }
})()`)

/* ---------- 单主题一轮 ---------- */
const runTheme = async (themeLabel) => {
  const ring = {}
  const lp = await linkPoint()
  if (!lp) throw new Error('行内元素未创建')
  await moveMouse(lp.x, lp.y)
  const rest = await readState()
  ring.rest = rest
  check(`A1[${themeLabel}] 悬停链接后铅笔按钮出现`, !!rest.exists && rest.btn.visibility === 'visible' && Number(rest.btn.opacity) > 0.95, rest)
  const iconRect = rest.icon?.rect || rest.btn.rect
  await shot(`rest-${themeLabel}-link.png`, { x: Math.max(0, rest.btn.rect.x - 40), y: Math.max(0, rest.btn.rect.y - 10), width: 150, height: rest.btn.rect.h + 20 })
  await shot(`rest-${themeLabel}-chip.png`, { x: Math.max(0, iconRect.x - 8), y: Math.max(0, iconRect.y - 8), width: iconRect.w + 16, height: iconRect.h + 16 })

  /* 鼠标移到按钮上（记录事件流，便于定位隐藏成因） */
  await evalT(`(() => {
    if (!window.__rec) {
      window.__rec = true
      window.__dbg = []
      ;['mouseover', 'mouseout'].forEach(type => document.addEventListener(type, e => {
        const b = document.querySelector('.inlines-edit-btn')
        const cls = String((e.target && e.target.className) || '')
        window.__dbg.push({
          type,
          target: e.target ? e.target.tagName + '.' + cls.split(' ').slice(0, 2).join('.') : null,
          inBar: !!b && (e.target === b || b.contains(e.target)),
          matchesInline: !!(e.target && e.target.matches && e.target.matches('.inline-element *')),
          vis: b ? getComputedStyle(b).visibility : null,
          op: b ? getComputedStyle(b).opacity : null,
        })
      }), true)
    }
    window.__dbg = []
    return true
  })()`)
  await moveMouse(iconRect.x + iconRect.w / 2, iconRect.y + iconRect.h / 2)
  const hover = await readState()
  const onIt = await evalT(`(() => {
    const btn = document.querySelector('.inlines-edit-btn')
    if (!btn) return null
    const el = document.elementFromPoint(${Math.round(iconRect.x + iconRect.w / 2)}, ${Math.round(iconRect.y + iconRect.h / 2)})
    const pops = [...document.querySelectorAll('.MuiTooltip-popper, .MuiPopper-root')]
    return {
      inBtn: !!el && btn.contains(el),
      btnHover: btn.matches(':hover'),
      atPoint: el ? el.tagName + '.' + String(el.className || '').split(' ').slice(0, 2).join('.') : null,
      rect: (() => { const r = btn.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })(),
      tooltips: pops.map(p => { const r = p.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), text: (p.innerText || '').slice(0, 24) } }),
      events: window.__dbg,
    }
  })()`)
  ring.hover = hover
  check(`A2[${themeLabel}] 鼠标落在按钮上且按钮不变淡`, !!onIt && onIt.inBtn === true && hover.btn.visibility === 'visible' && Number(hover.btn.opacity) > 0.95 && hover.icon?.opacity === '1', { onIt, hover })

  /* 停在按钮上，看隐藏定时器会不会把它收掉。
     注意：截图（Page.captureScreenshot）会强制一次布局/重渲染，把被测的悬停态打散，
     所以稳定性窗口内不拍照，截图挪到断言之后（A7 照片见 hover-*-chip.png）。 */
  await sleeps(800)
  const still = await readState()
  const bars = await evalT(`(() => {
    const all = [...document.querySelectorAll('.inlines-edit-btn')]
    const b = all[0]
    const el = document.elementFromPoint(${Math.round(iconRect.x + iconRect.w / 2)}, ${Math.round(iconRect.y + iconRect.h / 2)})
    return { count: all.length, bars: all.map(x => { const r = x.getBoundingClientRect(); return { op: getComputedStyle(x).opacity, vis: getComputedStyle(x).visibility, x: Math.round(r.left), y: Math.round(r.top) } }), atPointInBar: !!el && !!b && b.contains(el) }
  })()`)
  ring.still = still
  check(`A7[${themeLabel}] 停在按钮上 800ms 不被收掉`, still.exists && still.btn.visibility === 'visible' && Number(still.btn.opacity) > 0.95, { still, bars })
  /* 悬停态照片事后补拍（先断言、后拍照，避免截图扰动被测状态） */
  await shot(`hover-${themeLabel}-chip.png`, { x: Math.max(0, iconRect.x - 8), y: Math.max(0, iconRect.y - 8), width: iconRect.w + 16, height: iconRect.h + 16 })

  /* A8 停滞在链接与按钮之间（4px 缝）不应出现半透明悬挂态 */
  const gapX = lp.rect.x + lp.rect.width + 2
  await moveMouse(lp.x, lp.y, 200)
  await moveMouse(gapX, lp.y, 150)
  const gapState = await readState()
  ring.gap = gapState
  const gapOpacity = gapState.exists ? Number(gapState.btn.opacity) : 0
  check(`A8[${themeLabel}] 缝隙里不出现半透明悬挂（opacity 只能 0 或 1）`, !gapState.exists || gapOpacity === 0 || gapOpacity === 1, { gapOpacity, gapState })

  /* 颜色/对比度：底色按「内层有效底色（不透明时）→ 外层圆片」取值，
     边界取外层 box-shadow 的 1px 描边 */
  if (hover.exists && rest.exists && rest.icon && hover.icon) {
    const noteBg = (parseColor(rest.surface)?.a ?? 0) >= 1 ? parseColor(rest.surface) : parseColor(rest.page)
    const effFill = st => { const inner = parseColor(st.icon.background); return inner && inner.a > 0.95 ? inner : parseColor(st.btn.background) }
    const ringOf = st => parseColor(st.btn.boxShadow)
    const restFill = effFill(rest)
    const hoverFill = effFill(hover)
    const restRing = ringOf(rest)
    const hoverRing = ringOf(hover)
    const inkRest = parseColor(rest.svg?.fill) || parseColor(rest.icon.color)
    const inkHover = parseColor(hover.svg?.fill) || parseColor(hover.icon.color)
    const diff = (a, b) => !!a && !!b && (a.r !== b.r || a.g !== b.g || a.b !== b.b || a.a !== b.a)
    check(`A3[${themeLabel}] 静止态圆片有不透明实底`, !!restFill && restFill.a > 0.95, { restFill: rest.icon.background, outer: rest.btn.background })
    const ringRatio = restFill && noteBg ? ratio(restFill, noteBg) : 0
    const ringRatioHover = hoverFill && noteBg ? ratio(hoverFill, noteBg) : 0
    const noLine = (st) => st.btn.outline === 'none' && st.btn.border === 'none' && st.btn.boxShadow === 'none'
    const noEdgeLine = noLine(rest) && noLine(hover)
    check(`A4[${themeLabel}] 不画描边线（outline/border/box-shadow 皆无）+ 实底与笔记底面可分辨 ≥1.10:1`,
      noEdgeLine && Math.min(ringRatio, ringRatioHover) >= 1.1,
      { noEdgeLine, restOutline: rest.btn.outline, restBorder: rest.btn.border, restBoxShadow: rest.btn.boxShadow, ringRatio, ringRatioHover, noteBg, restFill, hoverFill })
    const inkRatio = inkRest && restFill ? ratio(inkRest, restFill) : 0
    check(`A5[${themeLabel}] 笔形对圆片底色对比 ≥4.5:1（静止态）`, inkRatio >= 4.5, { inkRatio, inkRest: rest.svg?.fill, restFill })
    const bothOpaque = !!restFill && restFill.a > 0.95 && !!hoverFill && hoverFill.a > 0.95
    const scaleOf = st => { const m = /matrix\(([^)]+)\)/.exec(st.btn.transform || ''); return m ? parseFloat(m[1].split(',')[0]) : 1 }
    const scaleChange = Math.abs(scaleOf(hover) - scaleOf(rest)) > 0.02
    const visibleChange = diff(restFill, hoverFill) || diff(restRing, hoverRing) || scaleChange
    check(`A6[${themeLabel}] 悬停态不弱于静止态（两态都不透明 + 有可见变化）`, bothOpaque && visibleChange, { restFill, hoverFill, restRing: rest.btn.boxShadow, hoverRing: hover.btn.boxShadow, scaleRest: rest.btn.transform, scaleHover: hover.btn.transform, scaleChange, inkHover: hover.svg?.fill })
    ring.ratios = { fillVsSurface: ringRatio, fillVsSurfaceHover: ringRatioHover, inkRatio }
  }
  return ring
}

const before = await readState()
const themeNow = before.theme
console.log('起始主题：', themeNow)
const rings = {}
rings[themeNow] = await runTheme(themeNow)
/* 切到另一主题（隔离实例跟随系统深色，通常只跑到 night；两主题都要覆盖） */
await evalT(`(() => { const nm = window.__notekitApp.addons.nightMode; if (nm && nm.toggleNightMode) nm.toggleNightMode(); return document.body.classList.contains('night-mode') ? 'night' : 'day' })()`)
await sleeps(900)
const themeOther = await evalT(`document.body.classList.contains('night-mode') ? 'night' : 'day'`)
console.log('切换后主题：', themeOther)
if (themeOther !== themeNow) rings[themeOther] = await runTheme(themeOther)

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures, linkKind, rings }, null, 2))
console.log(`\n结果：${results.length - failures.length}/${results.length} 通过；失败：${JSON.stringify(failures)}`)
console.log('产物目录：' + outDir)
try { cdp.close() } catch { /* noop */ }
child.kill()
process.exit(failures.length ? 1 : 0)
