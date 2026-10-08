/**
 * node tools/settings-shortcut-verify.mjs (requires pnpm build)
 * Checks the actual settings panel in a fresh isolated profile. The renderer
 * path and native menu callback are checked separately, including repeat/close.
 * Profiles are retained as evidence; no existing profile is removed.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { createSettingsMenuItem } = createRequire(import.meta.url)('../desktop/settings-menu.cjs')
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, '../test-runs/settings-hotkey')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(path.join(output, 'profile-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function port() {
 const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p
}
const debugPort=await port(), httpPort=await port()
const child=spawn(path.join(root,'node_modules/.bin/electron'),['desktop/main.cjs',`--remote-debugging-port=${debugPort}`],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'',NOTEKIT_PORT:String(httpPort),NOTEKIT_USER_DATA:profile},stdio:['ignore','pipe','pipe']})
let logs=''; child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
let cdp
async function until(fn) {for(let i=0;i<120;i++){try{const value=await fn();if(value)return value}catch{} await sleep(500)}throw Error(logs.slice(-2000))}
const results=[]
try {
 cdp=await until(()=>connect(debugPort))
 await until(()=>cdp.evaluate(`!!window.__notekitApp?.addons?.hotkey?.commands['app.preferences'] && !!document.querySelector('[contenteditable=true]')`))
 await cdp.evaluate(`window.__settingsCalls=0; const app=__notekitApp; const original=app.execCommand.bind(app); app.execCommand=(cmd,params)=>{if(cmd.id==='app.preferences')__settingsCalls++; return original(cmd,params)}`)
 const visible=()=>cdp.evaluate(`Array.from(document.querySelectorAll('.preferences-dialog')).filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden').length`)
 const press=async(meta=true)=>{
  const base={key:'Escape',code:'Escape',modifiers:meta?4:0,windowsVirtualKeyCode:27};
  await cdp.call('Input.dispatchKeyEvent',{...base,type:'rawKeyDown'});await cdp.call('Input.dispatchKeyEvent',{...base,type:'keyUp'});await sleep(700)
 }
 for(const context of ['body','editor','modal']){
  await press(false)
  await cdp.evaluate(`document.querySelectorAll('.preferences-dialog button[aria-label="close"]').forEach(e=>e.click())`)
  await sleep(350)
  if(context==='body')await cdp.evaluate(`document.activeElement?.blur()`)
  if(context==='editor')await cdp.evaluate(`document.querySelector('[contenteditable=true]').focus()`)
  if(context==='modal')await cdp.evaluate(`__notekitApp.addons.prefer.showCfgForm({DialogProps:{classList:['settings-repro-existing']}})`)
  await cdp.evaluate(`window.__settingsCalls=0`)
  await press()
  results.push({context,visible:await visible(),calls:await cdp.evaluate(`__settingsCalls`)})
  assert.equal(await visible(), 1, `${context}: renderer shortcut must show settings`)
  assert.equal(await cdp.evaluate(`__settingsCalls`), 1, `${context}: dispatch exactly once`)
 }
 const errors=[]
 const item=createSettingsMenuItem(()=>({isDestroyed:()=>false,webContents:{executeJavaScript:script=>cdp.evaluate(script)}}),error=>errors.push(error))
 assert.equal(item.accelerator,'CommandOrControl+Escape')
 await cdp.evaluate(`window.__settingsOpens=0; const prefer=__notekitApp.addons.prefer; const oldShow=prefer.showCfgForm.bind(prefer); prefer.showCfgForm=(...args)=>{__settingsOpens++;return oldShow(...args)}`)
 // Make the renderer command unavailable: the native callback must still work.
 await cdp.evaluate(`const rendererExec=__notekitApp.execCommand.bind(__notekitApp); __notekitApp.execCommand=(cmd,params)=>cmd.id==='app.preferences'?false:rendererExec(cmd,params)`)
 for(const context of ['body','editor','modal']){
  await press(false)
  await sleep(350)
  if(context==='body')await cdp.evaluate(`document.activeElement?.blur()`)
  if(context==='editor')await cdp.evaluate(`document.querySelector('[contenteditable=true]').focus()`)
  if(context==='modal')await cdp.evaluate(`__notekitApp.addons.prefer.showCfgForm({DialogProps:{classList:['settings-repro-existing']}})`)
  await cdp.evaluate(`window.__settingsOpens=0`)
  await item.click()
  await sleep(700)
  assert.equal(await visible(),1,`${context}: native menu route must show settings`)
  await item.click()
  assert.equal(await cdp.evaluate(`__settingsOpens`),1,`${context}: repeated shortcut must not stack settings`)
  results.push({context,route:'native-menu',visible:await visible(),opens:await cdp.evaluate(`__settingsOpens`)})
 }
 assert.deepEqual(errors,[])
 await press(false)
 assert.equal(await visible(),0,'plain Escape still closes settings')
 await writeFile(path.join(output,'result.json'),JSON.stringify({profile,results},null,2))
 console.log(JSON.stringify(results,null,2))
}finally{cdp?.close();child.kill('SIGTERM')}
