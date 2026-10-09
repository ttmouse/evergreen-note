/**
 * Electron 外壳（本项目自写）
 *
 * 职责与原版外壳一致：准备数据目录 → 启动本地服务 → 等端口就绪 → 开窗指向应用 → 退出时回收服务。
 * 区别：这里的服务是**本项目自写的** `server/server.mjs`（Node），
 * 不再是那个闭源、且有 2026-12-31 到期日的 PyInstaller 二进制。
 *
 * 与原版外壳的对照（原版 main.js 中对应部分）：
 *   spawn 服务二进制        -> 换成本机 Node 启动 server.mjs
 *   PORT 11814              -> 沿用已安装 Notekit 的地址，以迁移原 IndexedDB
 *   DEFAULT_APP_URL /v2/    -> /static/
 *   首次启动要粘贴声明文本   -> 已移除（本实现无需该声明）
 *   备份/设置窗/状态页       -> 保留：菜单里可看日志、开数据目录、立即备份；自动备份按份数轮换
 */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme, globalShortcut } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { randomBytes } = require('node:crypto')
const { runNoteCommand } = require('./note-command.cjs')
const { createWakeShortcut } = require('./wake-shortcut.cjs')
const { createSettingsMenuItem, openSettingsInPage, createSettingsShortcut, matchesShortcutInput } = require('./settings-menu.cjs')

const appConfig = require('../package.json')
const APP_NAME = appConfig.productName || 'Evergreen note'
const PROFILE_NAME = appConfig.profileName || APP_NAME
if (process.env.NOTEKIT_DEV_MODE === '1') app.setName(APP_NAME)
const USER_DATA_DIR = process.env.NOTEKIT_USER_DATA
  ? path.resolve(process.env.NOTEKIT_USER_DATA)
  : path.join(app.getPath('appData'), PROFILE_NAME)
if (process.env.NOTEKIT_DEV_MODE === '1') {
  // Give the HMR window its own Electron lock and Chromium profile while the
  // data helpers below continue to use the regular Notekit data directory.
  const devProfileDir = path.join(path.dirname(USER_DATA_DIR), `${path.basename(USER_DATA_DIR)}-HMR-${process.pid}`)
  app.setPath('userData', devProfileDir)
  console.log(`[dev:desktop] Electron profile: ${app.getPath('userData')}`)
}
const PORT = Number(process.env.NOTEKIT_PORT || (appConfig.defaultPort || (PROFILE_NAME === 'NotekitDev' ? 11820 : 11814)))
const ORIGIN = `http://127.0.0.1:${PORT}`
const APP_URL = process.env.NOTEKIT_START_URL || `${ORIGIN}/static/`
const SERVER_SCRIPT = path.join(__dirname, '..', 'server', 'server.mjs')
const LOG_LIMIT = 300
const BACKUP_KEEP = 20
const BACKUP_INTERVAL_MS = 30 * 60 * 1000 // 30 分钟

let mainWindow = null
let serverProc = null
let serverLog = []
let backupTimer = null
let quitReady = false
let preparingQuit = false
// 设置面板快捷键录制中标志：录制新唤起快捷键时，⌘Esc 可能正是用户想设的新组合，
// before-input-event 必须让路（isSettingsEscape 拦截器读这个标志）。
let settingsShortcutRecording = false

function showMainWindow() {
  if (preparingQuit) return
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  app.focus({ steal: true })
  mainWindow.focus()
}

const wakeShortcut = createWakeShortcut({
  globalShortcut,
  configPath: path.join(USER_DATA_DIR, 'desktop-shortcut.json'),
  showWindow: showMainWindow,
})

// 「打开设置」组合，用户可在设置面板改（SettingsHotkeySetting → settings-shortcut.json）
const settingsShortcut = createSettingsShortcut({ configPath: path.join(USER_DATA_DIR, 'settings-shortcut.json') })

function assertShellSender(event) {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('此操作仅允许应用主窗口调用')
  }
}

