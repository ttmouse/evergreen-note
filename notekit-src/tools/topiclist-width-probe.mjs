/**
 * 主题列表宽度探针（隔离实例 + CDP，不碰用户数据）
 *
 * 目的：量测「主题列表」表格在给定窗口宽度下的真实布局——
 *   表格总宽 vs 容器可视宽（是否产生横向滚动）、各列实际宽度、Title 列占用。
 * 用法：node tools/topiclist-width-probe.mjs [窗口宽度]
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'topiclist-width')
const winWidth = Number(process.argv[2] || 1480)
const sleeps = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close((e) => (e ? rej(e) : res())))
  return port
}

const APP_PORT = await freePort()
const debugPort = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const childEnv = {
  ...process.env,
  NOTEKIT_PORT: String(APP_PORT),
  NOTEKIT_USER_DATA: profile,
  NOTEKIT_DEV_MODE: '1',
  ELECTRON_DISABLE_SANDBOX: '1',
}
delete childEnv.ELECTRON_RUN_AS_NODE
delete childEnv.NODE_OPTIONS

const child = spawn(
  ELECTRON_BIN,
  ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', `--window-size=${winWidth},900`, 'desktop/main.cjs', `--remote-debugging-port=${debugPort}`],
  { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }
)
let logs = ''
child.stdout.on('data', (d) => (logs += d))
child.stderr.on('data', (d) => (logs += d))

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { console.error('无法连接 CDP\n' + logs); child.kill(); process.exit(2) }
const ev = (e) => cdp.evaluate(e)
for (let i = 0; i < 90; i++) {
  try { if (await ev(`!!window.__notekitApp`)) break } catch {}
  await sleeps(1000)
}
for (let i = 0; i < 60; i++) {
  try { if (await ev(`!!window.__notekitApp.addons.topic`)) break } catch {}
  await sleeps(500)
}
// 等主题列表真正挂载（应用初始化 + 插件注册完成后才会渲染表格，过早量测会拿到空页）
for (let i = 0; i < 60; i++) {
  try { if (await ev(`!!document.querySelector('.MuiTableContainer-root table')`)) break } catch {}
  await sleeps(1000)
}

const measureExpr = `(() => {
  const c = document.querySelector('.MuiTableContainer-root')
  const t = c && c.querySelector('table')
  const rect = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), l: Math.round(r.left), r: Math.round(r.right) } }
  return {
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    container: c ? { clientWidth: c.clientWidth, scrollWidth: c.scrollWidth, overflowX: getComputedStyle(c).overflowX, ...rect(c) } : null,
    table: t ? { offsetWidth: Math.round(t.offsetWidth), scrollWidth: t.scrollWidth, tableLayout: getComputedStyle(t).tableLayout, cssWidth: getComputedStyle(t).width, ...rect(t) } : null,
    ths: c ? [...c.querySelectorAll('thead th')].map(th => ({ text: (th.innerText || '').trim(), ...rect(th) })) : [],
    firstRowCells: c ? [...c.querySelectorAll('tbody tr:first-child > *')].map(td => ({ text: (td.innerText || '').trim().slice(0, 24), ...rect(td) })) : [],
    titleLink: (() => { const a = document.querySelector('.topic-title-link'); return a ? rect(a) : null })(),
    checkbox: (() => {
      const box = document.querySelector('.MuiTableContainer-root tbody .MuiCheckbox-root')
      const cell = document.querySelector('.MuiTableContainer-root tbody tr > *:first-child')
      return box && cell ? { box: rect(box), cell: rect(cell), clipped: box.getBoundingClientRect().right > cell.getBoundingClientRect().right } : null
    })(),
    titleOverflow: (() => {
      const a = document.querySelector('.topic-title-link')
      return a ? { scrollW: a.scrollWidth, clientW: a.clientWidth, ellipsis: a.scrollWidth > a.clientWidth } : null
    })(),
    rows: c ? c.querySelectorAll('tbody tr').length : 0,
    bodyText: document.body.innerText.slice(0, 200)
  }
})()`

const report = { winWidth, stages: [] }

// 阶段 1：空库默认页
await ev(`(() => { try { const r = window.__notekitApp.addons.router; if (r && !document.querySelector('.MuiTableContainer-root')) r.to('/topics') } catch (e) {} return !!document.querySelector('.MuiTableContainer-root') })()`)
await sleeps(1200)
report.stages.push({ name: 'empty', data: await ev(measureExpr) })

// 阶段 2：注入若干长标题主题后量测
await ev(`(() => {
  const topic = window.__notekitApp.addons.topic
  const names = [
    '10-06 义乌AI项目合作及资源对接会议纪要',
    '2026-10-07 AI 生态平台商业模式讨论',
    'WorkBuddy（腾讯）产品能力与合作可能性调研',
    '懂云平台框架',
    '商业模式'
  ]
  const errors = []
  names.forEach(n => { try { const r = topic.createTopic(n); if (!r) errors.push(n) } catch (e) { errors.push(n + ':' + e.message) } })
  return { count: topic.getList().length, errors }
})()`)
await sleeps(1500)
report.stages.push({ name: 'withLongTitles', data: await ev(measureExpr) })

// 阶段 2b：把首行标题替换成超长文本，验证 fixed 布局下列宽不被内容撑开（只影响本实例 DOM）
await ev(`(() => {
  const a = document.querySelector('.topic-title-link')
  if (!a || !a.firstElementChild) return false
  a.firstElementChild.textContent = '这是一个非常长的主题名称'.repeat(6)
  return true
})()`)
await sleeps(800)
report.stages.push({ name: 'longTitleInjected', data: await ev(measureExpr) })

// 阶段 3：在多个视口宽度下，对比不同列宽方案的布局结果（CSS 覆盖仅注入本探针页面）
const widths = (process.env.PROBE_WIDTHS || '800,900,1000,1200,1480,1920,2560').split(',').map(Number)
const T = '.MuiTableContainer-root'
const schemes = {
  A_现状: '',
  B_去掉minWidth: `${T} table { min-width: 0 !important; }`,
  C_fixed_全百分比: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 4% !important; }
    ${T} tr > *:nth-child(2) { width: 46% !important; }
    ${T} tr > *:nth-child(3) { width: 10% !important; }
    ${T} tr > *:nth-child(4) { width: 12% !important; }
    ${T} tr > *:nth-child(5) { width: 14% !important; }
    ${T} tr > *:nth-child(6) { width: 14% !important; }`,
  D_fixed_其他列固定: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 52px !important; }
    ${T} tr > *:nth-child(3) { width: 88px !important; }
    ${T} tr > *:nth-child(4) { width: 100px !important; }
    ${T} tr > *:nth-child(5) { width: 120px !important; }
    ${T} tr > *:nth-child(6) { width: 120px !important; }`,
  E_auto_标题40pct: `
    ${T} table { min-width: 0 !important; }
    ${T} tr > *:nth-child(2) { width: 40% !important; }`,
  F_勾选固定_余百分比45: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 52px !important; }
    ${T} tr > *:nth-child(2) { width: 45% !important; }
    ${T} tr > *:nth-child(3) { width: 10% !important; }
    ${T} tr > *:nth-child(4) { width: 12% !important; }
    ${T} tr > *:nth-child(5) { width: 15% !important; }
    ${T} tr > *:nth-child(6) { width: 15% !important; }`,
  G_勾选固定_余百分比42: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 52px !important; }
    ${T} tr > *:nth-child(2) { width: 42% !important; }
    ${T} tr > *:nth-child(3) { width: 11% !important; }
    ${T} tr > *:nth-child(4) { width: 13% !important; }
    ${T} tr > *:nth-child(5) { width: 16% !important; }
    ${T} tr > *:nth-child(6) { width: 16% !important; }`,
  H_fixed_标题百分比_余固定px: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 52px !important; }
    ${T} tr > *:nth-child(2) { width: 40% !important; }
    ${T} tr > *:nth-child(3) { width: 88px !important; }
    ${T} tr > *:nth-child(4) { width: 100px !important; }
    ${T} tr > *:nth-child(5) { width: 120px !important; }
    ${T} tr > *:nth-child(6) { width: 120px !important; }`,
  J_auto_标题百分比_余固定px: `
    ${T} table { min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 52px !important; }
    ${T} tr > *:nth-child(2) { width: 40% !important; }
    ${T} tr > *:nth-child(3) { width: 88px !important; }
    ${T} tr > *:nth-child(4) { width: 100px !important; }
    ${T} tr > *:nth-child(5) { width: 120px !important; }
    ${T} tr > *:nth-child(6) { width: 120px !important; }`,
  K_勾选固定加max: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 52px !important; max-width: 52px !important; }
    ${T} tr > *:nth-child(2) { width: 40% !important; }
    ${T} tr > *:nth-child(3) { width: 11% !important; }
    ${T} tr > *:nth-child(4) { width: 12.5% !important; }
    ${T} tr > *:nth-child(5) { width: 15% !important; }
    ${T} tr > *:nth-child(6) { width: 15% !important; }`,
  L_勾选百分比加min: `
    ${T} table { table-layout: fixed !important; min-width: 0 !important; }
    ${T} tr > *:nth-child(1) { width: 4.2% !important; min-width: 42px !important; }
    ${T} tr > *:nth-child(2) { width: 40% !important; }
    ${T} tr > *:nth-child(3) { width: 11% !important; }
    ${T} tr > *:nth-child(4) { width: 12.5% !important; }
    ${T} tr > *:nth-child(5) { width: 15% !important; }
    ${T} tr > *:nth-child(6) { width: 15% !important; }`,
}
report.widthScan = []
const setProbeCss = (css) => ev(`(() => {
  let el = document.getElementById('probe-css')
  if (!el) { el = document.createElement('style'); el.id = 'probe-css'; document.head.appendChild(el) }
  el.textContent = ${JSON.stringify(css)}
  return true
})()`)
for (const [name, css] of Object.entries(schemes)) {
  if (process.env.PROBE_SCHEMES && !process.env.PROBE_SCHEMES.split(',').includes(name[0])) continue
  await setProbeCss(css)
  const rows = []
  for (const w of widths) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleeps(500)
    const d = await ev(measureExpr)
    rows.push({
      width: w,
      container: d.container?.clientWidth,
      overflow: d.container ? d.container.scrollWidth - d.container.clientWidth : null,
      cols: d.ths.map((t) => `${t.text || 'sel'}:${t.w}`).join(' '),
      checkbox: d.checkbox,
      titleOverflow: d.titleOverflow,
      lastColRight: d.ths.length ? d.ths[d.ths.length - 1].r : null,
      containerRight: d.container?.r,
    })
  }
  report.widthScan.push({ scheme: name, rows })
}
await setProbeCss('')
await cdp.call('Emulation.clearDeviceMetricsOverride', {})

// 阶段 4：截图存档（浅色 / 夜间，1480 宽）——设计规范 §8 第 7 条要求留截图证据
if (process.env.PROBE_SHOTS === '1') {
  const shoot = async (file, night) => {
    await ev(`(() => { document.body.classList.toggle('night-mode', ${night}); return document.body.className })()`)
    await sleeps(800)
    const { data } = await cdp.call('Page.captureScreenshot', { format: 'png' })
    await writeFile(path.join(outDir, file), Buffer.from(data, 'base64'))
  }
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1480, height: 900, deviceScaleFactor: 1, mobile: false })
  await ev(`(() => { try { const r = window.__notekitApp.addons.router; if (r && !document.querySelector('.MuiTableContainer-root')) r.to('/topics') } catch (e) {} return true })()`)
  await sleeps(1000)
  await shoot('topiclist-light-1480.png', false)
  await shoot('topiclist-night-1480.png', true)
  await cdp.call('Emulation.clearDeviceMetricsOverride', {})
}

await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
report.errors = cdp.events
  .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
  .map((e) => (e.params.exceptionDetails?.exception?.description || e.params.args?.map((a) => a.value).join(' ')))
  .slice(0, 10)
console.log(JSON.stringify(report, null, 2))
cdp.close()
child.kill()
process.exit(0)
