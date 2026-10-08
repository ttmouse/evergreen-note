/**
 * 双主题图标/线条清扫 v2（2026-10-09）。
 *
 * 用户要求穷尽式排查：所有 SVG 图标在浅色/夜间两种模式下都要有对应处理。
 * 本探针在隔离实例里对两个主题 × 三条路由各跑一遍：
 *   1) 图标：每个可见 SVG（含 hover 前不可见的行动按钮）的 fill/stroke
 *      对有效背景的 WCAG 对比度，<3 判为「不可见/隐身」；
 *   2) 线条：border/outline ≥1px 实线且面积足够的元素，颜色对背景
 *      对比度 >9 判为「过亮」（夜间刺眼候选，人工分诊）。
 *
 * 用法：/opt/homebrew/bin/node tools/night-icon-sweep.mjs
 * 输出：test-runs/night-skin-probe/icon-sweep.json + 控制台报告
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  await new Promise(res => s.close(res))
  return port
}
const APP_PORT = await freePort()
const debugPort = await freePort()
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const child = spawn(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  ['desktop/main.cjs', '--window-size=1480,940', `--remote-debugging-port=${debugPort}`],
  { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: 'ignore' })
let cdp = null
for (let i = 0; i < 90 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { child.kill(); throw new Error('CDP 连接失败') }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev('!!window.__notekitApp').catch(() => false)) break } catch {}; await sleeps(1000) }

// 走 note-command 给当日页补几条勾选/普通条目，覆盖 svg_dot 等内容图标
try {
  const { readFile } = await import('node:fs/promises')
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
  let status = null
  for (let i = 0; i < 40; i++) {
    try { status = await post({ action: 'status' }); break }
    catch (e) { if (!/尚未就绪/.test(e.message)) throw e; await sleeps(1000) }
  }
  const today = new Date().toISOString().slice(0, 10)
  await post({
    action: 'append', dbid: status.dbid, date: today, title: '图标清扫对照条目',
    blocks: [
      { text: '未勾选条目（对照 svg_dot）', checkbox: true },
      { text: '已勾选条目（对照 svg_dot 选中态）', checkbox: true },
      { text: '普通条目（对照正文与加粗）', bold: true },
    ],
    requestId: createHash('sha256').update(`icon-sweep-${today}`).digest('hex'),
  })
  console.log('已灌入对照条目', today)
} catch (e) { console.log('灌内容跳过:', e.message) }

const SWEEP = `(() => {
  const parse = c => { const m=(c||'').match(/rgba?\\(([^)]+)\\)/); if(!m) return null
    const p=m[1].split(',').map(Number); if(p.length===4&&p[3]===0) return null; return p }
  const hex = c => c ? '#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('') : null
  const lum = c => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]) }
  const cx=(a,b)=>{ if(!a||!b) return null; const la=lum(a),lb=lum(b),hi=Math.max(la,lb),lo=Math.min(la,lb); return Math.round(((hi+.05)/(lo+.05))*100)/100 }
  const effBg = el => { let n=el.parentElement
    while(n){ const c=parse(getComputedStyle(n).backgroundColor); if(c&&(c.length<4||c[3]>=0.9)) return c; n=n.parentElement }
    return parse(getComputedStyle(document.body).backgroundColor) }
  const cls = el => { const s=(typeof el.className==='string'?el.className:(el.className&&el.className.baseVal)||'').trim()
    return s.split(/\\s+/).filter(c=>c&&!c.startsWith('css-')).slice(0,3).join('.') }
  const icons=[]; const lines=[]; const seenI=new Set(); const seenL=new Set()
  for (const el of document.querySelectorAll('svg')) {
    const r=el.getBoundingClientRect()
    if (r.width<5||r.height<5||r.width*r.height<60) continue
    const cs0=getComputedStyle(el)
    if (cs0.visibility==='hidden'||cs0.display==='none') continue
    if (el.offsetParent===null && cs0.position!=='fixed') continue
    let fg=parse(cs0.fill)
    if (!fg||(fg.length===4&&fg[3]===0)) fg=parse(cs0.stroke)
    if (!fg) fg=parse(cs0.color)
    const bg=effBg(el)
    const c=cx(fg,bg)
    if (c===null||c>=3) continue
    const key=cls(el)+'|'+(fg&&fg.join(','))+'|'+(bg&&bg.join(','))
    if (seenI.has(key)) continue
    seenI.add(key)
    const disabled=!!el.closest('[disabled],[aria-disabled="true"],.Mui-disabled')
    icons.push({ sel: cls(el)||'(no class)', fg: hex(fg), bg: hex(bg), contrast: c, disabled,
      parent: cls(el.parentElement)||el.parentElement.tagName.toLowerCase(),
      hiddenUntilHover: parseFloat(cs0.opacity)===0 })
  }
  for (const el of document.querySelectorAll('body *')) {
    const r=el.getBoundingClientRect()
    if (r.width*r.height<4000) continue
    const cs=getComputedStyle(el)
    if (cs.visibility==='hidden'||cs.display==='none') continue
    const bg=effBg(el)
    const sides=[['top',cs.borderTopWidth,cs.borderTopColor,cs.borderTopStyle],['bottom',cs.borderBottomWidth,cs.borderBottomColor,cs.borderBottomStyle],
      ['left',cs.borderLeftWidth,cs.borderLeftColor,cs.borderLeftStyle],['right',cs.borderRightWidth,cs.borderRightColor,cs.borderRightStyle],
      ['outline',cs.outlineWidth,cs.outlineColor,cs.outlineStyle]]
    for (const [side,w,col,st] of sides) {
      const wn=parseFloat(w)||0
      if (wn<1||st==='none'||st==='hidden') continue
      const pc=parse(col)
      if (!pc||(pc.length===4&&pc[3]<0.4)) continue
      const c=cx(pc,bg)
      if (c===null||c<=9) continue
      const key=cls(el)+'|'+side+'|'+(pc.join(','))
      if (seenL.has(key)) continue
      seenL.add(key)
      lines.push({ sel: (el.tagName.toLowerCase()+'.'+cls(el)).slice(0,56), side, color: hex(pc), bg: hex(bg), contrast: c,
        w: Math.round(r.width), h: Math.round(r.height), widthCss: w })
    }
  }
  return { icons, lines }
})()`

const setTheme = async t => {
  await ev(`localStorage.setItem('nightMode', ${t === 'night' ? "'on'" : "'off'"})`)
  await cdp.call('Page.reload', {})
  await sleeps(1500)
  for (let i = 0; i < 90; i++) { try { if (await ev('!!window.__notekitApp').catch(() => false)) break } catch {}; await sleeps(1000) }
  await sleeps(2000)
}

const ROUTES = [null, '/topics', '/diaries']
const report = {}
for (const theme of ['night', 'day']) {
  await setTheme(theme)
  report[theme] = {}
  for (const route of ROUTES) {
    if (route) { await ev(`(async () => { try { window.__notekitApp.addons.router.to('${route}') } catch {} })()`); await sleeps(3000) }
    report[theme][route || '(default)'] = await ev(SWEEP)
  }
}

await writeFile(path.join(outDir, 'icon-sweep.json'), JSON.stringify(report, null, 2))
for (const theme of ['night', 'day']) {
  console.log(`\n########## ${theme.toUpperCase()} ##########`)
  for (const [route, { icons, lines }] of Object.entries(report[theme])) {
    console.log(`\n=== ${route}: 图标 ${icons.length} · 过亮线条 ${lines.length} ===`)
    for (const h of icons) {
      console.log(`  [icon ${String(h.contrast).padStart(5)}] fg=${h.fg} bg=${h.bg} ${h.disabled ? '[disabled]' : ''}${h.hiddenUntilHover ? '[hover才显形]' : ''} ${h.parent} > svg.${h.sel.slice(0, 44)}`)
    }
    for (const l of lines) {
      console.log(`  [线 ${String(l.contrast).padStart(5)}] ${l.side} ${l.widthCss} ${l.color} on ${l.bg}  ${l.sel}  (${l.w}x${l.h})`)
    }
  }
}
child.kill()
