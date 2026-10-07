const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createWakeShortcut, validateAccelerator } = require('./wake-shortcut.cjs')

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'evergreen-wake-test-'))
  const configPath = path.join(directory, 'desktop-shortcut.json')
  const registered = new Map()
  const occupied = new Set()
  const globalShortcut = {
    isRegistered: value => registered.has(value),
    register(value, callback) {
      if (occupied.has(value)) return false
      registered.set(value, callback)
      return true
    },
    unregister: value => registered.delete(value),
  }
  let calls = 0
  const options = { globalShortcut, configPath, showWindow: () => calls++ }
  const controller = createWakeShortcut(options)
  return { directory, configPath, registered, occupied, controller, options, calls: () => calls }
}

test('default binding invokes the wake callback', () => {
  const f = fixture()
  assert.equal(f.controller.start().registered, true)
  f.registered.get('Control+Alt+N')()
  assert.equal(f.calls(), 1)
})

test('changing the binding persists it and releases the previous binding', () => {
  const f = fixture()
  f.controller.start()
  assert.equal(f.controller.set('Command+Shift+K').ok, true)
  assert.equal(f.registered.has('Control+Alt+N'), false)
  assert.equal(f.registered.has('Command+Shift+K'), true)
  assert.equal(JSON.parse(fs.readFileSync(f.configPath)).accelerator, 'Command+Shift+K')
  f.controller.stop()
  assert.equal(createWakeShortcut(f.options).start().accelerator, 'Command+Shift+K')
})

test('occupied replacement preserves both the old binding and saved configuration', () => {
  const f = fixture()
  f.controller.set('Control+Alt+N')
  f.occupied.add('Command+Shift+K')
  assert.equal(f.controller.set('Command+Shift+K').ok, false)
  assert.equal(f.controller.get().accelerator, 'Control+Alt+N')
  assert.equal(f.registered.has('Control+Alt+N'), true)
  assert.equal(JSON.parse(fs.readFileSync(f.configPath)).accelerator, 'Control+Alt+N')
})

test('disk write failure rolls back candidate registration', () => {
  const f = fixture()
  f.controller.start()
  fs.mkdirSync(`${f.configPath}.next`)
  assert.equal(f.controller.set('Control+Alt+K').ok, false)
  assert.equal(f.registered.has('Control+Alt+K'), false)
  assert.equal(f.registered.has('Control+Alt+N'), true)
})

test('disable survives a restart and only releases the owned binding', () => {
  const f = fixture()
  f.controller.start()
  f.registered.set('Control+Alt+J', () => {})
  assert.equal(f.controller.set('').ok, true)
  assert.equal(f.controller.get().registered, false)
  assert.equal(createWakeShortcut(f.options).start().accelerator, '')
  f.controller.stop()
  assert.equal(f.registered.has('Control+Alt+J'), true)
})

test('startup conflict is visible and can be retried once available', () => {
  const f = fixture()
  f.occupied.add('Control+Alt+N')
  assert.equal(f.controller.start().registered, false)
  assert.match(f.controller.get().error, /占用/)
  f.occupied.delete('Control+Alt+N')
  assert.equal(f.controller.set('Control+Alt+N').registered, true)
  assert.equal(f.controller.get().error, '')
})

test('corrupt configuration is reported instead of silently overwritten', () => {
  const f = fixture()
  fs.writeFileSync(f.configPath, '{broken')
  const controller = createWakeShortcut(f.options)
  assert.equal(controller.start().registered, false)
  assert.match(controller.get().error, /配置/)
  assert.equal(fs.readFileSync(f.configPath, 'utf8'), '{broken')
})

test('IPC input validation rejects bare keys, duplicates and malformed payloads', () => {
  for (const value of [null, {}, 'N', 'Shift+N', 'Alt+Alt+N', 'Command+MediaPlayPause', 'Control+bogus']) {
    assert.equal(validateAccelerator(value), false)
  }
  for (const value of ['', 'Control+Alt+N', 'Command+Shift+F12', 'Alt+,', 'Control+\\']) {
    assert.equal(validateAccelerator(value), true)
  }
})
