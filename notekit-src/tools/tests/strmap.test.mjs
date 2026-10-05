import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'
import { createEditor, Editor, Transforms, Node, Text, Range, Path } from 'slate'
import { withHistory, HistoryEditor } from 'slate-history'
function load(file, dependencies = {}) {
  const source = readFileSync(new URL('../../src/slate-item/addons/Strmap/' + file, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, console, require: name => dependencies[name] ?? {} })
  return exports
}
const custom = load('customRules.ts')
const { compileCustomRules, DEFAULT_STRMAP_CONTENT } = custom
const { createStrmapAddon } = load('Strmap.ts', {
  './customRules': custom,
  '../../slate.inc': { Editor, Transforms, Node, Text, Range, Path },
  'slate-history': { HistoryEditor },
  '../EventHandler/checkCaret': { checkCaret: () => ({ atQuote: () => false }) },
  '../../utils/isEmpty': { isEmpty: v => v == null || v === '' },
})
function editorWith(text) {
  const editor = withHistory(createEditor())
  editor.children = [{ children: [{ text }] }]
  Transforms.select(editor, { path: [0, 0], offset: text.length })
  editor.itemTextBeforeCaret = () => Node.string(editor.children[0]).slice(0, editor.selection.anchor.offset)
  editor.itemPath = () => [0]
  editor.item = () => editor.children[0]
  editor.deleteRange = range => Transforms.delete(editor, { at: range })
  return editor
}
function convert(content, text) {
  const addon = createStrmapAddon({})
  addon.customRules = compileCustomRules(content)
  const editor = editorWith(text)
  addon.processTextChange(editor)
  return { addon, editor, text: Node.string(editor.children[0]) }
}
test('default literal, regex, date and caret mappings run in the actual Slate engine', () => {
  assert.equal(convert(DEFAULT_STRMAP_CONTENT, 'a>=').text, 'a≥')
  assert.equal(convert(DEFAULT_STRMAP_CONTENT, ';yy').text, '✓')
  assert.equal(convert(DEFAULT_STRMAP_CONTENT, '^12s').text, '¹²')
  assert.match(convert(DEFAULT_STRMAP_CONTENT, ';now').text, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d /)
  const caret = convert(DEFAULT_STRMAP_CONTENT, '<<')
  assert.equal(caret.text, '《》')
  assert.equal(caret.editor.selection.anchor.offset, 1)
})
test('literal escaping, suffix matching and empty replacement preserve surrounding text', () => {
  assert.equal(convert('{"a.b": "X"}', 'aab').text, 'aab')
  assert.equal(convert('{"a.b": "X"}', 'pre a.b').text, 'pre X')
  assert.equal(convert('{"xx": ""}', 'pre xx').text, 'pre ')
  assert.equal(convert('{"xx": "Y"}', 'xx tail').text, 'xx tail')
})
test('invalid configurations are rejected before persistence or active rules change', async () => {
  const addon = createStrmapAddon({})
  let saves = 0
  addon.app = { addons: { prefer: { setValue: async () => saves++ } } }
  await addon.saveCustomRules('{"x": "one"}')
  const previous = addon.customRules
  for (const content of ['{', '[]', '{"x": 1}', '{"/[/": "x"}', '{"/a*/": "x"}']) {
    await assert.rejects(addon.saveCustomRules(content))
    assert.equal(addon.customRules, previous)
  }
  assert.equal(saves, 1)
  await addon.saveCustomRules('{"y": "two"}')
  assert.deepEqual(Object.keys(addon.customRules), ['y'])
  await addon.saveCustomRules('')
  assert.equal(Object.keys(addon.customRules).length, 0)
})
test('custom mapping does not cascade, undo restores trigger, inline code stays literal', () => {
  const result = convert('{"x": "y", "y": "z"}', 'x')
  assert.equal(result.text, 'y')
  result.editor.undo()
  assert.equal(Node.string(result.editor.children[0]), 'x')
  const editor = editorWith('x')
  editor.children[0].children[0].code = true
  result.addon.processTextChange(editor)
  assert.equal(Node.string(editor.children[0]), 'x')
})
