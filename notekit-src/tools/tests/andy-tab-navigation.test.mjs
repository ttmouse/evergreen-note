import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const source = readFileSync(new URL('../../src/slate-item/addons/Andy/Andy.tsx', import.meta.url), 'utf8')
const method = source.slice(source.indexOf('    scrollIntoView(dialogId:'), source.indexOf('    addonInfo()'))
const compiled = ts.transpileModule(`class Andy { ${method} }; new Andy()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
function reveal(start, left, viewport = 1000, screen = 1440) {
  const calls = []
  const container = { scrollLeft: left, clientWidth: viewport, scrollTo: args => calls.push(args.left) }
  const el = { offsetWidth: 625, offsetLeft: start, closest: () => container }
  const active = []
  const instance = vm.runInNewContext(compiled, {
    document: { getElementById: () => el }, app: { states: { floatViewerMode: 'andy' } },
    $: { floatViewer: { setActiveKey: id => active.push(id) } },
    window: { innerWidth: screen, matchMedia: () => ({ matches: true }) },
  })
  instance.scrollIntoView('note')
  assert.deepEqual(active, ['note'])
  return calls
}
test('tab reveals a preceding note fully without reserving spine space', () => assert.deepEqual(reveal(625, 900), [625]))
test('tab reveals the end of a note to the right', () => assert.deepEqual(reveal(1250, 0), [875]))
test('already visible note keeps the viewport still', () => assert.deepEqual(reveal(625, 500), []))
test('narrow layout switches active note without horizontal offset', () => assert.deepEqual(reveal(1250, 100, 700, 700), [0]))
