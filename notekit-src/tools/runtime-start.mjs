import { connect } from './cdp-client.mjs'
import { writeFileSync } from 'node:fs'
const [port,url,reportFile]=process.argv.slice(2)
const c=await connect(port)
await c.call('Page.navigate',{url})
const start=Date.now();let state
while(Date.now()-start<90000){
 await new Promise(r=>setTimeout(r,500))
 try{state=await c.evaluate(`(()=>{const app=window.__notekitApp;return {url:location.href,text:document.body.innerText.slice(0,600),mode:app?.addons?.dbDisk?.storageMode,dbid:app?.addons?.dbDisk?.primaryId,items:app?.addons?.dbMemory?.list?.length,editors:document.querySelectorAll('[contenteditable="true"]').length,alert:document.querySelector('[role="alert"]')?.textContent}})()`)}catch{continue}
 if(state?.alert||state?.editors>0)break
}
const exceptions=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error')).map(e=>e.params)
const report={...state,exceptions}
writeFileSync(reportFile,JSON.stringify(report,null,2))
console.log(JSON.stringify(report));c.close()
if(state?.alert||!state?.editors||state.mode!=='sqlite')process.exitCode=1
