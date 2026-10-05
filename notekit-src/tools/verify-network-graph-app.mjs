import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const [profile, output] = process.argv.slice(2)
assert.ok(profile && output, 'Usage: node tools/verify-network-graph-app.mjs ISOLATED_PROFILE OUTPUT_DIR')
assert.ok(path.resolve(profile) !== path.join(process.env.HOME, 'Library/Application Support/NotekitDev'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const appPort = await freePort(), debugPort = await freePort()
await mkdir(output, { recursive: true })
const electron = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const child = spawn(electron, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_DEV_MODE: '1', NOTEKIT_PORT: String(appPort), NOTEKIT_USER_DATA: path.resolve(profile), NOTEKIT_START_URL: `http://127.0.0.1:${appPort}/static/diaries?lib=1-db-1-v2main` },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = '', c
child.stdout.on('data', data => { logs += data })
child.stderr.on('data', data => { logs += data })
const report = { appPort, debugPort, checks: {} }
async function waitFor(expression, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const value = await c.evaluate(expression); if (value) return value } catch {}
    await delay(200)
  }
  throw new Error(`Timed out: ${expression}`)
}
const graph = `document.querySelector('[data-network-graph="sigma"]')?.__networkGraph`
async function screenshot(name) {
  const shot = await c.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(output, name), Buffer.from(shot.data, 'base64'))
}
try {
  for (let i = 0; i < 100 && !c; i++) { try { c = await connect(debugPort) } catch { await delay(200) } }
  assert.ok(c, logs.slice(-1500))
  await waitFor('window.__notekitApp?.addons?.dbMemory?.initFinished && window.__notekitApp.addons.topic.getList().length > 2000', 45000)
  report.library = await c.evaluate('window.__notekitApp.addons.dbDisk.primaryId')
  const lazyResources = await c.evaluate('performance.getEntriesByType("resource").map(entry => entry.name).filter(name => /SigmaGraph|NetworkGraphCompSigma|graph-layout/.test(name))')
  assert.equal(lazyResources.length, 0, 'Sigma must stay unloaded away from graph route')
  report.checks.lazyLoading = true
  await c.evaluate('window.__graphOpenedAt = performance.now(); window.__notekitApp.addons.router.to("/graphs"); true')
  await waitFor(`!!(${graph})`)
  report.graph = await c.evaluate(`(() => { const g = ${graph}; return { nodes: g.graph.order, edges: g.graph.size, routeMs: performance.now() - window.__graphOpenedAt, metrics: {...g.metrics}, size:g.renderer.getDimensions() } })()`)
  assert.ok(report.graph.nodes > 2000 && report.graph.edges > 2000)
  await delay(800)
  await screenshot('app-light.png')
  await c.evaluate(`${graph}.pause(); true`)
  const identity = await c.evaluate('(() => { const g = window.__notekitApp.addons.networkGraph; return g.getNodesAndEdges() === g.getNodesAndEdges() })()')
  assert.ok(identity)
  report.checks.stableSnapshot = true
  await c.evaluate(`(() => {
    const a = window.__notekitApp.addons;
    for (const name of ['Graph Acceptance A', 'Graph Acceptance B', 'Graph Acceptance C']) a.topic.createTopic(name);
    a.dbMemory.saveItem({ky:'graph-app-check-link',pky:a.topic.getTopic('Graph Acceptance A').ky,status:1,weight:1,
      ori:'Graph Acceptance B',mentions:['Graph Acceptance B'],leaves:[{text:''},a.bilink.createElement({topic:'Graph Acceptance B'}),{text:''}]});
    return true;
  })()`)
  await waitFor(`${graph}.graph.hasEdge('graph acceptance a','graph acceptance b')`)
  report.checks.liveReferenceAddition = true
  report.retarget = await c.evaluate(`(async () => {
    const a = window.__notekitApp.addons, start = performance.now(), item = a.dbMemory.getItem('graph-app-check-link');
    a.dbMemory.saveItem({...item,ori:'Graph Acceptance C',mentions:['Graph Acceptance C'],leaves:[{text:''},a.bilink.createElement({topic:'Graph Acceptance C'}),{text:''}]});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const g = ${graph};
    return {ms:performance.now()-start,oldEdge:g.graph.hasEdge('graph acceptance a','graph acceptance b'),newEdge:g.graph.hasEdge('graph acceptance a','graph acceptance c')};
  })()`)
  assert.ok(report.retarget.newEdge && !report.retarget.oldEdge)
  report.checks.liveRetarget = true
  await c.evaluate(`(() => {const a=window.__notekitApp.addons,item=a.dbMemory.getItem('graph-app-check-link');a.dbMemory.saveItem({...item,pky:a.topic.getTopic('Graph Acceptance B').ky});return true})()`)
  await waitFor(`${graph}.graph.hasEdge('graph acceptance b','graph acceptance c') && !${graph}.graph.hasEdge('graph acceptance a','graph acceptance c')`)
  report.checks.parentTopicMove = true
  await c.evaluate(`(() => {const a=window.__notekitApp.addons,item=a.dbMemory.getItem('graph-app-check-link');a.dbMemory.saveItem({...item,mentions:[],leaves:[{text:'Reference removed'}]});return true})()`)
  await waitFor(`!${graph}.graph.hasEdge('graph acceptance b','graph acceptance c')`)
  report.checks.liveReferenceRemoval = true
  await c.evaluate(`${graph}.pause(); true`)
  await c.evaluate(`window.__graphTicks = ${graph}.metrics.ticks; document.querySelector('[data-network-graph="sigma"]').parentElement.querySelector('input[type="checkbox"]').click(); true`)
  await delay(100)
  assert.equal(await c.evaluate(`${graph}.metrics.ticks`), await c.evaluate('window.__graphTicks'))
  report.checks.filterDoesNotLayout = true
  await c.evaluate(`document.body.classList.add('night-mode'); true`)
  await delay(150)
  report.theme = await c.evaluate(`({background:getComputedStyle(document.querySelector('[data-network-graph="sigma"]').parentElement).backgroundColor,label:${graph}.renderer.getSetting('labelColor')})`)
  await screenshot('app-dark.png')
  await c.evaluate("document.body.classList.remove('night-mode'); true")
  await c.call('Emulation.setDeviceMetricsOverride', { width: 900, height: 720, deviceScaleFactor: 2, mobile: false })
  await delay(200)
  report.resize = await c.evaluate(`${graph}.renderer.getDimensions()`)
  assert.ok(report.resize.width > 100 && report.resize.height > 100)
  report.checks.resize = true
  await screenshot('app-900.png')
  await c.call('Emulation.clearDeviceMetricsOverride')
  await delay(200)
  const point = await c.evaluate(`(() => { const g = ${graph}; const id = g.graph.nodes().find(id => g.graph.degree(id)>1 && !g.renderer.getNodeDisplayData(id)?.hidden); const p = g.renderer.graphToViewport(g.graph.getNodeAttributes(id)); const r = document.querySelector('[data-network-graph="sigma"]').getBoundingClientRect(); window.__dragId=id; return {id,x:p.x+r.left,y:p.y+r.top}; })()`)
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await delay(100)
  report.hover = await c.evaluate(`({highlighted:${graph}.renderer.getNodeDisplayData(window.__dragId)?.highlighted,ms:${graph}.metrics.hoverMs})`)
  assert.ok(report.hover.highlighted, 'Real pointer hover must highlight the node')
  await c.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 35, y: point.y + 25, button: 'left', buttons: 1 })
  await delay(150)
  await c.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 35, y: point.y + 25, button: 'left', clickCount: 1 })
  await delay(150)
  assert.ok(await c.evaluate('location.pathname.endsWith("/graphs")'), 'Dragging must not route')
  report.checks.dragWithoutNavigation = true
  await c.evaluate(`${graph}.pause(); window.__savedGraph = ${graph}; true`)
  await delay(250)
  await c.evaluate('window.__notekitApp.addons.router.to("/diaries"); true')
  await delay(200)
  await c.evaluate('window.__notekitApp.addons.router.to("/graphs"); true')
  await waitFor(`${graph} && ${graph} !== window.__savedGraph`)
  report.restored = await c.evaluate(`${graph}.metrics.restored`)
  assert.equal(report.restored, await c.evaluate(`${graph}.graph.order`))
  report.checks.positionRestoration = true
  await c.evaluate(`${graph}.pause(); true`)
  const click = await c.evaluate(`(() => { const g = ${graph}; const id = g.graph.nodes().find(id => g.graph.degree(id)>1 && !g.renderer.getNodeDisplayData(id)?.hidden); const p = g.renderer.graphToViewport(g.graph.getNodeAttributes(id)); const r = document.querySelector('[data-network-graph="sigma"]').getBoundingClientRect(); return {id,x:p.x+r.left,y:p.y+r.top}; })()`)
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: click.x, y: click.y })
  await c.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: click.x, y: click.y, button: 'left', clickCount: 1 })
  await c.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: click.x, y: click.y, button: 'left', clickCount: 1 })
  await waitFor('!location.pathname.endsWith("/graphs")')
  report.checks.nodeNavigation = true
  report.errors = c.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails)
  assert.equal(report.errors.length, 0)
  report.pass = true
} catch (error) {
  report.pass = false
  report.error = error.stack
  try {
    report.diagnostic = await c.evaluate('({url:location.href,body:document.body.innerText.slice(0,1000),errors:window.__errs,ready:window.__notekitApp?.addons?.dbMemory?.initFinished,items:window.__notekitApp?.addons?.dbMemory?.list?.length,library:window.__notekitApp?.addons?.dbDisk?.primaryId})')
    report.exceptions = c.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params)
    await screenshot('app-failed.png')
  } catch {}
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'app-check.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(output, 'app-check.log'), logs)
  try { await c?.evaluate('window.close(); true') } catch {}
  c?.close()
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)])
  if (child.exitCode === null) child.kill('SIGTERM')
  console.log(JSON.stringify(report, null, 2))
}
