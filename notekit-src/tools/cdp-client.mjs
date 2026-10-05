export async function connect(port) {
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
 const target=targets.find(t=>t.type==='page'&&!t.url.startsWith('devtools:'))
 if(!target)throw new Error('未找到应用页面')
 const socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
 let id=0;const pending=new Map();const events=[]
 socket.onmessage=e=>{const message=JSON.parse(e.data);if(message.id&&pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result)}else events.push(message)}
 const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))})
 await call('Runtime.enable');await call('Page.enable')
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:120000});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value}
 return {call,evaluate,events,close:()=>socket.close()}
}