ipcMain.handle('wake-shortcut:get', event => {
  assertShellSender(event)
  return wakeShortcut.get()
})
ipcMain.handle('wake-shortcut:set', (event, accelerator) => {
  assertShellSender(event)
  globalShortcut.setSuspended(false)
  return wakeShortcut.set(accelerator)
})
ipcMain.handle('wake-shortcut:capture', (event, capturing) => {
  assertShellSender(event)
  settingsShortcutRecording = capturing === true
  globalShortcut.setSuspended(settingsShortcutRecording)
})
ipcMain.handle('settings-shortcut:get', event => {
  assertShellSender(event)
  return settingsShortcut.get()
})
ipcMain.handle('settings-shortcut:set', (event, accelerator) => {
  assertShellSender(event)
  return settingsShortcut.set(accelerator)
})

// The page has its own theme preference. Keep AppKit's window buttons in the
// same appearance instead of leaving them in the system theme over the page.
ipcMain.on('set-theme', (event, theme) => {
  if (event.sender !== mainWindow?.webContents || !['light', 'dark'].includes(theme)) return
  nativeTheme.themeSource = theme
})

// The local build watcher publishes this marker only after all assets are ready.
const liveUpdateMarker = path.join(__dirname, '..', 'dist', '.live-update')
let liveUpdateVersion = ''
let liveUpdateBusy = false
try { liveUpdateVersion = fs.readFileSync(liveUpdateMarker, 'utf8') } catch {}
const liveUpdateTimer = setInterval(async () => {
  if (liveUpdateBusy || preparingQuit || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return
  let version
  try { version = fs.readFileSync(liveUpdateMarker, 'utf8') } catch { return }
  if (version === liveUpdateVersion) return
  liveUpdateBusy = true
  try {
    await mainWindow.webContents.executeJavaScript('(async () => { const disk = window.__notekitApp?.addons?.dbDisk; if (typeof disk?.flush !== "function") throw new Error("保存服务尚未就绪"); await disk.flush(); return true })()')
    liveUpdateVersion = version
    mainWindow.webContents.reloadIgnoringCache()
    pushLog('[live-update] 新构建已加载')
  } catch (error) {
    pushLog(`[live-update] 刷新暂缓: ${error}`)
  } finally {
    liveUpdateBusy = false
  }
}, 1000)
liveUpdateTimer.unref()

const userDir = () => USER_DATA_DIR
const dataRoot = () => path.join(userDir(), 'library')
const dbFile = () => path.join(dataRoot(), 'notekit.db')
const backupDir = () => path.join(userDir(), 'backups')

function pushLog(line) {
  for (const l of String(line).split(/\r?\n/)) {
    if (!l.trim()) continue
    serverLog.push(l)
    if (process.env.NOTEKIT_DEBUG_LOG) fs.appendFileSync(process.env.NOTEKIT_DEBUG_LOG, l + '\n')
  }
  if (serverLog.length > LOG_LIMIT) serverLog = serverLog.slice(-LOG_LIMIT)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 端口上是不是我们自己的服务在监听 */
function portReady(timeout = 2000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port: PORT })
    const done = (v) => {
      sock.destroy()
      resolve(v)
    }
    sock.setTimeout(timeout)
    sock.on('connect', () => done(true))
    sock.on('timeout', () => done(false))
    sock.on('error', () => done(false))
  })
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (serverProc && serverProc.exitCode !== null) return false
    if (await portReady()) return true
    await sleep(200)
  }
  return false
}

