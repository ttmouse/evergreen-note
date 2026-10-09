/**
 * 在**真 App** 里验证 AI 面板的活动轨道（不是预览页，不是单测）。
 *
 * 用法（要求目标实例带 --remote-debugging-port）：
 *   node tools/ai-activity-verify.mjs --port 9333 --shot /path/to/dir [--prompt "..."]
 *
 * 前提：隔离实例必须满足
 *   NOTEKIT_USER_DATA=<独立目录> NOTEKIT_PORT=<独立端口> NOTEKIT_ACP_CWD=<沙箱>
 * ⚠️ 安全约束：agentEnv() 只给 agent 传 PATH，**不给它传 profile** ——
 *    所以 agent 手里的 `ev` 指向的是全局默认 profile（= 正在跑的正式实例），
 *    不是这个隔离实例。因此默认提示词只让它在沙箱目录里跑 shell，明确禁止碰笔记。
 *
 * 做三件事：
 *   1. 开面板 → 发一句提示 → 轮询 store，记录 事件 → 相位 的实时演变
 *   2. 在「第一个工具调用出现」和「回合结束」两个时刻各截一张图
 *   3. 量轨道 DOM 几何（头像/重叠/卡片堆/胶囊/动画）
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}
const PORT = arg('port', '9333')
const SHOT_DIR = arg('shot', '/tmp/nk-activity-shots')
const PROMPT =
  arg('prompt', null) ||
  '这是隔离测试环境，知识库是空的，请只做下面一件事：' +
    '在当前工作目录用 shell 依次执行 `pwd`、`ls -la`、`date` 三条命令，然后一句话总结输出。' +
    '不要读写任何笔记，不要调用 ev，不要访问知识库。'

mkdirSync(SHOT_DIR, { recursive: true })

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const target = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools:'))
if (!target) throw new Error(`端口 ${PORT} 上没有页面目标`)

const sock = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej })
let next = 0
const pending = new Map()
const exceptions = []
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') {
    exceptions.push(m.params.exceptionDetails?.exception?.description || 'exception')
  }
}
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next
    pending.set(id, { resolve, reject })
    sock.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression, timeout = 60000) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed')
  return r.result.value
}
const shoot = async (name) => {
  const r = await call('Page.captureScreenshot', { format: 'png' })
  const file = path.join(SHOT_DIR, name)
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  return file
}

await call('Runtime.enable')

// ------------------------------------------------------------------ 1. 开面板 + 发提示

const opened = await evaluate(`(async () => {
  const S = window.__nkAiPanelStore
  if (!S) return JSON.stringify({ error: 'window.__nkAiPanelStore 不存在' })
  S.open = true
  await new Promise(r => setTimeout(r, 400))
  const area = document.querySelector('.ai-panel-area')
  if (!area) return JSON.stringify({ error: '面板没挂上（.ai-panel-area 不存在）' })
  S.clear()
  S.send(${JSON.stringify(PROMPT)}, null)
  return JSON.stringify({ opened: true, areaWidth: Math.round(area.getBoundingClientRect().width) })
})()`)
console.log('open:', opened)
const openInfo = JSON.parse(opened)
if (openInfo.error) {
  console.log(JSON.stringify({ fatal: openInfo.error, runtimeExceptions: exceptions }, null, 2))
  process.exit(1)
}

// ------------------------------------------------------------------ 2. 轮询事件 → 相位

const snapshot = `(() => {
  const S = window.__nkAiPanelStore
  const area = document.querySelector('.ai-panel-area')
  const avatars = area ? area.querySelectorAll('[title="thinking"],[title="exploring"],[title="making"],[title="running"],[title="generic"]') : []
  const alive = area ? area.querySelector('.nk-av-alive') : null
  return JSON.stringify({
    busy: S.busy,
    state: S.state,
    items: S.items.map(i => ({ k: i.kind, tk: i.toolKind, title: (i.title || '').slice(0, 44), status: i.status })),
    avatarCount: avatars.length,
    aliveCount: area ? area.querySelectorAll('.nk-av-alive').length : 0,
    label: (() => { const l = area && area.querySelector('.nk-shimmer'); return l ? l.textContent.trim() : (area ? (area.querySelector('button[aria-expanded]')?.innerText.trim() || '') : '') })(),
    deckFront: area ? area.querySelectorAll('.nk-deck-deal').length : 0,
    deckRows: area && area.querySelector('.nk-deck-deal') ? area.querySelector('.nk-deck-deal').innerText.replace(/\\n/g, ' | ') : null,
  })
})()`

const timeline = []
let shotLive = null
let shotSettled = null
const t0 = Date.now()
let sawTool = false

for (let i = 0; i < 150; i++) {
  let snap
  try {
    snap = JSON.parse(await evaluate(snapshot, 15000))
  } catch (e) {
    timeline.push({ t: ((Date.now() - t0) / 1000).toFixed(1), note: 'eval 失败：' + e.message.slice(0, 120) })
    break
  }
  const last = timeline[timeline.length - 1]
  const fingerprint = `${snap.items.length}|${snap.avatarCount}|${snap.label}|${snap.items.map((x) => x.status).join(',')}`
  if (!last || last.fp !== fingerprint) {
    timeline.push({
      t: ((Date.now() - t0) / 1000).toFixed(1),
      fp: fingerprint,
      tools: snap.items.filter((x) => x.k === 'tool').length,
      thoughts: snap.items.filter((x) => x.k === 'thought').length,
      avatarCount: snap.avatarCount,
      aliveCount: snap.aliveCount,
      label: snap.label,
      deckFront: snap.deckFront,
      // 记下 agent 实际发的 toolKind —— 相位分类全靠它，落成 generic 就说明没对上
      toolItems: snap.items.filter((x) => x.k === 'tool').map((x) => ({ tk: x.tk, title: x.title, status: x.status })),
    })
  }
  if (!sawTool && snap.items.some((x) => x.k === 'tool')) {
    sawTool = true
    shotLive = await shoot('01-live.png')
    timeline.push({ t: ((Date.now() - t0) / 1000).toFixed(1), note: '第一个工具调用出现 → 已截图 01-live.png', deckRows: snap.deckRows })
  }
  if (!snap.busy && sawTool) {
    await new Promise((r) => setTimeout(r, 700))
    shotSettled = await shoot('02-settled.png')
    break
  }
  if (Date.now() - t0 > 240000) {
    timeline.push({ note: '超时（240s）' })
    break
  }
  await new Promise((r) => setTimeout(r, 700))
}

// ------------------------------------------------------------------ 3. 收尾：几何 + 展开交互

const geometry = JSON.parse(
  await evaluate(`(() => {
  const area = document.querySelector('.ai-panel-area')
  const avatars = Array.from(area.querySelectorAll('[title="thinking"],[title="exploring"],[title="making"],[title="running"],[title="generic"]'))
  const svg = avatars[0] && avatars[0].querySelector('svg')
  const pill = Array.from(area.querySelectorAll('button')).find(b => /^\\+\\d+$/.test(b.textContent))
  const deck = area.querySelector('.nk-deck-deal')
  const wrap = deck && deck.parentElement
  return JSON.stringify({
    avatars: avatars.map(a => {
      const s = getComputedStyle(a); const b = a.getBoundingClientRect()
      return Math.round(b.width) + 'x' + Math.round(b.height) + ' ml=' + s.marginLeft + ' anim=' + s.animationName
    }),
    icon: svg ? Math.round(svg.getBoundingClientRect().width) + 'x' + Math.round(svg.getBoundingClientRect().height) : null,
    pill: pill ? pill.textContent + ' ' + Math.round(pill.getBoundingClientRect().width) + 'x' + Math.round(pill.getBoundingClientRect().height) : null,
    backCards: wrap ? Array.from(wrap.children).filter(c => c !== deck && c.tagName === 'DIV').map(c => {
      const s = getComputedStyle(c); return 'top=' + s.top + ' left=' + s.left + ' right=' + s.right + ' bottom=' + s.bottom
    }) : [],
    panelText: area.innerText.replace(/\\n/g, ' | ').slice(0, 400),
  })
})()`),
)

const expand = JSON.parse(
  await evaluate(`(async () => {
  const area = document.querySelector('.ai-panel-area')
  const btn = area.querySelector('button[aria-expanded]')
  if (!btn) return JSON.stringify({ note: '没找到可展开的轨道标题' })
  const before = btn.getAttribute('aria-expanded')
  btn.click()
  // React 的状态更新不在点击的同一个 tick —— 必须等一帧再读，否则永远读到旧值
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 250)))
  const after = area.querySelector('button[aria-expanded]').getAttribute('aria-expanded')
  const borders = Array.from(area.querySelectorAll('div')).filter(d => getComputedStyle(d).borderLeftWidth === '1px' && getComputedStyle(d).borderLeftStyle === 'solid').length
  const rows = Array.from(area.querySelectorAll('.nk-arow span')).map(s => s.textContent).filter(Boolean)
  return JSON.stringify({ before, ariaExpanded: after, timelineBorders: borders, rows: rows.slice(0, 8) })
})()`),
)

const report = {
  target: target.url,
  prompt: PROMPT,
  timeline,
  screenshots: [shotLive, shotSettled].filter(Boolean),
  geometry,
  expand,
  runtimeExceptions: exceptions,
}
// 报告同时落盘：stdout 里混着进度行，解析容易踩坑
writeFileSync(path.join(SHOT_DIR, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
sock.close()
