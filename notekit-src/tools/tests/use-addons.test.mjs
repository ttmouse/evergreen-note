import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const compiled = await build({
  stdin: {
    contents: `export { useAddons } from './src/slate-item/hooks/useAddons';
      export { ContextApp } from './src/slate-item/addons/UI/UIContexts';`,
    resolveDir: new URL('../..', import.meta.url).pathname,
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports,
)
const { useAddons, ContextApp } = module.exports

function readViews(app, count = 1) {
  const views = []
  function Probe() { views.push(useAddons()); return null }
  renderToStaticMarkup(React.createElement(ContextApp.Provider, { value: app },
    Array.from({ length: count }, (_, key) => React.createElement(Probe, { key })),
  ))
  return views
}

test('hundreds of editor children share one addon view without copying the registry again', () => {
  let reads = 0
  const plugin = { state: { count: 0 } }
  const addons = { get plugin() { reads++; return plugin } }
  const app = { addons }
  const views = readViews(app, 500)
  assert.equal(reads, 1)
  assert.ok(views.every(view => view === views[0]))
  assert.equal(readViews(app)[0], views[0])
  assert.equal(views[0].app, app)
  plugin.state.count = 2
  assert.equal(views[0].plugin.state.count, 2)
})

test('a restart replaces the addon view and separate apps retain their own plugins', () => {
  const app = { addons: { plugin: { id: 'old' } } }
  const old = readViews(app)[0]
  app.addons = { plugin: { id: 'new' } }
  const current = readViews(app)[0]
  assert.notEqual(current, old)
  assert.equal(current.plugin.id, 'new')
  const other = { addons: { plugin: { id: 'other' } } }
  const otherView = readViews(other)[0]
  assert.equal(otherView.app, other)
  assert.equal(otherView.plugin.id, 'other')
})
