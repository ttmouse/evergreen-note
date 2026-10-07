const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSettingsMenuItem, openSettingsInPage, createSettingsShortcut, matchesShortcutInput, DEFAULT_ACCELERATOR } = require('./settings-menu.cjs')

test('menu item has NO accelerator: AppKit swallows Escape equivalents (2026-10-07 真机实测)', async () => {
  let calls = 0
  const item = createSettingsMenuItem(() => null, () => calls++)
  assert.equal(item.id, 'preferences')
  assert.equal(item.accelerator, undefined, 'accelerator 会吞键且点击不触发，必须缺席')
  await item.click()
  assert.equal(calls, 0)
  await createSettingsMenuItem(() => ({ isDestroyed: () => true }), () => calls++).click()
  assert.equal(calls, 0)
})

test('native route reports renderer failures without an unhandled rejection', async () => {
  const errors = []
  const item = createSettingsMenuItem(() => ({
    isDestroyed: () => false,
    webContents: { executeJavaScript: async () => { throw Error('not ready') } },
  }), message => errors.push(message))
  await item.click()
  assert.match(errors[0], /打开设置失败.*not ready/)
})

test('openSettingsInPage skips destroyed windows and reports renderer failures', async () => {
  const errors = []
  await openSettingsInPage(() => null, message => errors.push(message))
  await openSettingsInPage(() => ({ isDestroyed: () => true }), message => errors.push(message))
  assert.equal(errors.length, 0)
  await openSettingsInPage(() => ({
    isDestroyed: () => false,
    webContents: { executeJavaScript: async () => { throw Error('renderer gone') } },
  }), message => errors.push(message))
  assert.match(errors[0], /打开设置失败.*renderer gone/)
})

const key = (over) => ({ type: 'keyDown', key: 'Escape', meta: false, control: false, alt: false, shift: false, ...over })

test('matchesShortcutInput: full-equality matching, CommandOrControl expands per platform', () => {
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ meta: true }), true), true, 'mac ⌘Esc')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ control: true }), true), false, 'mac 上 Ctrl≠⌘')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ control: true }), false), true, 'win Ctrl+Esc')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ meta: true }), false), false, 'win 上 ⌘位(meta)≠Ctrl')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ meta: true, shift: true }), true), false, '⌘⇧Esc 已有关闭全部对话框命令，不抢占')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ meta: true, alt: true }), true), false, '⌘⌥Esc 是强制退出肌肉记忆')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({}), true), false, '裸 Esc')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ meta: true, type: 'keyUp' }), true), false, 'keyUp 不触发')
  assert.equal(matchesShortcutInput('CommandOrControl+Escape', key({ meta: true, key: 'p' }), true), false, '非 Escape 键')
  assert.equal(matchesShortcutInput('CommandOrControl+E', key({ meta: true, key: 'e' }), true), true, '字母键小写归一')
  assert.equal(matchesShortcutInput('', key({ meta: true }), true), false, '空组合=禁用，永不命中')
  assert.equal(matchesShortcutInput(DEFAULT_ACCELERATOR, null, true), false)
})

test('createSettingsShortcut: defaults, persist, reject invalid, survive corrupt config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-shortcut-'))
  const configPath = path.join(dir, 'settings-shortcut.json')

  const fresh = createSettingsShortcut({ configPath })
  assert.deepEqual(fresh.get(), { accelerator: 'CommandOrControl+Escape', error: '' })

  const saved = fresh.set('CommandOrControl+,')
  assert.equal(saved.ok, true)
  assert.equal(saved.accelerator, 'CommandOrControl+,')
  assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).accelerator, 'CommandOrControl+,')

  const reloaded = createSettingsShortcut({ configPath })
  assert.equal(reloaded.get().accelerator, 'CommandOrControl+,')

  assert.equal(fresh.set('Q').ok, false, '裸键拒绝')
  assert.equal(fresh.set('Shift+A').ok, false, '仅 Shift 拒绝')
  // 注：CommandOrControl+Command 字符串去重不报错是共享校验器的既有语义，
  // 展开后等价于单 ⌘（mods.meta=true 两次赋值无害），不在此收窄。
  assert.equal(fresh.get().accelerator, 'CommandOrControl+,', '失败保存不影响现有组合')

  fs.writeFileSync(configPath, '{ broken')
  const corrupt = createSettingsShortcut({ configPath })
  assert.equal(corrupt.get().accelerator, 'CommandOrControl+Escape')
  assert.match(corrupt.get().error, /恢复默认/)

  fs.writeFileSync(configPath, JSON.stringify({ accelerator: 'not-a-key' }))
  assert.equal(createSettingsShortcut({ configPath }).get().accelerator, 'CommandOrControl+Escape')

  fs.rmSync(dir, { recursive: true, force: true })
})
