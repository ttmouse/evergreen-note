/**
 * 浅色/夜间真实对照探针 v2（2026-10-08）。
 *
 * v1 的缺陷：只 toggle body.night-mode class，没有重跑 NightMode addon，
 * 于是（a）夜间缺了注入的 92 条 !important 遗留规则，（b）浅色下遗留样式还挂着——
 * 测出来的不是真实主题状态。v2 改为：设 localStorage → reload → 等 app 就绪 → 再量。
 *
 * 用法：node tools/theme-parity-probe.mjs
 * 输出：test-runs/night-skin-probe/parity.json（含两次真实主题的逐选择器计算样式）
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
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
await mkdir(profile, { recursive: true })
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', '--window-size=1480,940', `--remote-debugging-port=${debugPort}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { child.kill(); throw new Error('CDP 连接失败') }
const ev = e => cdp.evaluate(e)
const waitReady = async () => {
  for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`).catch(() => false)) return } catch {} ; await sleeps(1000) }
  throw new Error('应用未就绪')
}
await waitReady()

const today = '2026-10-08'
// 先把当日页开出来，两个主题量的是同一屏
await ev(`(async () => { try { await window.__notekitApp.addons.daily.route(${JSON.stringify(today)}) } catch {} })()`).catch(() => {})
await sleeps(2500)
await ev(`(async () => { try { await window.__notekitApp.addons.daily.route(${JSON.stringify(today)}) } catch {} })()`).catch(() => {})
await sleeps(1500)

const PROBE = `(() => {
  const rgb = c => { const m=(c||'').match(/rgba?\\(([^)]+)\\)/); if(!m) return null
    const p=m[1].split(',').map(Number); if(p.length===4 && p[3]===0) return null; return p }
  const hex = c => c ? '#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('') : null
  const lum = c => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]) }
  const cx=(a,b)=>{if(!a||!b)return null;const la=lum(a),lb=lum(b),hi=Math.max(la,lb),lo=Math.min(la,lb);return Math.round(((hi+.05)/(lo+.05))*100)/100}
  const effBg = el => { let n=el
    while(n&&n!==document.documentElement){const c=rgb(getComputedStyle(n).backgroundColor); if(c&&(c.length<4||c[3]>=0.9))return c; n=n.parentElement}
    return rgb(getComputedStyle(document.body).backgroundColor) }

  const SEL = {
    'floatbar':'.float-bar',
    'andyColumn':".nui-dialog[dialog-list-mode='andy']",
    'andySubitems':".floatview-container[data-mode='andy'] .floatview-container-subitems",
    'floatHead':".floatview-container[data-mode='andy'] > .floatview-container-head",
    'navArea':'nav.nav-area',
    'mainArea':'.main-area',
    'workspaceHeader':'.workspace-header',
    'editorView':'.editor-view',
    'navFooter':'.nk-nav-footer',
    'brand':'.nk-nav-brand',
    'tab':'.workspace-tab',
    'tabActive':'.workspace-tab.is-active',
    'activityCard':'.backlink-reading',
    'cardHead':'.backlink-reading-head',
    'cardEntry':'.backlink-reading-entry',
    'scrollThumb':null,
  }
  const out = {}
  for (const [k,sel] of Object.entries(SEL)) {
    if (!sel) { out[k] = { skipped: true }; continue }
    const el = document.querySelector(sel)
    if (!el) { out[k] = { missing: true }; continue }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const bg = rgb(cs.backgroundColor), fg = rgb(cs.color), ebg = effBg(el)
    out[k] = {
      bg: hex(bg), fg: hex(fg), effBg: hex(ebg),
      fgContrast: cx(fg, ebg),
      bgVsCanvas: null,
      border: cs.borderTopWidth + ' ' + hex(rgb(cs.borderTopColor)),
      radius: cs.borderTopLeftRadius,
      w: Math.round(r.width), h: Math.round(r.height),
    }
  }
  const canvas = effBg(document.querySelector('.main-area') || document.body)
  for (const v of Object.values(out)) if (v.bg) v.bgVsCanvas = cx(rgb(v.bg), canvas)
  const varOf = n => getComputedStyle(document.body).getPropertyValue(n).trim() || '(unset)'
  return {
    nightClass: document.body.classList.contains('night-mode'),
    legacyStyleInjected: !!document.getElementById('night-mode-style'),
    legacyRuleLen: (document.getElementById('night-mode-style')?.textContent || '').length,
    canvas: hex(canvas),
    out,
    vars: Object.fromEntries(['--bg-color','--body-bg-color','--andy-canvas','--andy-paper','--andy-divider','--nk-canvas','--nk-sidebar','--nk-surface','--nk-ink','--nk-muted','--nk-line','--nk-line-strong','--nk-accent','--nk-accent-soft','--nk-backlink-bg','--node-text-link','--node-btn-hover','--dark-bg-primary','--dark-bg-secondary'].map(n=>[n,varOf(n)])),
  }
})()`

const setTheme = async t => {
  await ev(`localStorage.setItem('nightMode', ${t === 'night' ? "'on'" : "'off'"})`)
  await cdp.call('Page.reload', {})
  await sleeps(1500)
  await waitReady()
  await sleeps(2000)
  await ev(`(async () => { try { await window.__notekitApp.addons.daily.route(${JSON.stringify(today)}) } catch {} })()`).catch(() => {})
  await sleeps(2500)
}

await setTheme('night')
const night = await ev(PROBE)
await setTheme('day')
const day = await ev(PROBE)

await writeFile(path.join(outDir, 'parity.json'), JSON.stringify({ night, day }, null, 2))

const keys = Object.keys(night.out)
console.log(`night: class=${night.nightClass} legacyInjected=${night.legacyStyleInjected} legacyLen=${night.legacyRuleLen} canvas=${night.canvas}`)
console.log(`day  : class=${day.nightClass} legacyInjected=${day.legacyStyleInjected} legacyLen=${day.legacyRuleLen} canvas=${day.canvas}`)
console.log()
console.log('selector'.padEnd(16) + '| ' + 'DAY  bg / fg (vsCanvas)'.padEnd(40) + '| ' + 'NIGHT bg / fg (vsCanvas)')
console.log('-'.repeat(110))
for (const k of keys) {
  const d = day.out[k], n = night.out[k]
  if (d.missing && n.missing) { console.log(k.padEnd(16) + '| (missing both)'); continue }
  const f = x => x.missing ? '(missing)' : `${x.bg || 'none'} / ${x.fg || 'none'} (${x.bgVsCanvas ?? '-'})`
  console.log(k.padEnd(16) + '| ' + f(d).padEnd(40) + '| ' + f(n))
}
console.log()
for (const t of ['day','night']) {
  const v = t === 'day' ? day.vars : night.vars
  console.log(`--- ${t} vars ---`)
  for (const [k, val] of Object.entries(v)) console.log(`   ${k.padEnd(20)} ${val}`)
}
child.kill()
