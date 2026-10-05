(async () => {
 const req = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
 const names = await indexedDB.databases()
 const databases=[]
 for (const info of names) {
  const open=indexedDB.open(info.name);open.onupgradeneeded=()=>open.transaction.abort()
  const db=await req(open)
  try {
   const stores=Array.from(db.objectStoreNames)
   if(!stores.length)continue
   const tx=db.transaction(stores,'readonly')
   const completed=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error)})
   const tables=await Promise.all(stores.map(async name=>{
    const store=tx.objectStore(name)
    const rowsRequest=store.getAll(),keysRequest=store.getAllKeys()
    const [rows,keys]=await Promise.all([req(rowsRequest),req(keysRequest)])
    const key=store.keyPath
    return {name,primaryKey:key,rows:rows.map((row,index)=>{if(typeof key==='string' && row[key]==null)row[key]=keys[index];return row})}
   }))
   await completed
   databases.push({name:db.name,version:db.version,tables})
  }finally{db.close()}
 }
 return {origin:location.origin,lastDatabase:localStorage.lastDatabase,databases}
})()
