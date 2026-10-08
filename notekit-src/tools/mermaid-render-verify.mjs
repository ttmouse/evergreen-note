// Exercise the real Markdown conversion and React renderer in a fresh profile.
// No connection to the user's running service or database.
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtimeRoot = process.argv.includes('--packaged')
  ? path.join(root, 'build', 'Evergreen note.app', 'Contents', 'Resources', 'app')
  : root
const output = await mkdtemp(path.join(tmpdir(), 'evergreen-mermaid-'))
const profile = path.join(output, 'profile')
await mkdir(profile)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function freePort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}
const port = await freePort()
const debugPort = await freePort()
const env = { ...process.env, NOTEKIT_USER_DATA: profile, NOTEKIT_PORT: String(port) }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS
const binary = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const child = spawn(binary, [path.join(runtimeRoot, 'desktop/main.cjs'), `--remote-debugging-port=${debugPort}`], {
  cwd: runtimeRoot, env, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
child.stdout.on('data', chunk => { log += chunk })
child.stderr.on('data', chunk => { log += chunk })
let cdp
const results = []
const assert = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ? JSON.stringify(detail) : ''}`)
  if (!ok) throw new Error(name)
}
async function until(expression) {
  for (let i = 0; i < 120; i++) {
    if (await cdp.evaluate(expression).catch(() => false)) return true
    await delay(250)
  }
  return false
}
try {
  for (let i = 0; i < 120 && !cdp; i++) {
    try { cdp = await connect(debugPort) } catch { await delay(250) }
  }
  if (!cdp) throw new Error('Isolated Electron did not start')
  // Other isolated audits may own the native foreground window during this run.
  await cdp.call('Emulation.setFocusEmulationEnabled', {enabled:true})
  assert('isolated library ready', await until('!!window.__notekitApp?.addons?.libAdmin?.current'))
  // Block external dependencies: graph rendering must work offline.
  await cdp.call('Network.enable')
  await cdp.call('Network.setBlockedURLs', { urls: ['https://*'] })
  const flow = 'flowchart TD\n    A[开始] --> B{是否完成}\n    B -->|是| C[结束]\n    B -->|否| D[继续处理]\n    D --> B'
  const sequence = 'sequenceDiagram\n    participant A as 用户\n    participant B as 笔记\n    A->>B: 保存\n    B-->>A: 完成'
  const fixtures = [flow, sequence, flow, 'flowchart TD\n A -->[']
  const converted = await cdp.evaluate(`(async () => {
    const $ = window.__notekitApp.addons;
    $.nightMode.isNightMode = false;
    $.nightMode.takeEffect();
    const topic = $.topic.createTopic('Mermaid 渲染验证');
    window.__mermaidVerifyTopic = topic;
    $.dbMemory.saveItem({ky:'mermaid-verify-before', pky:topic.ky, ori:'流程图前的普通笔记', leaves:[{text:'流程图前的普通笔记'}], weight:500, status:1});
    $.dbMemory.saveItem({ky:'mermaid-verify-after', pky:topic.ky, ori:'流程图后的普通笔记', leaves:[{text:'流程图后的普通笔记'}], weight:1500, status:1});
    const results = ${JSON.stringify(fixtures)}.map((content, i) => {
      const markdown = ${JSON.stringify('```mermaid\n')} + content + ${JSON.stringify('\n```')};
      const leaves = $.compat.convertText({}, markdown);
      const element = leaves.find(leaf => $.mermaidGraph.verify(leaf));
      $.dbMemory.saveItem({ky:'mermaid-verify-' + i, pky:topic.ky, ori:markdown, leaves, weight:(i+1)*1000, status:1});
      return {converted:!!element, value:element?.value, exported:element && $.mermaidGraph.exportString(element)};
    });
    await $.dbDisk.flush();
    $.router.to(topic);
    return results;
  })()`)
  assert('Markdown fences become Mermaid blocks', converted.every((x, i) => x.converted && x.value === fixtures[i]), converted)
  assert('Markdown export preserves diagram source', converted.every((x, i) => x.exported.trim() === '```mermaid\n' + fixtures[i] + '\n```'))
  assert('flowcharts and sequence SVG render offline', await until(`document.querySelectorAll('.mermaid-canvas svg').length === 3`))
  const geometry = await cdp.evaluate(`Array.from(document.querySelectorAll('.mermaid-canvas svg')).map(svg => {
    const r = svg.getBoundingClientRect();
    const text = Array.from(svg.querySelectorAll('text, .nodeLabel, .messageText')).map(el => el.textContent).join(' ');
    return {id:svg.id, text, width:r.width, height:r.height, viewBox:svg.getAttribute('viewBox')};
  })`)
  assert('visible dimensions and unique SVG IDs', geometry.every(x => x.width > 30 && x.height > 30 && x.height < 2000) && new Set(geometry.map(x => x.id)).size === 3, geometry)
  assert('Chinese nodes and sequence labels survive', geometry[0].text.includes('开始') && geometry[0].text.includes('是否完成') && geometry[1].text.includes('保存'))
  assert('syntax error is visible instead of an empty box', await until(`Array.from(document.querySelectorAll('.mermaid-canvas')).some(el => el.textContent.includes('Mermaid 渲染失败'))`))
  const lightIds = geometry.map(x => x.id)
  await cdp.evaluate(`window.__notekitApp.addons.nightMode.toggleNightMode(); true`)
  assert('night theme re-renders existing graphs', await until(`Array.from(document.querySelectorAll('.mermaid-canvas svg')).length === 3 && Array.from(document.querySelectorAll('.mermaid-canvas svg')).every(svg => !${JSON.stringify(lightIds)}.includes(svg.id))`))
  const darkColors = await cdp.evaluate(`Array.from(document.querySelectorAll('.mermaid-canvas svg .node rect, .mermaid-canvas svg .node polygon')).map(el => ({fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke}))`)
  assert('night theme has diagram shapes', darkColors.length > 0, darkColors.slice(0, 4))
  const darkIds = await cdp.evaluate(`Array.from(document.querySelectorAll('.mermaid-canvas svg')).map(svg => svg.id)`)
  await cdp.evaluate(`window.__notekitApp.addons.nightMode.toggleNightMode(); true`)
  assert('returning to light re-renders graphs', await until(`Array.from(document.querySelectorAll('.mermaid-canvas svg')).length === 3 && Array.from(document.querySelectorAll('.mermaid-canvas svg')).every(svg => !${JSON.stringify(darkIds)}.includes(svg.id))`))
  const replaceSource = async text => {
    await cdp.evaluate(`(() => {
      const el = document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea');
      el.dispatchEvent(new KeyboardEvent('keydown', {key:'a',code:'KeyA',keyCode:65,which:65,metaKey:true,bubbles:true,cancelable:true}));
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', ${JSON.stringify(text)});
      el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:clipboard,bubbles:true,cancelable:true}));
      return true;
    })()`)
  }
  const arrow = async key => {
    const codes = {ArrowUp:38, ArrowDown:40, ArrowLeft:37, ArrowRight:39}
    await cdp.call('Input.dispatchKeyEvent', {type:'keyDown', key, code:key, windowsVirtualKeyCode:codes[key], nativeVirtualKeyCode:codes[key]})
    await cdp.call('Input.dispatchKeyEvent', {type:'keyUp', key, code:key, windowsVirtualKeyCode:codes[key], nativeVirtualKeyCode:codes[key]})
  }
  await cdp.evaluate(`(() => {
    const node = document.querySelector('.node[data-ky="mermaid-verify-before"]');
    window.__mermaidVerifyEditor = node.$editor;
    node.$editor.itemFocusEnd('mermaid-verify-before'); return true;
  })()`)
  await arrow('ArrowDown')
  assert('ArrowDown enters diagram source from preceding note', await until(`!!document.querySelector('.node[data-ky="mermaid-verify-0"] .mermaid-inline-source .monaco-editor .view-lines')?.textContent`))
  assert('entering source focuses its text caret', await until(`!!document.activeElement?.closest('.mermaid-inline-source .monaco-editor')`))
  await arrow('ArrowDown')
  assert('ArrowDown inside source stays in its editor', await until(`!!document.activeElement?.closest('.mermaid-inline-source .monaco-editor')`))
  await arrow('ArrowUp')
  await arrow('ArrowUp')
  assert('ArrowUp at source start returns to preceding note and renders', await until(`!document.querySelector('.mermaid-inline-source') && window.__mermaidVerifyEditor.item()?.ky === 'mermaid-verify-before' && !!document.querySelector('.mermaid-canvas svg')`))
  await cdp.evaluate(`window.__mermaidVerifyEditor.itemFocus('mermaid-verify-after'); true`)
  await arrow('ArrowUp')
  assert('ArrowUp enters diagram source from following note', await until(`!!document.querySelector('.node[data-ky="mermaid-verify-0"] .mermaid-inline-source .monaco-editor .view-lines')?.textContent`))
  assert('entering source from below focuses its text caret', await until(`!!document.activeElement?.closest('.mermaid-inline-source .monaco-editor')`))
  await arrow('ArrowUp')
  assert('ArrowUp inside source stays in its editor', await until(`!!document.activeElement?.closest('.mermaid-inline-source .monaco-editor')`))
  await arrow('ArrowDown')
  await arrow('ArrowDown')
  assert('ArrowDown at source end returns to following note and renders', await until(`!document.querySelector('.mermaid-inline-source') && window.__mermaidVerifyEditor.item()?.ky === 'mermaid-verify-after' && !!document.querySelector('.mermaid-canvas svg')`))
  await cdp.evaluate(`document.querySelector('.mermaid-viewer-toolbar button').click(); true`)
  assert('source edits open inside note without a dialog', await until(`!document.querySelector('.mermaid-dialog') && !!document.querySelector('.mermaid-inline-source .monaco-editor .view-lines')?.textContent`))
  assert('inline editor has live diagram preview below source', await until(`(() => {const source=document.querySelector('.mermaid-inline-source .mermaid-editor-host'); const preview=document.querySelector('.mermaid-inline-preview .mermaid-canvas svg'); return !!preview && preview.getBoundingClientRect().top > source.getBoundingClientRect().bottom;})()`))
  const inlineSource = 'flowchart LR\n  A[笔记内编辑] --> B[自动保存]'
  await replaceSource(inlineSource)
  assert('inline edits update original note automatically', await until(`window.__notekitApp.addons.dbMemory.getItem('mermaid-verify-0').leaves.some(n=>n.blockType==='mermaidGraph' && n.value === ${JSON.stringify(inlineSource)}) && !!document.querySelector('.mermaid-inline-source .monaco-editor')`))
  assert('inline preview updates while source remains editable', await until(`document.querySelector('.mermaid-inline-preview .mermaid-canvas svg')?.textContent.includes('自动保存') && !!document.querySelector('.mermaid-inline-source .monaco-editor')`))
  const inlineValidId = await cdp.evaluate(`document.querySelector('.mermaid-inline-preview .mermaid-canvas svg').id`)
  await replaceSource('flowchart TD\n A -->[')
  assert('inline syntax error retains last valid preview', await until(`document.querySelector('.mermaid-inline-preview [role="alert"]')?.textContent.includes('Mermaid 渲染失败') && document.querySelector('.mermaid-inline-preview .mermaid-canvas svg')?.id === ${JSON.stringify(inlineValidId)}`))
  await replaceSource(inlineSource)
  assert('correcting inline syntax restores live preview', await until(`!document.querySelector('.mermaid-inline-preview [role="alert"]') && document.querySelector('.mermaid-inline-preview .mermaid-canvas svg')?.id !== ${JSON.stringify(inlineValidId)}`))
  const zoomButton = await cdp.evaluate(`(() => {
    window.__mermaidInlineEditorNode = document.querySelector('.mermaid-inline-source .monaco-editor');
    window.__mermaidBeforeZoom = document.querySelector('.mermaid-inline-preview .svg-pan-zoom_viewport').getAttribute('transform');
    const r = document.querySelector('.mermaid-inline-preview button[aria-label="放大"]').getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`)
  await cdp.call('Input.dispatchMouseEvent', {type:'mousePressed',...zoomButton,button:'left',clickCount:1})
  await cdp.call('Input.dispatchMouseEvent', {type:'mouseReleased',...zoomButton,button:'left',clickCount:1})
  assert('preview zoom preserves source editor and caret focus', await until(`document.querySelector('.mermaid-inline-source .monaco-editor') === window.__mermaidInlineEditorNode && !!document.activeElement?.closest('.mermaid-inline-source .monaco-editor') && document.querySelector('.mermaid-inline-preview .svg-pan-zoom_viewport')?.getAttribute('transform') !== window.__mermaidBeforeZoom`))
  const nextNote = await cdp.evaluate(`(() => {const r=document.querySelector('.node[data-ky="mermaid-verify-after"] .node-text').getBoundingClientRect();return {x:r.x+25,y:r.y+r.height/2};})()`)
  await cdp.call('Input.dispatchMouseEvent', {type:'mousePressed',...nextNote,button:'left',clickCount:1})
  await delay(100)
  await cdp.call('Input.dispatchMouseEvent', {type:'mouseReleased',...nextNote,button:'left',clickCount:1})
  assert('clicking following note closes source without retargeting caret', await until(`!document.querySelector('.mermaid-inline-source') && window.__mermaidVerifyEditor.item()?.ky === 'mermaid-verify-after'`))
  await cdp.evaluate(`document.querySelector('.mermaid-viewer-toolbar button').click(); true`)
  assert('inline editor reopens after leaving by mouse', await until(`!!document.querySelector('.mermaid-inline-source .monaco-editor')`))
  await cdp.evaluate(`document.querySelector('.mermaid-inline-source-toolbar button').click(); true`)
  assert('finishing inline edit renders updated diagram', await until(`!document.querySelector('.mermaid-inline-source') && document.querySelector('.mermaid-canvas svg')?.textContent.includes('笔记内编辑')`))
  await cdp.evaluate(`document.querySelector('.mermaid-viewer-toolbar button').click(); true`)
  assert('reopening inline edit restores source', await until(`document.querySelector('.mermaid-inline-source .monaco-editor')?.textContent.includes('自动保存')`))
  await cdp.evaluate(`document.querySelector('.mermaid-inline-source .native-edit-context, .mermaid-inline-source textarea').blur(); true`)
  assert('leaving source editor returns to diagram', await until(`!document.querySelector('.mermaid-inline-source') && document.querySelector('.mermaid-canvas svg')?.textContent.includes('笔记内编辑')`))
  await cdp.evaluate(`document.querySelector('.mermaid-viewer-toolbar button[aria-label="展开查看"]').click(); true`)
  await cdp.evaluate(`document.querySelector('.mermaid-dialog-title-actions button').click(); true`)

  assert('Monaco loads locally with source and preview panes', await until(`!!document.querySelector('.mermaid-source-pane .monaco-editor .view-lines')?.textContent && !!document.querySelector('.mermaid-preview-pane .mermaid-canvas svg')`))
  await cdp.evaluate(`window.__notekitApp.addons.nightMode.toggleNightMode(); true`)
  assert('night editor preserves Mermaid syntax highlighting', await until(`document.body.classList.contains('night-mode') && new Set(Array.from(document.querySelectorAll('.monaco-editor .view-lines span[class*="mtk"]')).map(el=>getComputedStyle(el).color)).size >= 2`))
  await cdp.evaluate(`window.__notekitApp.addons.nightMode.toggleNightMode(); true`)
  assert('light editor preserves syntax highlighting', await until(`!document.body.classList.contains('night-mode') && new Set(Array.from(document.querySelectorAll('.monaco-editor .view-lines span[class*="mtk"]')).map(el=>getComputedStyle(el).color)).size >= 2`))
  const revised = 'flowchart LR\n  A[编辑验证] --> B[实时预览] --> C[本地保存]'
  await replaceSource(revised)
  assert('source edits update preview automatically', await until(`document.querySelector('.mermaid-preview-pane .mermaid-canvas svg')?.textContent.includes('实时预览')`))
  const lastValidId = await cdp.evaluate(`document.querySelector('.mermaid-preview-pane .mermaid-canvas svg').id`)
  await replaceSource('flowchart TD\n A -->[')
  assert('invalid source shows error and retains last valid graph', await until(`document.querySelector('.mermaid-preview-error')?.textContent.includes('Mermaid 渲染失败') && document.querySelector('.mermaid-preview-pane .mermaid-canvas svg')?.id === ${JSON.stringify(lastValidId)}`))
  await replaceSource(revised)
  assert('correcting syntax removes error', await until(`!document.querySelector('.mermaid-preview-error') && document.querySelector('.mermaid-preview-pane .mermaid-canvas svg')?.id !== ${JSON.stringify(lastValidId)}`))
  await cdp.evaluate(`Array.from(document.querySelectorAll('.mermaid-dialog-actions button')).find(b=>b.textContent==='保存').click(); true`)
  assert('saving closes editor and updates original block', await until(`!document.querySelector('.mermaid-dialog') && document.querySelector('.mermaid-canvas svg')?.textContent.includes('编辑验证')`))
  const saved = await cdp.evaluate(`(async()=>{const $=window.__notekitApp.addons; await $.dbDisk.flush(); const item=$.dbMemory.getItem('mermaid-verify-0'); return {ori:item.ori, value:item.leaves.find(n=>$.mermaidGraph.verify(n))?.value};})()`)
  assert('saved source and Markdown both preserve edited value', saved.value === revised && saved.ori.includes(revised), saved)
  await cdp.evaluate(`document.querySelector('.mermaid-viewer-toolbar button[aria-label="展开查看"]').click(); true`)
  await cdp.evaluate(`document.querySelector('.mermaid-dialog-title-actions button').click(); true`)
  assert('reopening editor restores saved source', await until(`document.querySelector('.monaco-editor')?.textContent.includes('本地保存')`))
  await replaceSource('flowchart LR\n A[未保存的修改] --> B[取消]')
  await cdp.evaluate(`Array.from(document.querySelectorAll('.mermaid-dialog-actions button')).find(b=>b.textContent==='取消').click(); true`)
  assert('cancel preserves saved note', await until(`!document.querySelector('.mermaid-dialog') && document.querySelector('.mermaid-canvas svg')?.textContent.includes('编辑验证') && !document.querySelector('.mermaid-canvas svg')?.textContent.includes('未保存')`))
  const topicKey = await cdp.evaluate(`window.__mermaidVerifyTopic.ky`)
  await cdp.call('Page.reload')
  assert('reloaded library ready', await until('!!window.__notekitApp?.addons?.libAdmin?.current'))
  assert('saved block hydrates from isolated database', await until(`window.__notekitApp.addons.dbMemory.getItem('mermaid-verify-0')?.ori?.includes('本地保存')`))
  await cdp.evaluate(`window.__notekitApp.addons.router.to('item/' + ${JSON.stringify(topicKey)}); true`)
  assert('saved diagram survives app reload', await until(`document.querySelector('.mermaid-canvas svg')?.textContent.includes('本地保存')`))
  assert('no editor or rendering CDN requested', !cdp.events.some(e => e.method === 'Network.requestWillBeSent' && /^https?:/.test(e.params.request.url) && !e.params.request.url.startsWith('http://127.0.0.1:')))
  assert('legacy missing script is never requested', !cdp.events.some(e => e.method === 'Network.requestWillBeSent' && e.params.request.url.includes('mermaid.min.js')))
  console.log(`Evidence: ${output}`)
  if (process.argv.includes('--keep-open')) {
    console.log(`Isolated window remains open for desktop verification. PID=${child.pid} PORT=${port}`)
    await new Promise(resolve => {
      process.once('SIGINT', resolve)
      process.once('SIGTERM', resolve)
    })
  }
} catch (error) {
  console.error(error)
  if(cdp) console.log('Editor diagnostic:', await cdp.evaluate(`({focus:document.activeElement?.tagName,source:document.querySelector('.monaco-editor .view-lines')?.textContent,preview:Array.from(document.querySelectorAll('.mermaid-preview-pane .mermaid-canvas svg .nodeLabel')).map(el=>el.textContent),error:document.querySelector('.mermaid-preview-error')?.textContent,models:window.monaco?.editor?.getModels().map(m=>m.getValue())})`).catch(()=>null))
  process.exitCode = 1
  if(process.argv.includes('--keep-open')) {
    console.log(`Failed isolated window held. PID=${child.pid} PORT=${port}`)
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve)})
  }
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  await writeFile(path.join(output, 'electron.log'), log)
  cdp?.close()
  child.kill('SIGTERM')
}
