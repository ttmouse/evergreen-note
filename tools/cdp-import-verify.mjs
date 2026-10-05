#!/usr/bin/env node
/**
 * 一步完成：导入 V1 全库 → 验证 `ori` 是否被还原成 `leaves`。
 *
 * 走 CDP 直连 Electron 窗口（侧边栏浏览器会回收长任务标签页，跑不完 9 万节点）。
 *
 * 验证方式自包含，不依赖外部查询：
 *   1. 从源数据里挑一个「有 ori、且没有 leaves」的节点作为探针
 *   2. 导入完成后，从应用**自己的本地库**（Dexie）按 ky 取回该节点
 *   3. 对比 ori 与 leaves
 *
 * 用法: node cdp-import-verify.mjs <debugPort> <文件URL路径> [超时秒]
 */
const port = process.argv[2] || '9335'
const fileUrl = process.argv[3] || '/static/import-test/v1-clean.json'
const timeoutSec = Number(process.argv[4] || 300)

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('找不到页面目标')
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
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
async function ev(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description)
  return r.result?.result?.value
}

await send('Network.enable', {})
await send('Network.clearBrowserCache', {})
await send('Page.enable', {})
await send('Page.reload', { ignoreCache: true })
let hook = false
for (let i = 0; i < 30 && !hook; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  hook = await ev('!!window.__notekitApp')
}
console.log('调试入口:', hook, ' 脚本:', await ev('(document.querySelector("script[type=module]")||{}).src'))
if (!hook) throw new Error('调试入口不可用')

// 1) 取源数据并挑探针
const meta = await ev(
  `(async () => {
     const r = await fetch(${JSON.stringify(fileUrl)}); window.__v1text = await r.text();
     const d = JSON.parse(window.__v1text); const list = d.list || d;
     const probe = list.find(n => n && typeof n.ori === 'string' && n.ori && !('leaves' in n));
     window.__probe = probe ? probe.ky : null;
     return { total: list.length, dbid: d.dbid || null,
              probeKy: probe ? probe.ky : null, probeOri: probe ? probe.ori : null } })()`,
  true
)
console.log(`源数据: ${meta.total} 个节点，dbid=${meta.dbid}`)
console.log(`探针节点（源里只有 ori、没有 leaves）: ky=${meta.probeKy}  ori=${JSON.stringify(meta.probeOri)}`)

// 2) 导入
console.log('开始导入…')
const t0 = Date.now()
await ev(
  `(() => { const app = window.__notekitApp;
     window.__imp = { status: 'importing', startedAt: Date.now() };
     app.addons.imports.invokeMultiHandler({ type: 'fulljson', source: window.__v1text })
       .then(() => { window.__imp.status='done'; window.__imp.ms = Date.now()-window.__imp.startedAt })
       .catch(e => { window.__imp.status='error'; window.__imp.error = String((e&&e.message)||e) });
     return 'started' })()`
)
const deadline = Date.now() + timeoutSec * 1000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10000))
  const s = await ev('window.__imp')
  console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] ${s.status}`)
  if (s.status === 'done' || s.status === 'error') break
}

// 3) 从应用本地库取回探针节点做对比
const verify = await ev(
  `(async () => {
     const app = window.__notekitApp;
     const ky = window.__probe;
     const conns = app.addons.dbDisk.connections;
     const out = { dbKeys: Object.keys(conns), probeKy: ky };
     for (const [dbid, tables] of Object.entries(conns)) {
       if (!tables || !tables.node) continue;
       try {
         const rec = ky ? await tables.node.get(ky) : null;
         const total = await tables.node.count();
         const withLeaves = await tables.node.filter(r => Array.isArray(r.leaves) && r.leaves.length > 0).count();
         out[dbid] = { total, withLeaves, rec: rec ? { ky: rec.ky, ori: rec.ori, leaves: rec.leaves } : null };
       } catch (e) { out[dbid] = { error: String(e && e.message) } }
     }
     return out })()`,
  true
)

console.log('\n===== 验证结果 =====')
console.log(JSON.stringify(verify, null, 2))
ws.close()