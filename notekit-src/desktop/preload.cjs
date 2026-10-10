/**
 * 预加载脚本：只暴露外壳的最小能力给页面。
 * 应用本身不需要它也能跑（纯 HTTP 交互），这里仅提供「立即备份」入口供页面调用。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notekitShell', {
  /** 立即把 SQLite 库复制一份到备份目录，返回 { ok, msg } */
  backupNow: () => ipcRenderer.invoke('backup-now'),
  requestQuit: () => ipcRenderer.send('request-quit'),
  setTheme: (theme) => ipcRenderer.send('set-theme', theme),
  getWakeShortcut: () => ipcRenderer.invoke('wake-shortcut:get'),
  setWakeShortcut: (accelerator) => ipcRenderer.invoke('wake-shortcut:set', accelerator),
  captureWakeShortcut: (capturing) => ipcRenderer.invoke('wake-shortcut:capture', capturing),
  getSettingsShortcut: () => ipcRenderer.invoke('settings-shortcut:get'),
  setSettingsShortcut: (accelerator) => ipcRenderer.invoke('settings-shortcut:set', accelerator),
  /** 把一篇笔记弹成独立窗口；同一个 ky 重复调用只聚焦已有窗口 */
  openFloatWindow: (payload) => ipcRenderer.invoke('float-window:open', payload),
  /** 独立浮窗用笔记标题覆盖窗口标题（只影响自己这个窗口） */
  setFloatWindowTitle: (title) => ipcRenderer.send('float-window:title', title),
  /** 独立浮窗关闭自己 */
  closeFloatWindow: () => ipcRenderer.send('float-window:close'),
  version: process.versions.electron,
  platform: process.platform,
})
