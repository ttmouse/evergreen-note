import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the actual mode transition with browser/navigation boundaries stubbed.
const source = readFileSync(new URL('../../src/slate-item/addons/FloatViewer/FloatViewer.tsx', import.meta.url), 'utf8')
const method = source.slice(source.indexOf('    setModeAll('), source.indexOf('    toggleAll()'))
const compiled = ts.transpileModule(`class Viewer { ${method} }; new Viewer()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function transition(pathname, routeKey, mode = 'andy', dialogs = [], tabs = []) {
  const opened = []
  const closed = []
  const converted = []
  const navigation = []
  const crumbs = { style: {} }
  const app = { states: { floatViewerList: [...dialogs], floatViewerMode: mode === 'fixed' ? 'andy' : 'fixed' } }
  const $ = {
    main: { workspaceTabs: tabs, workspaceActiveKey: tabs[0]?.key || 'diaries', workspaceScroll: {}, trackWorkspaceRoute() {}, rememberWorkspaceScroll() {} },
    router: { history: { location: { pathname, search: '?lib=test' }, block: () => () => {}, replace: path => navigation.push(path) }, fix: key => `/${routeKey}/${key}`, mark() {}, to: path => navigation.push(path) },
    keyClick: { openInAndyMode: (...args) => opened.push(args) },
    floatViewer: { setMode: (...args) => converted.push(args) },
    dialog: { close(id) {
      assert.equal(app.states.floatViewerMode, 'fixed')
      closed.push(id)
      // Match the close hook removing each viewer from the live list.
      app.states.floatViewerList.splice(app.states.floatViewerList.findIndex(d => d.dialogId === id), 1)
    } },
  }
  const viewer = vm.runInNewContext(compiled, {
    app, $, ROUTE_KEY: routeKey, original: fn => fn,
    document: { getElementById: () => ({ ...crumbs, querySelector: () => null }) }, location: { pathname },
    atLater: fn => fn(), showSnack() {}, $t() {},
  })
  viewer.setModeAll(mode)
  return { opened, closed, converted, navigation, app, crumbs }
}

for (const base of ['static', 'v2', 'share']) {
  test(`switch preserves note ID under /${base}/item/`, () => {
    const result = transition(`/${base}/item/note-A`, base)
    assert.equal(result.opened[0][0], 'note-A')
    assert.equal(result.app.states.floatViewerMode, 'andy')
    assert.equal(result.crumbs.style.display, 'none')
  })
}
test('decodes a note ID like the normal editor route', () => {
  assert.equal(transition('/static/item/note%20A', 'static').opened[0][0], 'note A')
})
test('preserves direct note routes used by topic navigation', () => {
  assert.equal(transition('/static/u4bM-topic-noteA', 'static').opened[0][0], 'u4bM-topic-noteA')
})
test('preserves special pages and the default diary page', () => {
  assert.equal(transition('/static/diaries', 'static').opened[0][0], 'diaries')
  assert.equal(transition('/static/', 'static').opened[0][0], 'diaries')
  assert.equal(transition('/static/andyMode', 'static').opened.length, 0)
})
test('exiting restores the ordinary view', () => {
  const result = transition('/static/andyMode', 'static', 'fixed')
  assert.equal(result.opened.length, 0)
  assert.equal(result.crumbs.style.display, 'block')
  assert.deepEqual(result.navigation, ['/static/diaries?lib=test'])
})
test('exiting Andy closes every column without converting them into floating windows', () => {
  const result = transition('/static/andyMode', 'static', 'fixed', [
    { dialogId: 'note-A' }, { dialogId: 'note-B' }, { dialogId: 'note-C' },
  ])
  assert.deepEqual(result.closed, ['note-A', 'note-B', 'note-C'])
  assert.deepEqual(result.converted, [])
  assert.equal(result.app.states.floatViewerList.length, 0)
  assert.deepEqual(result.navigation, ['/static/diaries?lib=test'])
})
test('entering Andy opens all regular tabs in their existing order', () => {
  const tabs = [{ key: 'note-A', title: 'A' }, { key: 'note-B', title: 'B' }]
  const result = transition('/static/note-A', 'static', 'andy', [], tabs)
  assert.deepEqual(result.opened, [['note-A', 0], ['note-B', 1]])
})
test('exiting Andy retains the tabs and restores the active note directly', () => {
  const tabs = [{ key: 'note-B', title: 'B' }, { key: 'note-A', title: 'A' }]
  const result = transition('/static/andyMode', 'static', 'fixed', [{ dialogId: 'note-B' }], tabs)
  assert.deepEqual(result.navigation, ['/static/note-B?lib=test'])
  assert.equal(tabs.length, 2)
})
