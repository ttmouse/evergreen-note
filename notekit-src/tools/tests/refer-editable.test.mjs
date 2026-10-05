import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createEditor, Editor, Element, Node, Path, Point, Range, Transforms } from 'slate'
import { withHistory } from 'slate-history'

const source = readFileSync(new URL('../../src/slate-item/addons/Refer/Refer.tsx', import.meta.url), 'utf8')
const exports = {}
const slate = { Editor, Element, Node, Path, Point, Range, Transforms }
const dependencies = {
  '../../slate.inc': slate,
  '../../interfaces/item': { Item: { headString: item => item?.ori ?? '' } },
  '../../utils/string/mkid': { mkid: () => 'test-inline' },
  '../../utils/isEmpty': { isEmpty: v => v == null || v === '', notEmpty: v => v != null && v !== '' },
  '../../utils/lang': { $$: strings => strings[0] },
  '../Strmap/Strmap': { ZERO_WIDTH_SPACE: '\u200b' },
  react: { default: { createElement: () => null } },
}
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, { exports, require: name => dependencies[name] ?? {} })

function makeEditor({ legacy = false } = {}) {
  const editor = withHistory(createEditor())
  editor.isInline = node => node.blockType === 'refer'
  editor.isVoid = () => false
  const normalizeNode = editor.normalizeNode
  editor.normalizeNode = entry => {
    const [node, path] = entry
    if (node.blockType === 'refer') {
      const label = node.note ?? (node.value === 'another-node' ? '星厨' : '优特智厨')
      if (exports.normalizeEditableRefer(editor, node, path, label)) return
    }
    normalizeNode(entry)
  }
  const refer = { inline: true, blockType: 'refer', value: 'target-node', refky: 'target-node', children: [{ text: '优特智厨' }], ...(legacy ? { isVoid: true } : { labelText: '优特智厨' }) }
  editor.children = [{ children: [{ text: '前' }, refer, { text: '后' }] }]
  Editor.normalize(editor, { force: true })
  return editor
}

const referenceAt = editor => editor.children[0].children[1]

test('editing reference text becomes a target query, keeps (( )), and supports undo/redo', () => {
  const editor = makeEditor({ legacy: true })
  Transforms.select(editor, { path: [0, 0], offset: 1 })
  Transforms.move(editor, { distance: 1, unit: 'character' })
  editor.insertText('新品')
  assert.equal(Node.string(editor.children[0]), '前((优新品特智厨))后')
  assert.equal(editor.children[0].children.some(n => n.blockType === 'refer'), false)
  editor.undo()
  assert.equal(Node.string(referenceAt(editor)), '优特智厨')
  assert.equal(referenceAt(editor).value, 'target-node')
  editor.redo()
  assert.equal(Node.string(editor.children[0]), '前((优新品特智厨))后')
})

test('replacing the entire label and selecting a candidate retargets only this reference', () => {
  const editor = makeEditor()
  Transforms.select(editor, Editor.range(editor, [0, 1]))
  editor.insertText('星厨')
  assert.equal(Node.string(editor.children[0]), '前((星厨))后')
  editor.itemPathText = () => [0]
  editor.itemTextBeforeCaret = () => Editor.string(editor, { anchor: Editor.start(editor, [0]), focus: editor.selection.anchor })
  const targets = { 'target-node': { ori: '优特智厨' }, 'another-node': { ori: '星厨' } }
  const $ = { dbMemory: { getItem: ky => targets[ky] }, crumbs: { getCrumbs: () => [] }, inlines: { createElement: (type, text, extra) => ({ inline: true, blockType: type, children: [{ text }], ...extra }) } }
  const refer = exports.createReferAddon({ $ }); $.refer = refer
  refer.getSuggestMenu({ editor }).map({ ky: 'another-node', ori: '星厨' }).handle({ editor })
  const linked = editor.children[0].children.find(n => n.blockType === 'refer')
  assert.equal(linked.value, 'another-node')
  assert.equal(linked.note, undefined)
  assert.equal(Node.string(linked), '星厨')
  assert.equal(Node.string(editor.children[0]).replace(/\u200b/g, ''), '前星厨后')
  assert.equal(targets['target-node'].ori, '优特智厨')
})
