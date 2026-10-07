import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { isMyHotkey } from '../Hotkey/helper'
import './desktop-shortcut.css'

type ShortcutState = { accelerator: string; registered: boolean; error: string }
type DesktopBridge = {
  platform: string
  getWakeShortcut: () => Promise<ShortcutState>
  setWakeShortcut: (value: string) => Promise<ShortcutState & { ok: boolean }>
  captureWakeShortcut: (value: boolean) => Promise<void>
}

export function displayShortcut(value: string, mac: boolean) {
  const symbols: Record<string, string> = mac
    ? { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Space: '空格' }
    : { CommandOrControl: 'Ctrl', Command: 'Meta', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Space: 'Space' }
  return value.split('+').map(part => symbols[part] ?? part).join(mac ? '' : '+')
}

export function DesktopShortcutSetting() {
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
    shell?.getWakeShortcut().then(result => {
      if (!mounted.current) return
      setState(result)
      setDraft(result.accelerator)
    }).catch(() => mounted.current && setMessage('无法读取快捷键设置，请重试。'))
    return () => { mounted.current = false; void shell?.captureWakeShortcut(false).catch(() => {}) }
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
      const conflict = Object.values($.hotkey.commands).find(cmd => cmd.hotkey && isMyHotkey(cmd.hotkey, { byKey: true }, event))
      if (conflict) { setMessage(`这个组合已用于“${conflict.title}”，请换一个。`); return }
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

  async function save(value: string) {
    setBusy(true)
    try {
      const result = await shell!.setWakeShortcut(value)
      if (!mounted.current) return
      setState(result)
      if (result.ok) { setDraft(result.accelerator); setMessage(value ? '已保存，立即生效。' : '已关闭全局快捷键。') }
      else setMessage(result.error)
    } catch { if (mounted.current) setMessage('保存失败，请重试。') }
    finally { if (mounted.current) setBusy(false) }
  }

  if (!shell?.getWakeShortcut) return null
  return (
    <section className="desktop-shortcut-setting" aria-label="全局唤起快捷键">
      <h3>全局唤起快捷键</h3>
      <p>在其他应用中按下快捷键，将常青笔记切到前台；最小化时也能恢复窗口。</p>
      <p>应用需要保持运行。关闭窗口或完全退出后，快捷键不会生效。</p>
      <div className="desktop-shortcut-controls">
        <button type="button" ref={recorder} aria-label="录制全局唤起快捷键" aria-pressed={recording}
          disabled={busy || !state} onClick={() => recording ? setRecording(false) : void beginRecording()}>
          {recording ? '请按快捷键…（Esc 取消）' : draft ? displayShortcut(draft, shell.platform === 'darwin') : '点击录制快捷键'}
        </button>
        <button type="button" disabled={busy || recording || !state || !draft || (draft === state.accelerator && state.registered)} onClick={() => void save(draft)}>保存</button>
        <button type="button" disabled={busy || recording || !state?.accelerator} onClick={() => void save('')}>关闭快捷键</button>
      </div>
      <p role="status" aria-live="polite">{message || state?.error || (state ? state.registered ? `当前生效：${displayShortcut(state.accelerator, shell.platform === 'darwin')}` : '全局快捷键已关闭。建议组合：⌃⌥N。' : '正在读取…')}</p>
    </section>
  )
}
