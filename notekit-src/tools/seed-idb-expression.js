(async()=>{
 const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
 const library='db-1-v2main'
 const tableKeys={node:'ky',cached:'ky',docver:'vid',prefer:'prky',track:'tid'}
 const fixtures={
  'HOME-1':{node:[{ky:library,pky:'1',role:'library',path:[],created:1,updated:1,weight:1,ori:'SQLite迁移验收',status:1}]},
  [library]:{
   node:[{ky:'legacy-topic',pky:'',path:[],isTopic:1,topic:'sqlite迁移验收',role:'topic',leaves:[{text:'SQLite迁移验收'}],ori:'SQLite迁移验收',created:1,updated:1,weight:1,status:1},{ky:'legacy-child',pky:'legacy-topic',path:['legacy-topic'],leaves:[{text:'迁移前的正文'}],ori:'迁移前的正文',created:1,updated:1,weight:2,status:1}],
   track:[{tid:12,ky:'legacy-child',topicKy:'legacy-topic',tracked:1}],
   docver:[{vid:'old-version',ky:'legacy-child',tracked:1,items:{},diff:[]}],
   cached:[{ky:'fixture-cache',value:'present'}]
  }
 }
 for(const [name,tableRows]of Object.entries(fixtures)){
  const open=indexedDB.open(name,15)
  open.onupgradeneeded=()=>{for(const [table,key]of Object.entries(tableKeys))open.result.createObjectStore(table,{keyPath:key,autoIncrement:table==='track'})}
  const db=await req(open);const tx=db.transaction(Object.keys(tableKeys),'readwrite')
  const complete=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error)})
  for(const [table,rows]of Object.entries(tableRows))for(const row of rows)tx.objectStore(table).put(row)
  await complete;db.close()
 }
 localStorage.lastDatabase=library
 return {seeded:true,library}
})()
