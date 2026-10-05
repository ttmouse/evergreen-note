import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/slate-item/addons/Main/Main.tsx', import.meta.url), 'utf8')
const start = source.indexOf('  class Main implements')
const end = source.indexOf('\n  return { main: new Main() }')
const compiled = ts.transpileModule(`${source.slice(start, end)}; new Main()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText

function setup() {
  const app = { appName: 'test', states: { floatViewerMode: 'fixed', floatViewerList: [] } }
  const navigation = []
  const $ = {
    libAdmin: { current: { ky: 'lib-A' } },
    router: { history: { location: { pathname: '/static/note-A' } }, routes: { diaries: { title: '每日' } }, getRecordPath: () => $.router.history.location.pathname.replace('/static/', '') || 'diaries', toMain: key => navigation.push(key) },
    dbMemory: { getItem: key => ({ ky: key, title: key }) },
    andy: { scrollIntoView: id => navigation.push(id) },
  }
  const main = vm.runInNewContext(compiled, {
    app, $, document: { title: 'test', querySelector: () => ({ scrollTop: 80 }) },
    makeAutoObservable() {}, ROUTE_KEY: 'static', Item: { headString: item => item.title },
  })
  $.main = main
  return { main, $, app, navigation }
}

test('ordinary navigation adds unique tabs and retains their order', () => {
  const { main, $ } = setup()
  main.trackWorkspaceRoute()
  $.router.history.location.pathname = '/static/item/note-B'
  main.trackWorkspaceRoute()
  $.router.history.location.pathname = '/static/note-A'
  main.trackWorkspaceRoute('Renamed A')
  assert.deepEqual(Array.from(main.workspaceTabs, tab => tab.key), ['note-A', 'note-B'])
  assert.equal(main.workspaceTabs[0].title, 'Renamed A')
  assert.equal(main.workspaceActiveKey, 'note-A')
})
test('ordinary tabs switch a single route while retaining the source reading position', () => {
  const { main, navigation, $ } = setup()
  main.openWorkspaceTab('note-A', 'A')
  main.openWorkspaceTab('note-B', 'B')
  $.router.history.location.pathname = '/static/note-B'
  main.selectWorkspaceTab('note-A')
  assert.deepEqual(navigation, ['note-A'])
  assert.equal(main.workspaceScroll['note-B'], 80)
  assert.equal(main.workspaceTabs.length, 2)
})
test('closing inactive tabs keeps the current page; closing active tabs selects a neighbor', () => {
  const { main, navigation } = setup()
  for (const key of ['A', 'B', 'C']) main.openWorkspaceTab(key, key)
  main.closeWorkspaceTab('A')
  assert.deepEqual(navigation, [])
  main.closeWorkspaceTab('C')
  assert.deepEqual(navigation, ['B'])
  assert.equal(main.workspaceActiveKey, 'B')
})
test('Andy tabs locate the mounted column instead of pushing a route', () => {
  const { main, app, navigation } = setup()
  main.openWorkspaceTab('A', 'A')
  main.openWorkspaceTab('B', 'B')
  app.states.floatViewerMode = 'andy'
  app.states.floatViewerList = [{ key: 'A', dialogId: 'column-A' }]
  main.selectWorkspaceTab('A')
  assert.deepEqual(navigation, ['column-A'])
})
test('switching libraries cannot retain tabs pointing into the previous library', () => {
  const { main, $ } = setup()
  main.openWorkspaceTab('A', 'A')
  $.libAdmin.current.ky = 'lib-B'
  main.openWorkspaceTab('B', 'B')
  assert.deepEqual(Array.from(main.workspaceTabs, tab => tab.key), ['B'])
})
test('mode preparation keeps an existing diary title instead of renaming it', () => {
  const { main, $ } = setup()
  $.router.history.location.pathname = '/static/'
  main.trackWorkspaceRoute('2026-10-03')
  main.trackWorkspaceRoute()
  assert.equal(main.workspaceTabs[0].title, '2026-10-03')
})
test('a note link replaces the current tab in place and preserves other tabs', () => {
  const { main } = setup()
  for (const key of ['A', 'B', 'C']) main.openWorkspaceTab(key, key)
  main.workspaceActiveKey = 'B'
  main.replaceWorkspaceTab('B', 'D')
  assert.deepEqual(Array.from(main.workspaceTabs, tab => tab.key), ['A', 'D', 'C'])
  assert.equal(main.workspaceActiveKey, 'D')
})
test('links to an already opened note do not create duplicate tabs', () => {
  const { main } = setup()
  for (const key of ['A', 'B']) main.openWorkspaceTab(key, key)
  main.replaceWorkspaceTab('B', 'A')
  assert.deepEqual(Array.from(main.workspaceTabs, tab => tab.key), ['A', 'B'])
})
