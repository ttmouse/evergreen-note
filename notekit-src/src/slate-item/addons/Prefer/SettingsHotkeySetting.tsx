import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { isMyHotkey } from '../Hotkey/helper'
import { displayShortcut } from './DesktopShortcutSetting'
import './desktop-shortcut.css'

// 「打开设置面板」快捷键的自定义入口。执行方是主进程 before-input-event
// （settings-menu.cjs 的 matchesShortcutInput + settings-shortcut.json），
// 这里只负责录制、冲突检查与保存；录制期间用 captureWakeShortcut(true) 让主进程让路。
type ShortcutState = { accelerator: string; error: string }
type DesktopBridge = {
  platform: string
  getSettingsShortcut: () => Promise<ShortcutState>
  setSettingsShortcut: (value: string) => Promise<ShortcutState & { ok: boolean }>
  captureWakeShortcut: (value: boolean) => Promise<void>
}

// macOS 系统菜单保留组合（退出/隐藏/最小化），录了也会被 AppKit 抢走。
const MENU_RESERVED = ['mod+q', 'mod+h', 'mod+m']
const DEFAULT_ACCELERATOR = 'CommandOrControl+Escape' // 与 settings-menu.cjs 保持一致

export function SettingsHotkeySetting() {
  const shell = (window as Window & { notekitShell?: DesktopBridge }).notekitShell
  const $ = useAddons()
  const [state, setState] = React.useState<ShortcutState>()
  const [draft, setDraft] = React.useState('')
  const [recording, setRecording] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const mounted = React.useRef(true)
  const recorder = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    mounted.current = true
    shell?.getSettingsShortcut().then(result => {
      if (!mounted.current) return
      setState(result)
      setDraft(result.accelerator)
    }).catch(() => mounted.current && setMessage('无法读取快捷键设置，请重试。'))
    return () => { mounted.current = false; void shell?.captureWakeShortcut(false) }
  }, [])

  React.useEffect(() => {
    if (!recording) return
    recorder.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.key === 'Escape') { setRecording(false); return }
      const physical = /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code)?.[1]
      const named: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\' }
      const key = physical ?? named[event.code] ?? event.code
      if (!/^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Enter|Tab|Up|Down|Left|Right|Home|End|PageUp|PageDown|Backspace|Delete|[,./;'=\[\]\\-])$/.test(key)) return
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        setMessage('请同时按住 Command、Control 或 Option 等修饰键。')
        return
      }
      const parts = []
      if (event.metaKey) parts.push('Command')
      if (event.ctrlKey) parts.push('Control')
      if (event.altKey) parts.push('Alt')
      if (event.shiftKey) parts.push('Shift')
      parts.push(key)
      setDraft(parts.join('+'))
      setMessage('按“保存”后生效。')
      setRecording(false)
    }
    const cancel = () => setRecording(false)
    // Window capture runs before the application's document/editor hotkey handlers.
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', cancel)
      void shell?.captureWakeShortcut(false).catch(() => {})
    }
  }, [recording])

  async function beginRecording() {
    setBusy(true)
    try {
      await shell?.captureWakeShortcut(true)
      if (mounted.current) { setMessage(''); setRecording(true) }
      else await shell?.captureWakeShortcut(false)
    } catch { if (mounted.current) setMessage('无法录制快捷键，请重试。') }
    finally { if (mounted.current) setBusy(false) }
  }

  function conflictOf(value: string) {
    return Object.values($.hotkey.commands).find(cmd => cmd.hotkey && isMyHotkey(cmd.hotkey, { byKey: true }, { key: fakeKeyOf(value), metaKey: value.includes('Command'), ctrlKey: value.includes('Control'), altKey: value.includes('Alt'), shiftKey: value.includes('Shift') } as KeyboardEvent))
  }

  async function save(value: string) {
    if (MENU_RESERVED.some(reserved => isMyHotkey(reserved, { byKey: true }, { key: fakeKeyOf(value), metaKey: value.includes('Command'), ctrlKey: value.includes('Control'), altKey: value.includes('Alt'), shiftKey: value.includes('Shift') } as KeyboardEvent))) {
      setMessage('这个组合被系统菜单（退出/隐藏/最小化）占用，请换一个。')
      return
    }
    const conflict = conflictOf(value)
    if (conflict) { setMessage(`这个组合已用于“${conflict.title}”，请换一个。`); return }
    setBusy(true)
    try {
      const result = await shell!.setSettingsShortcut(value)
      if (!mounted.current) return
      setState(result)
      if (result.ok) { setDraft(result.accelerator); setMessage('已保存，立即生效。') }
      else setMessage(result.error)
    } catch { if (mounted.current) setMessage('保存失败，请重试。') }
    finally { if (mounted.current) setBusy(false) }
  }

  if (!shell?.getSettingsShortcut) return null
  return (
    <section className="desktop-shortcut-setting" aria-label="打开设置面板快捷键">
      <h3>打开设置面板快捷键</h3>
      <p>在常青笔记内按下该组合即打开设置面板（默认 ⌘Esc）。组合可随时更改；在应用外唤起请用上方「全局唤起快捷键」。</p>
      <div className="desktop-shortcut-controls">
        <button type="button" ref={recorder} aria-label="录制打开设置面板快捷键" aria-pressed={recording}
          disabled={busy || !state} onClick={() => recording ? setRecording(false) : void beginRecording()}>
          {recording ? '请按快捷键…（Esc 取消）' : draft ? displayShortcut(draft, shell.platform === 'darwin') : '点击录制快捷键'}
        </button>
        <button type="button" disabled={busy || recording || !state || !draft || draft === state.accelerator} onClick={() => void save(draft)}>保存</button>
        <button type="button" disabled={busy || recording || !state || state.accelerator === DEFAULT_ACCELERATOR} onClick={() => void save(DEFAULT_ACCELERATOR)}>恢复默认 ⌘Esc</button>
      </div>
      <p role="status" aria-live="polite">{message || state?.error || (state ? `当前生效：${displayShortcut(state.accelerator, shell.platform === 'darwin')}` : '正在读取…')}</p>
    </section>
  )
}

// 从 accelerator 串反推一个最小 key 供 isMyHotkey 匹配（字母/数字/功能键/常见标点）。
function fakeKeyOf(accelerator: string) {
  const parts = accelerator.split('+').filter(Boolean)
  const key = parts[parts.length - 1] ?? ''
  if (/^[a-z]$/i.test(key)) return key.toLowerCase()
  if (/^[0-9]$/.test(key)) return key
  if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return key
  return { Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Space: ' ', ',': ',', '.': '.', '/': '/', ';': ';', "'": "'", '[': '[', ']': ']', '\\': '\\', '-': '-', '=': '=' }[key] ?? ''
}
