const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_SHORTCUT = 'Control+Alt+N'
const MODIFIERS = new Set(['CommandOrControl', 'Command', 'Control', 'Alt', 'Shift', 'Super'])

function validateAccelerator(value) {
  if (typeof value !== 'string' || value.length > 100) return false
  if (value === '') return true
  const parts = value.split('+')
  const key = parts.pop()
  return parts.length > 0 && new Set(parts).size === parts.length &&
    parts.every(part => MODIFIERS.has(part)) && parts.some(part => part !== 'Shift') &&
    /^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Enter|Tab|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown|Backspace|Delete|[,./;'=\[\]\\-])$/.test(key)
}

function createWakeShortcut({ globalShortcut, configPath, showWindow }) {
  let accelerator = DEFAULT_SHORTCUT
  let error = ''
  try {
    const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (!validateAccelerator(stored.accelerator)) throw new Error('Invalid shortcut')
    accelerator = stored.accelerator
  } catch (cause) {
    if (cause.code !== 'ENOENT') {
      accelerator = ''
      error = '快捷键配置无法读取，请重新设置。'
    }
  }

  const get = () => ({ accelerator, registered: !!accelerator && globalShortcut.isRegistered(accelerator), error })
  const register = value => {
    try { return globalShortcut.register(value, showWindow) } catch { return false }
  }

  function start() {
    if (accelerator && !globalShortcut.isRegistered(accelerator) && !register(accelerator)) {
      error = '快捷键已被系统或其他应用占用，请换一个组合。'
    }
    return get()
  }

  function set(value) {
    if (!validateAccelerator(value)) return { ...get(), ok: false, error: '请使用修饰键加字母、数字或功能键的组合。' }
    const previous = accelerator
    const newlyRegistered = !!value && !globalShortcut.isRegistered(value)
    // Register the candidate first, preserving the old working binding on conflict.
    if (newlyRegistered && !register(value)) {
      return { ...get(), ok: false, error: '快捷键已被系统或其他应用占用，原快捷键已保留。' }
    }
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(`${configPath}.next`, JSON.stringify({ accelerator: value }) + '\n', { mode: 0o600 })
      fs.renameSync(`${configPath}.next`, configPath)
    } catch {
      if (newlyRegistered) globalShortcut.unregister(value)
      return { ...get(), ok: false, error: '配置保存失败，原快捷键已保留。' }
    }
    if (previous && previous !== value) globalShortcut.unregister(previous)
    accelerator = value
    error = ''
    return { ...get(), ok: true }
  }

  function stop() {
    if (accelerator) globalShortcut.unregister(accelerator)
  }

  return { get, start, set, stop }
}

module.exports = { createWakeShortcut, validateAccelerator }
