import { readFileSync, writeFileSync } from 'node:fs'
const [port, expressionFile, outputFile] = process.argv.slice(2)
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find(target => target.type === 'page' && !target.url.startsWith('devtools:'))
if (!target) throw new Error('没有找到 Notekit 页面')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let next = 0
const pending = new Map()
const events = []
socket.onmessage = event => {
 const message = JSON.parse(event.data)
 if (message.id && pending.has(message.id)) {
  const {resolve,reject}=pending.get(message.id);pending.delete(message.id)
  if(message.error)reject(new Error(JSON.stringify(message.error)));else resolve(message.result)
 } else if (message.method==='Runtime.exceptionThrown') events.push(message.params.exceptionDetails)
}
function call(method, params={}) { return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}) }
await call('Runtime.enable')
const result = await call('Runtime.evaluate',{expression:readFileSync(expressionFile,'utf8'),awaitPromise:true,returnByValue:true,timeout:120000})
socket.close()
if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails))
const value=result.result.value
if(outputFile) { writeFileSync(outputFile,JSON.stringify(value,null,2));console.log(JSON.stringify({saved:outputFile,origin:value?.origin,databases:value?.databases?.map(db=>({name:db.name,tables:db.tables.map(table=>({name:table.name,count:table.rows.length}))})),runtimeExceptions:events.length})) }
else console.log(JSON.stringify({value,runtimeExceptions:events}))
