import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const [source, target, reportFile, option] = process.argv.slice(2)
const snapshot=JSON.parse(readFileSync(source,'utf8'))
if(snapshot.origin!==new URL(target).origin)throw new Error('源 IndexedDB origin 与目标应用不符')
const reports=[]
for (const database of snapshot.databases) {
 const tables=database.tables.map(({name,rows})=>({name,rows}))
 const response=await fetch(`${target}/api/storage/migrate/${encodeURIComponent(database.name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tables,refresh:option==='--refresh'})})
 const report=await response.json()
 if(!response.ok)throw new Error(JSON.stringify(report))
 const digest=createHash('sha256').update(JSON.stringify(tables)).digest('hex')
 if(report.sourceDigest!==digest||report.tables.some(table=>table.sourceCount!==table.verified))throw new Error('迁移摘要或记录数量校验失败')
 reports.push(report)
 console.log(JSON.stringify(report))
}
writeFileSync(reportFile,JSON.stringify(reports,null,2))
