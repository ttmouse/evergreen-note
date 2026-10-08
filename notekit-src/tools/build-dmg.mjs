#!/usr/bin/env node
/**
 * 打包可分发的 macOS 安装包（.dmg）。
 *
 * 组装逻辑沿用仓库里已验证的 tools/build-desktop-app.py：
 *   拿 Electron 官方 dist 的 .app 壳 → 改名主可执行文件与全部 Helper → 改写 Info.plist
 *   → 把 package.json / dist / server / desktop 放进 Contents/Resources/app/ → ad-hoc 重签。
 *
 * 本脚本在它之上补的是「发行」那一段（参考 .bak/Notekit-Clean-1.5.0 dmg 的做法）：
 *   · 剥掉源码 map、备份文件、测试文件，只留运行期真正要的东西
 *   · 数据身份（profileName / 端口）与开发版隔离，避免和正在跑的开发版抢同一个库
 *   · 生成《安装说明.txt》放进包内（Gatekeeper 首次打开、数据位置、备份、卸载）
 *   · 打成 UDZO 压缩 dmg，并做 codesign / hdiutil 双重校验
 *
 * 用法：
 *   node tools/build-dmg.mjs                    # 完整构建 + 出 dmg
 *   node tools/build-dmg.mjs --skip-build       # 复用现有 dist/
 *   node tools/build-dmg.mjs --keep-maps        # 保留 .js.map（默认剥掉）
 *   node tools/build-dmg.mjs --no-dmg           # 只组装 .app
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url))) // notekit-src/
const PKG = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'))
const GUIDE_TEMPLATE = path.join(SRC, 'tools', 'release', 'install-guide.txt')

// node:util parseArgs 返回 { values, positionals } 信封，直接读 args.flag 是 undefined。
const { values: args } = parseArgs({
  options: {
    name: { type: 'string' },
    profile: { type: 'string' },
    port: { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' },
    'keep-maps': { type: 'boolean', default: false },
    'keep-stage': { type: 'boolean', default: true },
    'skip-build': { type: 'boolean', default: false },
    'no-dmg': { type: 'boolean', default: false },
    'no-sign': { type: 'boolean', default: false },
  },
})

const NAME = args.name || PKG.productName || 'Evergreen note'
// 发行版的身份与开发版分开：开发版是 NotekitDev/11820，两者同开会抢同一个 SQLite 与端口。
const PROFILE = args.profile || NAME
const PORT = Number(args.port || 11830)
const VERSION = args.version || PKG.version || '0.0.0'
const OUT_DIR = path.resolve(args.out || path.join(SRC, 'artifacts', 'release'))
const STAGE = path.join(OUT_DIR, 'stage')
const APP_PATH = path.join(STAGE, `${NAME}.app`)
const SLUG = NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const DMG_PATH = path.join(OUT_DIR, `${SLUG}-${VERSION}-arm64.dmg`)

const step = (n, total, text) => console.log(`[${n}/${total}] ${text}`)
const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} 失败（exit ${r.status}）`)
  return r
}
const capture = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { encoding: 'utf8' })
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() }
}

/* --------------------------- 1. 前端构建 --------------------------- */

if (!args['skip-build']) {
  step(1, 7, '构建前端（vite）…')
  run('pnpm', ['build'], { cwd: SRC })
} else {
  step(1, 7, '跳过构建（--skip-build），复用现有 dist/')
}
const dist = path.join(SRC, 'dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html 不存在，先跑 pnpm build')

/* --------------------------- 2. 复制 Electron 壳 --------------------------- */

const electronApp = path.join(SRC, 'node_modules', 'electron', 'dist', 'Electron.app')
if (!fs.existsSync(electronApp)) throw new Error(`找不到 Electron 壳：${electronApp}（先 pnpm install）`)

