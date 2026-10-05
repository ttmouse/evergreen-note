import { connect } from './cdp-client.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const [port,editFile,output] = process.argv.slice(2)
const expected=JSON.parse(readFileSync(editFile,'utf8'))
const c=await connect(port)
for(let i=0;i<80;i++){
 try{if(await c.evaluate(`!!window.__notekitApp?.addons?.dbMemory?.getItem('legacy-child')?.leaves?.length && !!document.querySelector('[contenteditable="true"]')`))break}catch{}
 await new Promise(r=>setTimeout(r,250))
}
await c.evaluate(`window.__notekitApp.addons.topic.route('SQLite迁移验收'); true`)
await new Promise(r=>setTimeout(r,500))
const restored=await c.evaluate(`(async()=>{const app=window.__notekitApp;const connection=app.addons.dbDisk.open('db-1-v2main');const row=await connection.node.get('legacy-child');const idb=await new Promise((resolve,reject)=>{const r=indexedDB.open('db-1-v2main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});let legacy;try{legacy=await new Promise((resolve,reject)=>{const r=idb.transaction('node','readonly').objectStore('node').get('legacy-child');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{idb.close()}return {mode:app.addons.dbDisk.storageMode,text:document.querySelector('[data-ky="legacy-child"]')?.innerText,sqlite:row.leaves[0].text,legacy:legacy.leaves[0].text,primaryKeys:[connection.node.schema.primKey.name,connection.prefer.schema.primKey.name,connection.track.schema.primKey.name,connection.docver.schema.primKey.name]}})()`)
assert.equal(restored.mode,'sqlite');assert.equal(restored.text,expected.finalUi);assert.equal(restored.sqlite,expected.finalUi);assert.equal(restored.legacy,'迁移前的正文')
const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'))
assert.equal(errors.length,0)
writeFileSync(output,JSON.stringify({pass:true,...restored,runtimeErrors:errors},null,2))
console.log(JSON.stringify({pass:true,mode:restored.mode,visibleTextMatchesSqlite:true,lastEditRestored:true,indexedDbUnchanged:true,primaryKeys:restored.primaryKeys,runtimeErrors:errors.length}))
await c.evaluate('window.close(); true');c.close()
