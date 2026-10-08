/**
 * 夜间主题皮肤取证探针（2026-10-08）。
 *
 * 目的：在**隔离实例**（独立 NOTEKIT_USER_DATA，不碰用户库）里灌入真实内容，
 * 让 Andy 多栏 + 每日动态卡片真正渲染出来，然后：
 *   1. 逐层量取深色主题的计算样式（bg / color / border）；
 *   2. node 侧算 WCAG 对比度，找出不达标的具体条目；
 *   3. 浅色/夜间各截一张 PNG 作目检证据。
 *
 * 用法：node tools/night-skin-probe.mjs
 * 输出：test-runs/night-skin-probe/{measure.json, night-*.png}
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'night-skin-probe')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}

const APP_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })
await mkdir(outDir, { recursive: true })
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
let childLog = ''
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', '--window-size=1480,940', `--remote-debugging-port=${debugPort}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', d => { childLog += d })
child.stderr.on('data', d => { childLog += d })

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { child.kill(); console.error(childLog); throw new Error('CDP 连接失败') }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`).catch(() => false)) break } catch {}; await sleeps(1000) }

// ── 灌入内容（走 note-command HTTP，与应用同权）──────────────
const descriptor = JSON.parse(await readFile(path.join(profile, 'note-command.json'), 'utf8'))
const post = async input => {
  const r = await fetch(descriptor.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${descriptor.token}` },
    body: JSON.stringify(input),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
// 应用「起来了」不等于「写读就绪」：status 会返回『应用尚未就绪』直到 dbDisk 完成装载。
const call = async (input, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    try { return await post(input) }
    catch (e) {
      if (!/尚未就绪/.test(e.message) || i === tries - 1) throw e
      await sleeps(1000)
    }
  }
}
const status = await call({ action: 'status' })
const dbid = status.dbid
console.log('dbid:', dbid)

const TOPICS = [
  '知识体系总论', '思维模型', '设计知识体系', '产品方法论', '全域营销链路',
  '教练方法论', '供应链与柔性生产', '机器学习基础', '商业模式画布', '为人处事',
]
for (const name of TOPICS) await call({ action: 'createTopic', dbid, name }).catch(e => console.log('topic', name, e.message))

const today = '2026-10-08'
const BODY = [
  { text: '整理记录（倒序）', bold: true },
  { text: '整理记录 — 【2026-10-08 | 第 13 段】产品方法论两篇接入（不建新笔记，直接为既有主题建立连接）：①麦肯锡：如何思考…' },
  { text: '关联脉络（2026-10-08）— 相关主题：本次记录属于教练/沟通记录合集，总入口见 教练记录，教练方法见 教练原则，待办与问题清单…' },
  { text: '补录：尚未纳入的思维模型（2026-10-08）— 说明：本补录只做归类与串接，不改变各主题原有内容；各主题也各自补了回链指向本页。' },
  { text: '这是一段用于对照深色主题正文可读性的普通段落，包含中文与 English mixed content 以及数字 1234567890。' },
]
const sha = s => createHash('sha256').update(s).digest('hex')
for (let i = 0; i < TOPICS.length; i++) {
  const blocks = BODY.slice(0, 3 + (i % 3))
  await call({
    action: 'append', dbid, date: today, title: TOPICS[i], blocks,
    requestId: sha(`night-probe-${today}-${TOPICS[i]}`),
  }).catch(e => console.log('append', TOPICS[i], e.message))
}

// ── 渲染到多栏 + 每日页 ─────────────────────────────────────
const toAndy = `(() => {
  const app = window.__notekitApp
  try { app.addons.floatViewer.setModeAll('andy') } catch {}
  return app.states.floatViewerMode
})()`
await ev(toAndy).catch(() => {})
await sleeps(1500)

const routeDaily = `(async () => {
  const app = window.__notekitApp
  const date = ${JSON.stringify(today)}
  try {
    if (app.addons.daily?.route) { await app.addons.daily.route(date); return 'daily' }
  } catch (e) {}
  try { app.addons.router.to('/diaries'); return 'diaries' } catch (e) {}
  return 'none'
})()`
console.log('route:', await ev(routeDaily).catch(e => 'err:' + e.message))
await sleeps(2500)

const MEASURE = `(() => {
  const toRgb = (c) => {
    if (!c || c === 'transparent') return null
    const m = c.match(/rgba?\\(([^)]+)\\)/)
    if (!m) return null
    const p = m[1].split(',').map(s => parseFloat(s))
    if (p.length === 4 && p[3] === 0) return null
    return [p[0], p[1], p[2], p.length === 4 ? p[3] : 1]
  }
  const lum = (rgb) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
  }
  // 沿祖先链找第一个不透明背景，作为「实际看到的底色」
  const effBg = (el) => {
    let n = el
    while (n && n !== document.documentElement) {
      const c = toRgb(getComputedStyle(n).backgroundColor)
      if (c && c[3] >= 0.9) return c
      n = n.parentElement
    }
    return toRgb(getComputedStyle(document.body).backgroundColor) || [28,37,42,1]
  }
  const cx = (a, b) => { const la = lum(a), lb = lum(b), hi = Math.max(la,lb), lo = Math.min(la,lb); return (hi + 0.05) / (lo + 0.05) }
  const hex = c => c ? '#' + c.slice(0,3).map(v => Math.round(v).toString(16).padStart(2,'0')).join('') : null

  const items = []
  const seen = new Set()
  // 取所有「有文字的元素」，用 class 去重，取该类第一个
  const all = [...document.querySelectorAll('body *')]
  for (const el of all) {
    const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('')
    if (!ownText) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const key = (el.className && typeof el.className === 'string' ? el.className.split(' ').slice(0,2).join('.') : el.tagName) + '|' + getComputedStyle(el).fontSize
    if (seen.has(key)) continue
    seen.add(key)
    const cs = getComputedStyle(el)
    const fg = toRgb(cs.color)
    if (!fg) continue
    const bg = effBg(el)
    items.push({
      key,
      tag: el.tagName.toLowerCase(),
      text: ownText.slice(0, 28),
      fg: hex(fg),
      bg: hex(bg),
      fs: cs.fontSize,
      weight: cs.fontWeight,
      contrast: Math.round(cx(fg, bg) * 100) / 100,
      w: Math.round(r.width), h: Math.round(r.height),
    })
  }
  items.sort((a, b) => a.contrast - b.contrast)

  const varOf = n => getComputedStyle(document.body).getPropertyValue(n).trim()
  const pick = (label, sel) => {
    const el = document.querySelector(sel)
    if (!el) return { label, sel, missing: true }
    const cs = getComputedStyle(el)
    const bg = toRgb(cs.backgroundColor)
    return {
      label, sel,
      bg: hex(bg) || 'transparent',
      effBg: hex(effBg(el)),
      color: hex(toRgb(cs.color)),
      borderTop: cs.borderTopWidth + ' ' + hex(toRgb(cs.borderTopColor)),
      borderLeft: cs.borderLeftWidth + ' ' + hex(toRgb(cs.borderLeftColor)),
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow === 'none' ? 'none' : 'yes',
    }
  }
  return {
    night: document.body.classList.contains('night-mode'),
    tokens: Object.fromEntries(['--nk-canvas','--nk-sidebar','--nk-surface','--nk-ink','--nk-muted','--nk-line','--nk-line-strong','--nk-accent','--nk-accent-soft','--nk-hover','--nk-tab-hover','--nk-backlink-bg'].map(n => [n, varOf(n)])),
    surfaces: [
      pick('body', 'body'),
      pick('sidebar', 'nav.nav-area'),
      pick('main-area', '.main-area'),
      pick('workspace-header', '.workspace-header'),
      pick('andy column', ".nui-dialog[dialog-list-mode='andy']"),
      pick('andy subitems', ".floatview-container[data-mode='andy'] .floatview-container-subitems"),
      pick('backlink card', '.backlink-reading'),
      pick('backlink title', '.backlink-reading h2'),
      pick('backlink entry', '.backlink-reading-entry'),
      pick('expand btn', '.backlink-reading-toggle'),
      pick('nav footer', '.nk-nav-footer'),
    ],
    andyVars: (() => {
      const el = document.querySelector(".floatview-container[data-mode='andy']")
      if (!el) return null
      const cs = getComputedStyle(el)
      return { canvas: cs.getPropertyValue('--andy-canvas').trim(), paper: cs.getPropertyValue('--andy-paper').trim(), divider: cs.getPropertyValue('--andy-divider').trim(), bg: cs.backgroundColor }
    })(),
    // 对比度低于 AA 正文(4.5) / 大字(3.0) 的项
    lowest: items.slice(0, 22),
    failingNormal: items.filter(i => i.contrast < 4.5 && parseFloat(i.fs) < 18.66).length,
    total: items.length,
  }
})()`

const capture = async (theme) => {
  // 设主题
  await ev(`(() => {
    localStorage.setItem('nightMode', ${theme === 'night' ? "'on'" : "'off'"})
    document.body.classList.toggle('night-mode', ${theme === 'night'})
    document.documentElement.style.colorScheme = ${theme === 'night' ? "'dark'" : "'light'"}
    return document.body.classList.contains('night-mode')
  })()`)
  await sleeps(1200)
  const m = await ev(MEASURE)
  const shot = await cdp.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, `${theme}-andy.png`), Buffer.from(shot.data, 'base64'))
  // 也截主区（fixed）模式
  await ev(`(() => { try { window.__notekitApp.addons.floatViewer.setModeAll('fixed') } catch {} })()`).catch(() => {})
  await sleeps(1200)
  const shot2 = await cdp.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, `${theme}-fixed.png`), Buffer.from(shot2.data, 'base64'))
  await ev(`(() => { try { window.__notekitApp.addons.floatViewer.setModeAll('andy') } catch {} })()`).catch(() => {})
  await sleeps(1000)
  return m
}

const nightM = await capture('night')
const dayM = await capture('day')

const report = { night: nightM, day: dayM }
await writeFile(path.join(outDir, 'measure.json'), JSON.stringify(report, null, 2))
console.log('=== NIGHT surfaces ===')
for (const s of nightM.surfaces) console.log(' ', JSON.stringify(s))
console.log('=== NIGHT andyVars ===', JSON.stringify(nightM.andyVars))
console.log('=== NIGHT low-contrast (worst 16) ===')
for (const i of nightM.lowest.slice(0, 16)) console.log(`  ${String(i.contrast).padStart(6)}  ${i.fs.padStart(6)}  fg=${i.fg} bg=${i.bg}  ${i.tag}.${i.key.split('|')[0].slice(0,34)}  "${i.text}"`)
console.log(`NIGHT failing(<4.5, normal size): ${nightM.failingNormal}/${nightM.total}`)
console.log(`DAY   failing(<4.5, normal size): ${dayM.failingNormal}/${dayM.total}`)

child.kill()
