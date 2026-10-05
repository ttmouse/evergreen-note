import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/slate-item/addons/Main/MainComp.tsx', import.meta.url), 'utf8')
const helper = readFileSync(new URL('../../src/slate-item/addons/EditorView/helper.tsx', import.meta.url), 'utf8')
const compile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText
const componentCode = compile(source.slice(source.indexOf('export const MainToolbarComp'), source.indexOf('export const MainCrumbsComp')).replace('export const', 'const') + '\nMainToolbarComp')
const helperCode = compile(helper.slice(helper.indexOf('export function obj2list'), helper.indexOf('export function domSelect')).replace('export function', 'function') + '\nobj2list')
const obj2list = vm.runInNewContext(helperCode, { isEmpty: value => value == null || Object.keys(value).length === 0 })

function setup(action = () => {}) {
  const calls = []
  const main = {
    ids: { extra: 'main-toolbar' },
    extraCommands: { more: { id: 'original-more', icon: 'svg_more' } },
    moreExtraCommands: { settings: { title: 'Settings', onClick: event => { calls.push(['action', event]); action() } } },
  }
  const render = vm.runInNewContext(componentCode, {
    React: { useMemo: fn => fn(), createElement: (type, props) => ({ type, props }) },
    useAddons: () => ({ main }), obj2list, extraHotkey() {}, PartExtra: 'PartExtra',
    rowStyles: [{ extra: '' }],
    setSubVisible: (id, visible) => calls.push(['close', id, visible]),
  })
  return { render, calls, main }
}

test('click closes the rendered menu ID before executing the command once', () => {
  const { render, calls, main } = setup()
  const more = render({}).props.extra.find(cmd => cmd.name === 'more')
  const event = { type: 'click' }
  more.subitems[0].onClick(event)
  assert.deepEqual(calls, [['close', more.id, false], ['action', event]])
  assert.equal(main.extraCommands.more.id, 'original-more')
})

test('normal and Andy toolbars close their own menu after conversion and rerender', () => {
  const { render, calls } = setup()
  for (const id of ['main-toolbar', 'main-toolbar-andy', 'main-toolbar']) {
    const more = render({ id }).props.extra.find(cmd => cmd.name === 'more')
    assert.equal(more.id, `${id}-more-dropdown`)
    more.subitems[0].onClick({})
    assert.equal(calls.at(-2)[1], more.id)
  }
})

test('a failing command still closes the menu', () => {
  const { render, calls } = setup(() => { throw new Error('command failure') })
  const more = render({}).props.extra.find(cmd => cmd.name === 'more')
  assert.throws(() => more.subitems[0].onClick({}), /command failure/)
  assert.deepEqual(calls[0], ['close', more.id, false])
})
