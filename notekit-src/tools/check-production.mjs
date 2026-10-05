import { connect } from './cdp-client.mjs'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const [port,output] = process.argv.slice(2)
const c=await connect(port)
let state
for(let i=0;i<120;i++){
 try{state=await c.evaluate(`(()=>({mode:window.__notekitApp?.addons?.dbDisk?.storageMode,dbid:window.__notekitApp?.addons?.dbDisk?.primaryId,items:window.__notekitApp?.addons?.dbMemory?.list?.length,editors:document.querySelectorAll('[contenteditable="true"]').length,alert:document.querySelector('[role="alert"]')?.textContent}))()`);if(state.alert||state.editors)break}catch{}
 await new Promise(r=>setTimeout(r,250))
}
assert.equal(state.mode,'sqlite');assert.equal(state.dbid,'db-1-v2main');assert.ok(state.items>48000);assert.ok(state.editors>0);assert.ok(!state.alert)
await c.evaluate('window.__notekitApp.addons.dbDisk.flush()')
const backup=await c.evaluate('window.notekitShell.backupNow()');assert.equal(backup.ok,true)
const status=await c.evaluate('fetch("/api/storage/status").then(r=>r.json())')
const count=await c.evaluate('fetch("/api/local-db/db-1-v2main/node?op=count").then(r=>r.json())');assert.equal(count,90418)
const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'))
assert.equal(errors.length,0)
const report={pass:true,...state,noteCount:count,backup:backup.msg,migrationDatabases:status.migrations.map(x=>x.dbid),runtimeErrors:errors.length}
writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));c.close()
