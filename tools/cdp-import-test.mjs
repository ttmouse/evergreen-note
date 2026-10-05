#!/usr/bin/env node
/**
 * 通过 CDP 直连 Electrow 窗口，跑一次数据导入并轮询结果。
 *
 * 为什么要这条通道：Cindy 侧边栏浏览器会把长任务的标签页回收掉，
 * 9 万节点的导入跑不完。Electron 窗口是真实窗口，不会被回收。
 *
 * 依赖：Node 内置 fetch + WebSocket（Node 22+）；目标应用需带 --remote-debugging-port。
 *
 * 用法: node cdp-import-test.mjs <debugPort> <要导入的 URL 路径> [超时秒数]
 */
const port = process.argv[2] || '9334'
const fileUrl = process.argv[3] || '/static/import-test/v1-clean.json'
const timeoutSec = Number(process.argv[4] || 900)

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('找不到页面目标')
  process.exit(1)
}
console.log(`连接到: ${page.title}  ${page.url}`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}

function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true,
  })
  if (r.result?.exceptionDetails) {
    throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails))
  }
  return r.result?.result?.value
}

// 先强制绕缓存重载：Electron 会缓存旧的 index-*.js，
// 否则页面跑的是改代码之前的产物（表现为调试入口不存在）。
await send('Network.enable', {})
await send('Network.clearBrowserCache', {})
await send('Page.enable', {})
await send('Page.reload', { ignoreCache: true })
console.log('已清缓存并强制重载，等待应用就绪…')

let hasHook = false
for (let i = 0; i < 30 && !hasHook; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  hasHook = await evaluate('!!window.__notekitApp')
}
const scriptSrc = await evaluate('(document.querySelector("script[type=module]")||{}).src')
console.log('调试入口 __notekitApp:', hasHook, ' 当前脚本:', scriptSrc)
if (!hasHook) {
  console.error('调试入口不可用（可能仍是缓存产物），中止')
  process.exit(1)
}

console.log(`取文件 ${fileUrl} …`)
const t0 = Date.now()
const meta = await evaluate(
  `(async () => { const r = await fetch(${JSON.stringify(fileUrl)}); window.__v1text = await r.text();
     const d = JSON.parse(window.__v1text);
     return { chars: window.__v1text.length, listLen: (d.list || d).length, dbid: d.dbid || null } })()`,
  true
)
console.log(`  解析完成 ${meta.chars} 字符，${meta.listLen} 个节点，dbid=${meta.dbid}（${Date.now() - t0} ms）`)

console.log('启动导入（后台执行，不阻塞）…')
await evaluate(
  `(() => { const app = window.__notekitApp;
     window.__imp = { status: 'importing', startedAt: Date.now(), emitted: 0 };
     app.addons.imports.invokeMultiHandler({ type: 'fulljson', source: window.__v1text })
       .then(() => { window.__imp.status = 'done'; window.__imp.ms = Date.now() - window.__imp.startedAt })
       .catch(e => { window.__imp.status = 'error'; window.__imp.error = String((e && e.message) || e) });
     return 'started' })()`
)

const deadline = Date.now() + timeoutSec * 1000
let last = ''
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10000))
  const st = await evaluate(
    `(() => { const s = window.__imp || {};
       const app = window.__notekitApp;
       let mem = null;
       try { mem = Object.keys(app.addons.dbMemory.items || {}).length } catch (e) {}
       return { status: s.status, ms: s.ms || (Date.now() - (s.startedAt || 0)), error: s.error || null, memItems: mem,
                errs: (window.__errs || []).length } })()`
  )
  const line = JSON.stringify(st)
  if (line !== last) {
    console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${line}`)
    last = line
  }
  if (st.status === 'done' || st.status === 'error') break
}

const final = await evaluate(
  `(() => { const s = window.__imp || {}; const app = window.__notekitApp;
     let mem = null;
     try { mem = Object.keys(app.addons.dbMemory.items || {}).length } catch (e) {}
     return { ...s, memItems: mem, errs: (window.__errs || []).slice(0, 2) } })()`
)
console.log('\n最终状态:', JSON.stringify(final, null, 2))
ws.close()