function startServer() {
  fs.mkdirSync(dataRoot(), { recursive: true })
  const noteToken = randomBytes(32).toString('hex')
  fs.writeFileSync(path.join(userDir(), 'note-command.json'), JSON.stringify({ url: `${ORIGIN}/api/note-command`, token: noteToken }), { mode: 0o600 })
  const env = {
    ...process.env,
    PORT: String(PORT),
    NOTEKIT_DATA_DIR: dataRoot(),
    NOTEKIT_BACKUP_DIR: backupDir(),
    NOTEKIT_NOTE_TOKEN: noteToken,
    // 让 Electron 以纯 Node 方式跑服务脚本
    ELECTRON_RUN_AS_NODE: '1',
  }
  serverProc = spawn(process.execPath, ['--experimental-sqlite', SERVER_SCRIPT], {
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const child = serverProc
  let commandQueue = Promise.resolve()
  child.on('message', message => {
    if (message?.kind !== 'note-command') return
    commandQueue = commandQueue.then(async () => {
      try {
        if (preparingQuit || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) throw new Error('应用正在启动或退出，请稍后重试')
        const result = await mainWindow.webContents.executeJavaScript(`(${runNoteCommand.toString()})(${JSON.stringify(message.input)})`)
        if (child.connected) child.send({ kind: 'note-command-result', id: message.id, result })
      } catch (error) {
        if (child.connected) child.send({ kind: 'note-command-result', id: message.id, error: String(error.message || error) })
      }
    })
  })
  serverProc.stdout.on('data', (d) => pushLog(d.toString()))
  serverProc.stderr.on('data', (d) => pushLog(d.toString()))
  serverProc.on('exit', (code, signal) => {
    pushLog(`[shell] 服务退出 code=${code} signal=${signal}`)
    serverProc = null
  })
}

function stopServer() {
  if (!serverProc) return
  try {
    serverProc.kill('SIGTERM')
  } catch (_) {}
  serverProc = null
}

/* --------------------------- evergreen:// 深度链接 --------------------------- */

/**
 * 解析 evergreen://note/<ky> 链接，返回节点 ky；非 evergreen 协议或格式不符返回 null。
 * open-url（macOS）与 second-instance 的 argv（Windows 等）共用这一个解析函数。
 */
function parseEvergreenUrl(raw) {
  if (typeof raw !== 'string') return null
  let url
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'evergreen:') return null
  // URL 构造器会把 host 与路径分开：evergreen://note/xxx → host=note, pathname=/xxx
  const ky = url.hostname === 'note'
    ? decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    : ''
  return ky || null
}

/** 待派发的 ky 队列：协议事件可能早于服务/窗口就绪（冷启动），先存这里 */
let pendingNoteKeys = []
let pendingRetry = false

async function dispatchNoteKey(ky) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingNoteKeys.push(ky)
    return
  }
  try {
    const result = await mainWindow.webContents.executeJavaScript(
      `(window.__evergreenOpenNote ? (window.__evergreenOpenNote(${JSON.stringify(ky)}), 'ok') : 'missing')`,
    )
    if (result !== 'ok') throw new Error('window.__evergreenOpenNote 未就绪')
    pushLog(`[deep-link] 已打开笔记 ky=${ky}`)
  } catch (error) {
    if (pendingRetry) {
      pendingRetry = false
      pushLog(`[deep-link] 打开笔记失败 ky=${ky}: ${error}`)
      return
    }
    // 页面侧全局函数还没就绪：静默记日志，稍后重试一次
    pendingRetry = true
    pendingNoteKeys.push(ky)
    pushLog(`[deep-link] 页面未就绪，稍后重试 ky=${ky}`)
    setTimeout(() => flushPendingNoteKeys(), 2000)
  }
}

function flushPendingNoteKeys() {
  const queue = pendingNoteKeys
  pendingNoteKeys = []
  for (const ky of queue) void dispatchNoteKey(ky)
}

// 只在打包 App 里注册 evergreen:// 处理器，必须在 app.whenReady 前。
// dev 模式（electron main.cjs，process.defaultApp 为真）绝不能注册：那会把
// LaunchServices 的默认处理器抢到 node_modules 的裸 Electron 上，实测表现为
// 点 evergreen:// 链接只弹出一个空 Electron。方案声明已写进打包 Info.plist
// 的 CFBundleURLTypes（见 tools/build-dmg.mjs），打包 App 不靠这行也能被关联。
if (!process.defaultApp) {
  app.setAsDefaultProtocolClient('evergreen')
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  const ky = parseEvergreenUrl(url)
  if (!ky) { pushLog(`[deep-link] 无法解析链接: ${url}`); return }
  showMainWindow()
  void dispatchNoteKey(ky)
})

/* ------------------------------- 备份 ------------------------------- */

async function backupNow() {
  try {
    if (!fs.existsSync(dbFile())) return { ok: false, msg: '数据库尚未创建' }
    fs.mkdirSync(backupDir(), { recursive: true })
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${d.getMilliseconds()}`
    const target = path.join(backupDir(), `notekit-${stamp}.db`)
    const response = await fetch(`${ORIGIN}/api/storage/backup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: path.basename(target) }),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || 'SQLite 备份未完成')
    const files = fs
      .readdirSync(backupDir())
      .filter((f) => f.startsWith('notekit-') && f.endsWith('.db'))
      .sort()
    while (files.length > BACKUP_KEEP) {
      fs.unlinkSync(path.join(backupDir(), files.shift()))
    }
    pushLog(`[shell] 已备份 -> ${target}`)
    return { ok: true, msg: target }
  } catch (e) {
    pushLog(`[shell] 备份失败: ${e}`)
    return { ok: false, msg: String(e) }
  }
}