step(2, 7, `复制 Electron 壳 → ${path.relative(SRC, APP_PATH)}`)
fs.rmSync(STAGE, { recursive: true, force: true })
fs.mkdirSync(STAGE, { recursive: true })
fs.cpSync(electronApp, APP_PATH, {
  recursive: true,
  // verbatimSymlinks 必须为 true：否则 fs 会把 .framework 里的相对软链
  // 改写成指向 node_modules 的绝对路径，框架直接废掉（且让发行包依赖源码树）。
  verbatimSymlinks: true,
  filter: (src) => path.basename(src) !== 'default_app.asar',
})

const contents = path.join(APP_PATH, 'Contents')

/* --------------------------- 3. 改名主程序与 Helper --------------------------- */

step(3, 7, `重命名主可执行文件 Electron → ${NAME}`)
fs.renameSync(path.join(contents, 'MacOS', 'Electron'), path.join(contents, 'MacOS', NAME))

// Electron 靠 CFBundleName 定位 Helper，改名必须同步，否则渲染进程起不来。
const patchPlist = (plist, kv) => {
  for (const [key, value] of Object.entries(kv)) {
    const replaced = capture('plutil', ['-replace', key, '-string', String(value), plist])
    if (!replaced.ok) {
      const inserted = capture('plutil', ['-insert', key, '-string', String(value), plist])
      if (!inserted.ok) throw new Error(`改写 ${key} 失败：${inserted.out}`)
    }
  }
}

const frameworks = path.join(contents, 'Frameworks')
for (const entry of fs.readdirSync(frameworks).sort()) {
  if (!(entry.startsWith('Electron Helper') && entry.endsWith('.app'))) continue
  const suffix = entry.slice('Electron Helper'.length) // '' 或 ' (GPU).app'
  const from = path.join(frameworks, entry)
  const to = path.join(frameworks, `${NAME} Helper${suffix}`)
  fs.renameSync(from, to)
  const helperContents = path.join(to, 'Contents')
  const helperMacOS = path.join(helperContents, 'MacOS')
  for (const exe of fs.readdirSync(helperMacOS)) {
    if (!exe.startsWith('Electron Helper')) continue
    const exeSuffix = exe.slice('Electron Helper'.length)
    fs.renameSync(path.join(helperMacOS, exe), path.join(helperMacOS, `${NAME} Helper${exeSuffix}`))
  }
  const label = `${NAME} Helper${suffix.slice(0, -4)}`
  patchPlist(path.join(helperContents, 'Info.plist'), {
    CFBundleExecutable: `${NAME} Helper${suffix.slice(0, -4)}`,
    CFBundleName: label,
    CFBundleDisplayName: label,
    CFBundleIdentifier: `com.local.${SLUG.replace(/-/g, '')}.helper${suffix.replace(/[^a-z]/gi, '').toLowerCase()}`,
  })
  console.log(`      ${entry} → ${path.basename(to)}`)
}

step(4, 7, '改写主 Info.plist')
patchPlist(path.join(contents, 'Info.plist'), {
  CFBundleName: NAME,
  CFBundleDisplayName: NAME,
  CFBundleExecutable: NAME,
  CFBundleShortVersionString: VERSION,
  CFBundleVersion: VERSION,
  CFBundleIdentifier: `com.local.${SLUG.replace(/-/g, '')}`,
})

const sourceIcon = path.join(SRC, 'desktop', 'assets', 'app-icon.icns')
if (fs.existsSync(sourceIcon)) {
  fs.copyFileSync(sourceIcon, path.join(contents, 'Resources', 'electron.icns'))
  patchPlist(path.join(contents, 'Info.plist'), { CFBundleIconFile: 'electron.icns' })
}

/* --------------------------- 4. 放入应用文件 --------------------------- */

step(5, 7, '放入应用文件到 Contents/Resources/app/')
const appDir = path.join(contents, 'Resources', 'app')
fs.mkdirSync(appDir, { recursive: true })

