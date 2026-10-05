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
  version: process.versions.electron,
  platform: process.platform,
})