/* ------------------------------- 窗口 ------------------------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: APP_NAME,
    // Native macOS traffic lights, with the web contents extending beneath
    // the titlebar so no opaque title strip is added.
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 12, y: 15 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.webContents.on('dom-ready', () => {
    // Chromium 的 window.close() 可直接销毁 WebContents；统一转为 app.quit()，
    // 让页面存活到 before-quit 的 SQLite 保存队列排空。
    mainWindow.webContents.executeJavaScript('window.close = () => window.notekitShell.requestQuit(); true')
      .catch(error => pushLog(`[shell] 关闭入口初始化失败: ${error}`))
    // 冷启动时协议事件早于窗口就绪：此时统一派发积压的深度链接
    setTimeout(() => flushPendingNoteKeys(), 300)
  })
  mainWindow.on('blur', () => { globalShortcut.setSuspended(false); settingsShortcutRecording = false })
  mainWindow.webContents.on('did-start-loading', () => { globalShortcut.setSuspended(false); settingsShortcutRecording = false })
  // ⌘Esc（或用户自定义组合）打开设置面板。不依赖菜单 accelerator：AppKit 会在按键
  // 派发层吞掉 Escape 等价键（2026-10-07 真机实测），before-input-event 在渲染层之前
  // 拦截，与焦点状态无关；命中后 preventDefault，渲染层不再重复注册同键位热键。
  // 快捷键录制中让路：用户可能正想把该组合录成新的唤起/设置快捷键。
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (settingsShortcutRecording) return
    if (!matchesShortcutInput(settingsShortcut.get().accelerator, input)) return
    event.preventDefault()
    openSettingsInPage(() => mainWindow, pushLog)
  })
  mainWindow.loadURL(APP_URL)
  mainWindow.on('close', (event) => {
    pushLog(`[shell] close event, quitReady=${quitReady}`)
    if (!quitReady) { event.preventDefault(); app.quit() }
  })

  /**
   * 页面在「导入未完成」时会用 beforeunload 拦截关闭。
   * 浏览器里这会弹一个确认框，而 **Electron 默认没有这个弹框** ——
   * 不处理的话，关闭按钮与 ⌘Q 会**静默失效**（表现为"app 关不掉"）。
   *
   * 原作者的外壳也处理了这一点（其 main.js 里对应 `will-prevent-unload`），
   * 做法是无条件忽略。这里稍进一步：只在页面确实要拦时问一句，
   * 让"正在导入"这个真实场景不至于被静默中断，同时保证任何时候都关得掉。
   */
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['取消', '仍然关闭'],
      defaultId: 0,
      cancelId: 0,
      message: '有未完成的操作（例如导入尚未结束）。',
      detail: '仍然关闭会中断它。',
    })
    // preventDefault = 忽略页面的拦截，放行关闭
    if (choice === 1) event.preventDefault()
  })

  mainWindow.on('closed', () => {
    pushLog('[shell] window closed')
    mainWindow = null
  })
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        createSettingsMenuItem(() => mainWindow, pushLog),
        { type: 'separator' },
        {
          label: '打开数据目录',
          click: () => shell.openPath(dataRoot()),
        },
        {
          label: '打开备份目录',
          click: () => shell.openPath(backupDir()),
        },
        {
          label: '立即备份',
          click: async () => {
            const r = await backupNow()
            dialog.showMessageBox({
              type: r.ok ? 'info' : 'error',
              message: r.ok ? '已备份' : '备份失败',
              detail: r.msg,
            })
          },
        },
        { type: 'separator' },
        {
          label: '查看服务日志',
          click: () => {
            const text = serverLog.slice(-120).join('\n') || '（暂无日志）'
            dialog.showMessageBox({ type: 'info', message: '服务日志', detail: text })
          },
        },
        { role: 'quit' },
      ],
    },
    {
      label: '文件',
      submenu: [
        {
          label: '关闭当前笔记',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.webContents.executeJavaScript('window.__notekitApp?.addons?.floatViewer?.closeActiveNote(); true')
              .catch(error => pushLog(`[shell] 关闭笔记失败: ${error}`))
          },
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* ------------------------------- 生命周期 ------------------------------- */

app.setName(APP_NAME)
// 沿用目标应用自己的 profile；只有隔离验收时才覆盖数据目录。
app.setPath('userData', process.env.NOTEKIT_USER_DATA
  ? path.resolve(process.env.NOTEKIT_USER_DATA)
  : USER_DATA_DIR)

/**
 * 单实例锁：**必须有**。
 *
 * 两个实例会共用同一个 userData（Chromium profile）互相争抢，
 * 实测表现是后开的那个**白屏**（IndexedDB 打不开 → 应用初始化卡住），
 * 日志里伴随 `Could not open the quota database, resetting.`。
 *
 * 没有这段时，用户"再点一次图标"就会得到一个白屏窗口。
 */
const gotSingleInstanceLock = process.env.NOTEKIT_DEV_MODE === '1' || app.requestSingleInstanceLock()
if (process.env.NOTEKIT_DEV_MODE === '1') console.log(`[dev:desktop] single-instance lock: ${gotSingleInstanceLock}`)
if (!gotSingleInstanceLock) {
  // 已有实例在跑：把窗口交给它，本进程直接退出（不强杀，避免写坏 profile）
  app.quit()
} else {
  // 重复启动时，把已有窗口唤到前台；Windows 等平台深度链接会出现在 argv 里
  app.on('second-instance', (_event, argv) => {
    showMainWindow()
    for (const arg of argv) {
      const ky = parseEvergreenUrl(arg)
      if (ky) void dispatchNoteKey(ky)
    }
  })
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  if (process.env.NOTEKIT_DEV_MODE === '1') console.log(`[dev:desktop] ready; URL=${APP_URL}; API=${ORIGIN}`)
  if (process.env.NOTEKIT_REUSE_SERVER !== '1') startServer()
  const ok = await waitForServer()
  if (!ok) {
    pushLog('[shell] 服务未能在超时内就绪')
    await dialog.showMessageBox({
      type: 'error',
      message: '本地服务启动失败',
      detail:
        `未能在 30 秒内连上 ${ORIGIN}\n\n` +
        `请检查 Node 是否可用、${SERVER_SCRIPT} 是否存在。\n` +
        `最近日志：\n${serverLog.slice(-15).join('\n')}`,
    })
    stopServer()
    app.quit()
    return
  }
  pushLog('[shell] 服务就绪')
  buildMenu()
  createWindow()
  const shortcutState = wakeShortcut.start()
  if (shortcutState.error) pushLog(`[wake-shortcut] ${shortcutState.error}`)
  backupTimer = setInterval(backupNow, BACKUP_INTERVAL_MS)
})

/**
 * 关闭窗口即退出应用。
 *
 * macOS 的惯例是"关窗不退出"，但本应用是单窗口的本地笔记工具，
 * 且没有实现「点 Dock 图标重开窗口」——按惯例做会留下一个**没有窗口的驻留进程**，
 * 用户看到的现象就是"关不掉"。这里改为关窗即退出。
 */
app.on('window-all-closed', () => {
  app.quit()
})

/** 兜底：若真的出现"无窗口但进程在"，点 Dock 图标时把窗口开回来 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverProc) {
    createWindow()
  }
})

app.on('before-quit', (event) => {
  pushLog(`[shell] before-quit, quitReady=${quitReady}, window=${!!mainWindow}`)
  if (quitReady) return
  event.preventDefault()
  if (preparingQuit) return
  preparingQuit = true
  void (async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const flushed = await mainWindow.webContents.executeJavaScript('(async () => { const disk = window.__notekitApp?.addons?.dbDisk; await disk?.flush?.(); return { mode: disk?.storageMode, flushAvailable: typeof disk?.flush } })()')
        pushLog(`[shell] flush result: ${JSON.stringify(flushed)}`)
      }
      if (backupTimer) clearInterval(backupTimer)
      await backupNow()
      stopServer()
      quitReady = true
      app.quit()
    } catch (error) {
      preparingQuit = false
      pushLog(`[shell] 保存未完成: ${error}`)
      await dialog.showMessageBox(mainWindow, { type: 'error', message: '笔记尚未保存，应用暂不退出。', detail: String(error) })
    }
  })()
})

ipcMain.handle('backup-now', () => backupNow())
ipcMain.on('request-quit', () => app.quit())
app.on('will-quit', () => wakeShortcut.stop())
