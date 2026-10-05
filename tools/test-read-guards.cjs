// Deterministic adapter checks. These complement, and do not replace, Electron UI tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'notes/evidence/D03', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, {recursive: true});
const source = fs.readFileSync(path.join(root, 'merged/roamedit-app/js/re-electron.js'), 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function scenario(name, content, expectedReady, denied = false) {
  const directory = path.join(output, name);
  fs.mkdirSync(directory);
  const file = path.join(directory, 'roamedit-nk18888-node.json');
  if (content !== null) fs.writeFileSync(file, content, {flag:'wx'});
  const before = content === null ? null : hash(fs.readFileSync(file));
  const adapterFs = Object.create(fs);
  if (denied) adapterFs.readFileSync = () => { const error = new Error('Injected read denial'); error.code = 'EACCES'; throw error; };
  const plugin = {db:{name:'nk18888',node:{}},config:{},settings:{}};
  const context = {console, localStorage:{workDir:directory}, window:{}, plugin,
    NHook:{disable(){}}, setTimeout, clearTimeout,
    document:{addEventListener(){}},
    pluginManager:{register(name, value){plugin[name]=value}},
    require(name){
      if(name==='fs')return adapterFs;
      if(name==='electron')return {remote:{getCurrentWebContents(){return {}},getGlobal(){return null}},ipcRenderer:{on(){},send(){}}};
      if(name==='electron-find')return {FindInPage:class {}};
      return require(name);
    }};
  context.window.addEventListener=()=>{};
  context.window.plugin=plugin;
  vm.createContext(context);
  vm.runInContext(source, context);
  let error = null;
  try { await plugin.redesktop.after_memory_prepareData(); } catch(e) { error={message:e.message,code:e.code||null}; }
  assert.strictEqual(context.window.roameditStorageReady, expectedReady);
  if(!expectedReady) {
    assert.ok(error);
    context.window.latestSaveProcess=1;
    await assert.rejects(plugin.redesktop.toLocalfile(1)(), /saving is blocked/);
    assert.strictEqual(hash(fs.readFileSync(file)), before);
  } else {
    assert.ok(Array.isArray(context.window.dbdata));
  }
  return {name,readReady:context.window.roameditStorageReady,error,originalHash:before,
    finalHash:content===null?null:hash(fs.readFileSync(file)),saveBlocked:!expectedReady};
}
(async()=>{
  const results=[];
  for(const parameters of [
    ['missing',null,true],['empty-array','[]',true],['zero-bytes','',false],
    ['malformed','{',false],['wrong-shape','{}',false],['read-denied','[]',false,true]
  ])results.push(await scenario(...parameters));
  const report={sourceSha256:hash(Buffer.from(source)),layer:'adapter VM; no UI recovery feedback tested',results};
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({evidence:output,passed:results.length,results}));
})().catch(error=>{console.error(error);process.exitCode=1;});
