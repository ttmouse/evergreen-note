// 设置面板的原生入口与「打开设置」快捷键。
//
// 注意（2026-10-07 真机实测）：菜单 accelerator 声明 CommandOrControl+Escape 后，AppKit
// 会在按键派发层吞掉 ⌘Esc——菜单点击不触发、页面 keydown 也收不到（隔离实例里 CDP 注入
// 绕过 AppKit 才能到达渲染层；真机日志无「打开设置失败」）。因此菜单项不声明 accelerator，
// 真实按键统一由 main.cjs 的 before-input-event 按用户配置的组合匹配，组合存放在
// settings-shortcut.json，可在设置面板里改（SettingsHotkeySetting）。
const fs = require('node:fs')
const path = require('node:path')
const { validateAccelerator } = require('./wake-shortcut.cjs')

const openSettings = `(() => {
  const prefer = window.__notekitApp?.addons?.prefer
  if (!prefer) throw new Error('设置服务尚未就绪')
  const visible = [...document.querySelectorAll('.preferences-dialog')].some(el =>
    el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
  if (!visible) prefer.showCfgForm()
  return true
})()`

function createSettingsMenuItem(getWindow, reportError) {
  return {
    id: 'preferences',
    label: '设置…',
    // 故意没有 accelerator：见文件头注释。快捷键提示由设置面板展示。
    click: () => openSettingsInPage(getWindow, reportError),
  }
}

// 菜单点击与 before-input-event 共用的执行体：都在主进程里往页面注入打开设置调用。
async function openSettingsInPage(getWindow, reportError) {
  const window = getWindow()
  if (!window || window.isDestroyed()) return
  try {
    await window.webContents.executeJavaScript(openSettings)
  } catch (error) {
    reportError(`[shell] 打开设置失败: ${error}`)
  }
}

const DEFAULT_ACCELERATOR = 'CommandOrControl+Escape'

// accelerator → 匹配器。CommandOrControl 按平台展开（darwin=⌘，其余=Ctrl）。
function acceleratorToMatcher(accelerator, darwin) {
  const parts = String(accelerator || '').split('+').filter(Boolean)
  const key = String(parts.pop() || '').toLowerCase()
  const mods = { meta: false, control: false, alt: false, shift: false }
  for (const part of parts) {
    if (part === 'CommandOrControl') { if (darwin) mods.meta = true; else mods.control = true }
    else if (part === 'Command' || part === 'Super') mods.meta = true
    else if (part === 'Control') mods.control = true
    else if (part === 'Alt') mods.alt = true
    else if (part === 'Shift') mods.shift = true
  }
  return { key, mods }
}

// before-input-event 的 input 是否命中 accelerator。全等比较（多按/少按修饰键都不算），
// ⌘⇧Esc（关闭全部对话框）、⌘⌥⇧Esc 等专门命令不会被抢占。
function matchesShortcutInput(accelerator, input, darwin = process.platform === 'darwin') {
  if (!input || input.type !== 'keyDown') return false
  const { key, mods } = acceleratorToMatcher(accelerator, darwin)
  if (!key) return false
  if (String(input.key || '').toLowerCase() !== key) return false
  return mods.meta === !!input.meta && mods.control === !!input.control &&
    mods.alt === !!input.alt && mods.shift === !!input.shift
}

// 用户自定义「打开设置」组合：配置文件 + 校验，模式与 wake-shortcut 一致。
// 组合校验复用 validateAccelerator（修饰键 + 字母/数字/功能键，不允许裸键）。
function createSettingsShortcut({ configPath }) {
  let accelerator = DEFAULT_ACCELERATOR
  let error = ''
  try {
    const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (!validateAccelerator(stored.accelerator)) throw new Error('Invalid shortcut')
    accelerator = stored.accelerator
  } catch (cause) {
    if (cause.code !== 'ENOENT') error = '快捷键配置无法读取，已恢复默认 ⌘Esc。'
  }
  const get = () => ({ accelerator, error })
  function set(value) {
    if (!validateAccelerator(value)) return { ...get(), ok: false, error: '请使用修饰键加字母、数字或功能键的组合。' }
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(`${configPath}.next`, JSON.stringify({ accelerator: value }) + '\n', { mode: 0o600 })
      fs.renameSync(`${configPath}.next`, configPath)
    } catch {
      return { ...get(), ok: false, error: '配置保存失败，请重试。' }
    }
    accelerator = value
    error = ''
    return { ...get(), ok: true }
  }
  return { get, set }
}

module.exports = {
  createSettingsMenuItem,
  openSettingsInPage,
  createSettingsShortcut,
  matchesShortcutInput,
  acceleratorToMatcher,
  DEFAULT_ACCELERATOR,
}
