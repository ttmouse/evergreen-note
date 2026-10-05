import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/slate-item/addons/Router/Router.tsx', import.meta.url), 'utf8')
const start = source.indexOf('    to(toPath:')
const end = source.indexOf('      return this.toMain(', start)
const compiled = ts.transpileModule(`class Router { floatViewZoomIn() { return false }; ${source.slice(start, end)} return 'main' } }; new Router()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText
function navigate(mode, shift = false, inNote = true) {
  const calls = []
  const app = { states: { floatViewerMode: mode }, isAddonEnabled: () => true }
  const $ = {
    main: { workspaceActiveKey: 'source', replaceWorkspaceTab: (...args) => calls.push(['replace', ...args]) },
    router: { routes: {} },
    keyClick: { openInAndyMode: key => calls.push(['new-column', key]), openInRightSide: key => calls.push(['side', key]) },
    andy: { navigate: (key, source) => calls.push(['navigate', key, source]) },
  }
  class HTMLElement {}
  const router = vm.runInNewContext(compiled, { app, $, HTMLElement, SVGElement: HTMLElement, document: { querySelector: () => ({ closest: () => ({ id: 'source-column' }) }) }, keyState: { hasPressed: () => shift, isPressed: key => key === 'shift' && shift } })
  router.to('item/destination', {}, inNote ? {} : null)
  return calls
}
test('plain clicks inside a regular note replace its active tab', () => {
  assert.deepEqual(navigate('fixed'), [['replace', 'source', 'destination']])
})
test('Shift clicks in regular mode leave the source tab for the destination route to add a new tab', () => {
  assert.deepEqual(navigate('fixed', true), [])
})
test('Shift clicks in Andy follow the current column navigation rule', () => {
  assert.deepEqual(navigate('andy', true), [['navigate', 'destination', 'source-column']])
})
test('plain clicks in Andy preserve path navigation from the source column', () => {
  assert.deepEqual(navigate('andy'), [['navigate', 'destination', 'source-column']])
})
test('sidebar navigation is not mistaken for a link inside a note', () => {
  assert.deepEqual(navigate('fixed', false, false), [])
})

test('Andy note links bypass floating-note replacement so path navigation handles them', () => {
  const methodStart = source.indexOf('    floatViewZoomIn(')
  const methodEnd = source.indexOf('\n    /**', methodStart)
  const zoomCompiled = ts.transpileModule(`class Router { ${source.slice(methodStart, methodEnd)} }; new Router()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const events = []
  const floatview = { parentElement: { matches: () => false }, dispatchEvent: event => events.push(event) }
  class HTMLElement { closest() { return floatview } }
  const app = { states: { floatViewerMode: 'andy' } }
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail } }
  const router = vm.runInNewContext(zoomCompiled, { app, HTMLElement, SVGElement: HTMLElement, CustomEvent })
  assert.equal(router.floatViewZoomIn('destination', new HTMLElement()), false)
  assert.equal(events.length, 0)
  app.states.floatViewerMode = 'fixed'
  assert.equal(router.floatViewZoomIn('destination', new HTMLElement()), true)
  assert.equal(events[0].detail, 'destination')
})
