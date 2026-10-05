import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SqliteStore, primaryKeys } from '../storage.mjs'

test('all five tables preserve JSON and their original primary keys', () => {
 const db = new DatabaseSync(':memory:'); const store = new SqliteStore(db)
 for (const [table, key] of Object.entries(primaryKeys)) {
  const row = { [key]: table === 'track' ? 12 : 'a', updated: 7, leaves: [{text:'笔记',bold:true}], nested:{path:['x','y']}, status:1 }
  assert.deepEqual(store.put('HOME-1', table, [row]), [row[key]])
  assert.deepEqual(store.get('HOME-1', table, row[key]), row)
 }
 db.close()
})
test('migration commits all tables and preserves a newer existing SQLite edit', () => {
 const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
 store.put('db-1-main','node',[{ky:'a',updated:20,ori:'newer'}])
 const tables=[{name:'node',rows:[{ky:'a',updated:10,ori:'old'},{ky:'b',updated:10,leaves:[{text:'中文'}]}]},{name:'prefer',rows:[{prky:'plan',ky:'ui',value:{enabled:true}}]}]
 const report=store.migrate('db-1-main',tables)
 assert.equal(report.tables[0].verified,2);assert.equal(report.tables[0].preservedNewer,1)
 assert.equal(store.get('db-1-main','node','a').ori,'newer')
 assert.deepEqual(store.get('db-1-main','prefer','plan'),tables[1].rows[0])
 assert.deepEqual(store.migrate('db-1-main',tables),report)
 db.close()
})
test('a malformed row rolls back earlier tables and does not mark migration done', () => {
 const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
 store.put('db-1-main','node',[{ky:'original',ori:'kept'}])
 assert.throws(()=>store.migrate('db-1-main',[{name:'node',rows:[{ky:'new',ori:'partial'}]},{name:'prefer',rows:[{ky:'missing-prky'}]}]))
 assert.equal(store.get('db-1-main','node','new'),null)
 assert.equal(store.get('db-1-main','node','original').ori,'kept')
 assert.equal(store.status().migrations.length,0)
 db.close()
})
test('track autoincrement, patch and primary keys survive reopening the SQLite file', () => {
 const file=path.join(mkdtempSync(path.join(tmpdir(),'notekit-storage-')),'notes.db')
 let db=new DatabaseSync(file);let store=new SqliteStore(db)
 assert.deepEqual(store.put('test','track',[{ky:'note',tracked:1},{ky:'note',tracked:2}]),[1,2])
 store.remove('test','track',[2])
 assert.deepEqual(store.put('test','track',[{ky:'note',tracked:3}]),[3])
 store.put('test','node',[{ky:'n',pky:'parent',nested:{a:1},leaves:[{text:'before'}]}])
 assert.equal(store.patch('test','node',{pky:'parent'},{'nested.a':2,leaves:[{text:'after'}]}),1)
 assert.throws(()=>store.patch('test','node',{ky:'n'},{ky:'different'}))
 db.close();db=new DatabaseSync(file);store=new SqliteStore(db)
 assert.equal(store.get('test','node','n').nested.a,2)
 assert.equal(store.get('test','node','n').leaves[0].text,'after')
 assert.deepEqual(store.put('test','track',[{ky:'note'}]),[4])
 db.close()
})
test('primary-key patch updates one row without scanning the table', () => {
 const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
 store.put('test','node',[{ky:'target',pky:'parent',nested:{a:1}},{ky:'other',pky:'parent',nested:{a:1}}])
 store.all=()=>{throw new Error('full table scan')}
 assert.equal(store.patch('test','node',{ky:'target'},{'nested.a':2}),1)
 assert.equal(store.get('test','node','target').nested.a,2)
 assert.equal(store.get('test','node','other').nested.a,1)
 db.close()
})
test('non-primary-key patch filters in SQLite instead of reading every row', () => {
 const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
 store.put('test','node',[
  {ky:'target',pky:'parent',status:1,nested:{a:1}},
  {ky:'deleted-target',pky:'parent',status:0,nested:{a:1}},
  {ky:'other',pky:'elsewhere',status:1,nested:{a:1}},
 ])
 store.all=()=>{throw new Error('full table scan')}
 assert.equal(store.patch('test','node',{pky:'parent',status:1},{'nested.a':2}),1)
 assert.equal(store.get('test','node','target').nested.a,2)
 assert.equal(store.get('test','node','deleted-target').nested.a,1)
 assert.equal(store.get('test','node','other').nested.a,1)
 const plan=db.prepare('EXPLAIN QUERY PLAN SELECT data FROM "test-node" WHERE json_extract(data, ?) IS ? AND status IS ?').all('$.pky','parent',1)
 assert.match(plan.map(row=>row.detail).join('\n'), /status_idx|pky_idx/)
 db.close()
})
test('PATCH candidates preserve JS strict equality across JSON types and literal keys', () => {
 const rows=[
  {ky:'missing'},
  {ky:'null',pky:null,status:null,updated:null},
  {ky:'one',pky:'parent',status:1,updated:1,flag:true,'x.y':'value','中文':'字',"a'b":'quote','a"b':'double','a\\b':'slash'},
  {ky:'string',pky:'other',status:'1',updated:'1',flag:1},
  {ky:'zero',status:0,flag:false},
 ]
 const criteria=[{pky:null},{pky:undefined},{status:1},{status:null},{updated:1},{updated:'1'},
  {flag:true},{flag:1},{flag:false},{'x.y':'value'},{'中文':'字'},{"a'b":'quote'},
  {'a"b':'double'},{'a\\b':'slash'},{flag:{a:1}},{status:NaN},{ky:1},{ky:'one'},{}]
 for(const where of criteria){
  const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
  store.put('test','node',rows)
  const baseline=store.all('test','node')
  const expected=baseline.filter(row=>Object.entries(where).every(([k,v])=>row[k]===v)).map(row=>row.ky)
  assert.equal(store.patch('test','node',where,{patched:1}),expected.length,JSON.stringify(where))
  assert.deepEqual(store.all('test','node').filter(row=>row.patched===1).map(row=>row.ky),expected,JSON.stringify(where))
  db.close()
 }
})
test('pure pky PATCH uses the expression index in its actual candidate query', () => {
 const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
 store.put('test','node',[{ky:'target',pky:'parent'},{ky:'other',pky:'elsewhere'}])
 store.all=()=>{throw new Error('full table scan')}
 const prepare=db.prepare.bind(db);let candidateQuery
 db.prepare=sql=>{if(sql.startsWith('SELECT data')&&sql.includes('json_extract'))candidateQuery=sql;return prepare(sql)}
 assert.equal(store.patch('test','node',{pky:'parent'},{updated:2}),1)
 const plan=prepare('EXPLAIN QUERY PLAN '+candidateQuery).all('parent')
 assert.match(plan.map(row=>row.detail).join('\n'),/SEARCH .*pky_idx/)
 assert.equal(store.get('test','node','other').updated,undefined)
 db.close()
})
test('PATCH uses original JSON key semantics for track and prefer tables', () => {
 const db=new DatabaseSync(':memory:');const store=new SqliteStore(db)
 store.put('test','track',[{tid:1,ky:'note'},{tid:2,ky:'other'}])
 assert.equal(store.patch('test','track',{ky:'note'},{tracked:1}),1)
 assert.equal(store.patch('test','track',{tid:'1'},{tracked:2}),0)
 assert.equal(store.patch('test','track',{tid:1},{tracked:3}),1)
 store.put('test','prefer',[{prky:'settings',ky:'alias'}])
 assert.equal(store.patch('test','prefer',{ky:'alias'},{value:1}),1)
 assert.equal(store.patch('test','prefer',{prky:'settings',ky:'alias'},{value:2}),1)
 assert.equal(store.get('test','prefer','settings').value,2)
 db.close()
})
test('SQLite backup exports a coherent readable snapshot without changing the source', () => {
 const directory=mkdtempSync(path.join(tmpdir(),'notekit-backup-'))
 const db=new DatabaseSync(path.join(directory,'source.db'));const store=new SqliteStore(db)
 store.put('test','node',[{ky:'a',leaves:[{text:'备份正文'}]}])
 const target=path.join(directory,'backup.db');store.backup(target)
 const copy=new DatabaseSync(target,{readOnly:true})
 assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok')
 assert.equal(JSON.parse(copy.prepare('SELECT data FROM "test-node" WHERE ky=?').get('a').data).leaves[0].text,'备份正文')
 assert.equal(store.count('test','node'),1)
 copy.close();db.close()
})
