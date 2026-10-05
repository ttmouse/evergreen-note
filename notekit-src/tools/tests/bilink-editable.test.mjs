import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {createEditor, Editor, Transforms, Element, Node, Range} from 'slate'
import {withHistory} from 'slate-history'
const source=readFileSync(new URL('../../src/slate-item/addons/Bilink/Bilink.tsx',import.meta.url),'utf8')
const exports={}
const deps={
 '../../slate.inc':{Editor,Transforms,Element,Node,Range},
 '../../utils/isEmpty':{isEmpty:v=>v==null||v==='',notEmpty:v=>v!=null&&v!==''},
 '../../utils/string/trim':{trim:v=>(v??'').trim()},
 '../../utils/string/nodeString':{nodeString:Node.string},
}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>deps[name]??{},window:{getSelection:()=>({isCollapsed:true})},HTMLElement:class {}})
function setup(){
 const routes=[]
 const $={inlines:{createElement:(blockType,text,extra)=>({inline:true,blockType,children:[{text}],...extra})},topic:{route:(...args)=>routes.push(args)}}
 const bilink=exports.createBilinkAddon({$});$.bilink=bilink
 return {bilink,routes}
}
test('new and legacy links allow edits, undo, target changes and mention extraction in Slate',()=>{
 const {bilink}=setup()
 for(const legacy of [false,true]){
  const editor=withHistory(createEditor());editor.isInline=n=>bilink.verify(n);editor.isVoid=n=>bilink.isVoid(n)
  const link=bilink.createElement({topic:'张小龙'});if(legacy)link.isVoid=true
  editor.children=[{children:[{text:'前 '},link,{text:' 后'}]}]
  Transforms.select(editor,{path:[0,1,0],offset:1});editor.insertText('大')
  assert.equal(Node.string(editor.children[0].children[1]),'张大小龙')
  assert.equal(bilink.string(editor.children[0].children[1]),'张大小龙')
  assert.deepEqual(Array.from(bilink.extractMentions({leaves:editor.children[0].children}).mentions),['张大小龙'])
  editor.undo();assert.equal(Node.string(editor.children[0].children[1]),'张小龙')
  Transforms.select(editor,{path:[0,1,0],offset:2});editor.deleteBackward('character')
  assert.equal(Node.string(editor.children[0].children[1]),'张龙')
 }
})
test('alias edits keep the original destination',()=>{
 const {bilink}=setup();const link=bilink.createElement({topic:'原目标',alias:'别名'})
 link.children[0].text='新别名';assert.equal(bilink.string(link),'原目标')
 assert.equal(bilink.exportString(link,{}),'[[新别名]](原目标)')
})
test('plain and modifier clicks keep existing navigation behavior',()=>{
 const {bilink,routes}=setup();const params={topicTitle:'张小龙',element:bilink.createElement({topic:'张小龙'}),editor:{}}
 bilink.handleClick({altKey:false},params)
 bilink.handleClick({altKey:true},params)
 assert.equal(routes.length,2);assert.equal(routes[0][0],'张小龙');assert.equal(routes[1][0],'张小龙')
})
