import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/slate-item/addons/Codeblock/loadCodeMirrorMode.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports })
const { loadCodeMirrorMode } = exports

test('missing shell mode does not prevent a later JavaScript block from loading', async () => {
  const requested = []
  const loader = { loadMode: async mode => {
    requested.push(mode)
    if (mode === 'shell') throw new Error('404')
  } }
  assert.equal(await loadCodeMirrorMode(loader, 'shell'), false)
  assert.equal(await loadCodeMirrorMode(loader, 'javascript'), true)
  assert.deepEqual(requested, ['shell', 'javascript'])
})
test('plain text makes no script request and embedded mode loads its dependency first', async () => {
  const requested = []
  const loader = { loadMode: async mode => requested.push(mode) }
  assert.equal(await loadCodeMirrorMode(loader), false)
  assert.equal(await loadCodeMirrorMode(loader, 'text/plain'), false)
  assert.deepEqual(requested, [])
  assert.equal(await loadCodeMirrorMode(loader, 'htmlembedded'), true)
  assert.deepEqual(requested, ['multiplex', 'htmlembedded'])
})