const DROP = /(^|\/)(node_modules|\.server-data|tests?)(\/|$)|\.bak|\.test\.(c|m)js$/
const copyInto = (item, { stripMaps }) => {
  const from = path.join(SRC, item)
  if (!fs.existsSync(from)) throw new Error(`缺少 ${from}`)
  const to = path.join(appDir, item)
  fs.cpSync(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => {
      const rel = path.relative(from, src)
      if (!rel) return true
      if (DROP.test(rel)) return false
      if (stripMaps && src.endsWith('.map')) return false
      return true
    },
  })
  console.log(`      ${item}`)
}
for (const item of ['package.json', 'dist', 'server', 'desktop']) {
  copyInto(item, { stripMaps: item === 'dist' && !args['keep-maps'] })
}

// .live-update 是开发版热更新的握手文件，发行包里不能有——否则任何写进包内的标记都会触发刷新。
fs.rmSync(path.join(appDir, 'dist', '.live-update'), { force: true })

// 发行版自己的一套身份：数据目录与端口都和开发版分开。
const packagedPkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
packagedPkg.productName = NAME
packagedPkg.profileName = PROFILE
packagedPkg.defaultPort = PORT
fs.writeFileSync(path.join(appDir, 'package.json'), `${JSON.stringify(packagedPkg, null, 2)}\n`)

/* --------------------------- 5. 安装说明 + dmg 素材 --------------------------- */

const libraryDir = `~/Library/Application Support/${PROFILE}/library`
const backupDir = `~/Library/Application Support/${PROFILE}/backups`
step(6, 7, '生成《安装说明.txt》并准备 dmg 目录')
let guide = fs.readFileSync(GUIDE_TEMPLATE, 'utf8')
for (const [key, value] of Object.entries({
  APP_NAME: NAME,
  VERSION,
  PROFILE,
  PORT: String(PORT),
  LIBRARY_DIR: libraryDir,
  BACKUP_DIR: backupDir,
  BUILD_DATE: new Date().toISOString().slice(0, 10),
})) {
  guide = guide.replaceAll(`{{${key}}}`, value)
}
const guidePath = path.join(STAGE, '安装说明.txt')
fs.writeFileSync(guidePath, guide)
fs.chmodSync(guidePath, 0o644)
// 拖进「应用程序」的快捷方式（Finder 里显示为 Applications 文件夹）
fs.symlinkSync('/Applications', path.join(STAGE, 'Applications'))

/* --------------------------- 6. 签名 --------------------------- */

if (args['no-sign']) {
  step(7, 7, '跳过签名（--no-sign）')
} else {
  step(7, 7, '清隔离属性 + ad-hoc 重签（改动使原签名失效）')
  capture('xattr', ['-cr', APP_PATH])
  run('codesign', ['--force', '--deep', '--sign', '-', APP_PATH])
}

/* --------------------------- 7. 校验 + 打 dmg --------------------------- */

const verify = capture('codesign', ['--verify', '--deep', '--strict', '--verbose=2', APP_PATH])
console.log(`      codesign 校验：${verify.ok ? '✓ 通过' : `✗ 失败\n${verify.out}`}`)

let dmgSize = ''
if (!args['no-dmg']) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.rmSync(DMG_PATH, { force: true })
  run('hdiutil', ['create', '-volname', NAME, '-srcfolder', STAGE, '-ov', '-format', 'UDZO', DMG_PATH])
  const check = capture('hdiutil', ['verify', DMG_PATH])
  console.log(`      hdiutil 校验：${check.ok ? '✓ 通过' : `✗ 失败\n${check.out}`}`)
  dmgSize = capture('du', ['-h', DMG_PATH]).out.split('\t')[0]
}

if (!args['keep-stage']) fs.rmSync(STAGE, { recursive: true, force: true })

const appSize = capture('du', ['-sh', APP_PATH]).out.split('\t')[0]
console.log(`
完成
  App ：${APP_PATH}  (${appSize})
${args['no-dmg'] ? '' : `  DMG ：${DMG_PATH}  (${dmgSize})\n`}  版本：${VERSION}   数据目录：${libraryDir}
  备份：${backupDir}
  端口：${PORT}（开发版是 NotekitDev/11820，互不干扰）
  自测：open "${APP_PATH}"`)
