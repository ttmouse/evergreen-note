/**
 * 站内链接归一化（Router/linkTarget.ts）的接缝实测 —— 脱 UI，可单跑：
 *
 *   `node tools/test-router-link.mjs`
 *
 * 回归目标（2026-10-09 用户报障）：AI 面板里那条
 *   [全域营销链路](http://127.0.0.1:11820/static/?open=u4bM-sS9iYP4z)
 * 点下去必须变成站内路由（在左侧主视图打开那篇笔记），
 * 而不是被浏览器当成真正的页面跳转、把整个 App 重载一遍。
 *
 * 被测模块是 TS，先用 esbuild 打到 os.tmpdir() 再动态 import —— 不污染仓库目录。
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const work = mkdtempSync(path.join(tmpdir(), 'nk-router-link-'))

const outfile = path.join(work, 'linkTarget.mjs')
await build({
  entryPoints: [path.join(root, 'src/slate-item/addons/Router/linkTarget.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'warning',
})
const { resolveLinkTarget } = await import(pathToFileURL(outfile).href)

let pass = 0
const fails = []
const eq = (name, got, want) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? pass++
    : fails.push(`${name} → got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

// 与运行中的 App 一致：APP_URL = <origin>/static/
const ORIGIN = 'http://127.0.0.1:11820'
const BASE = `${ORIGIN}/static/`
const t = (href) => resolveLinkTarget(href, ORIGIN, BASE)

// ------------------------------------------------- ① 报障现场：同源绝对链接
eq('报障链接：?open=<ky> → item/<ky>', t('http://127.0.0.1:11820/static/?open=u4bM-sS9iYP4z'), {
  kind: 'inApp',
  path: 'item/u4bM-sS9iYP4z',
})
eq('open 参数要解码', t('http://127.0.0.1:11820/static/?open=%E5%85%A8%E5%9F%9F'), {
  kind: 'inApp',
  path: 'item/全域',
})
eq('同源绝对链接：挂载前缀要剥掉', t('http://127.0.0.1:11820/static/v2/topics'), {
  kind: 'inApp',
  path: '/v2/topics',
})
eq('同源绝对链接：日记页', t('http://127.0.0.1:11820/static/diaries'), {
  kind: 'inApp',
  path: '/diaries',
})
eq('同源绝对链接：应用根', t('http://127.0.0.1:11820/static/'), { kind: 'inApp', path: '/' })
eq('同源绝对链接：index.html 归到根', t('http://127.0.0.1:11820/static/index.html'), {
  kind: 'inApp',
  path: '/',
})
eq('同源绝对链接：带 query 一起带上', t('http://127.0.0.1:11820/static/v2/andyMode?x=1'), {
  kind: 'inApp',
  path: '/v2/andyMode?x=1',
})
eq('同源绝对链接：同源判定不看 127.0.0.1/localhost 写法的差异（不同 host 即不同源）', t('http://localhost:11820/static/'), {
  kind: 'external',
  url: 'http://localhost:11820/static/',
})

// ------------------------------------------------- ② 既有行为不许回退
eq('相对链接原样透传', t('item/u4bM-sS9iYP4z'), { kind: 'inApp', path: 'item/u4bM-sS9iYP4z' })
eq('站内绝对路径原样透传', t('/v2/item/u4bM-sS9iYP4z'), { kind: 'inApp', path: '/v2/item/u4bM-sS9iYP4z' })
eq('re: 插件命令原样透传', t('re:someAddon/someMethod'), {
  kind: 'inApp',
  path: 're:someAddon/someMethod',
})

// ------------------------------------------------- ③ 不该被吞的
eq('外部站点 → external', t('https://github.com/trending'), {
  kind: 'external',
  url: 'https://github.com/trending',
})
eq('同源但非页面路径（接口）→ external', t('http://127.0.0.1:11820/api/logout'), {
  kind: 'external',
  url: 'http://127.0.0.1:11820/api/logout',
})
eq('其它协议 → external', t('mailto:a@b.com'), { kind: 'external', url: 'mailto:a@b.com' })
eq('代理地址（不同端口即不同源）→ external', t('http://127.0.0.1:9999/static/'), {
  kind: 'external',
  url: 'http://127.0.0.1:9999/static/',
})

// ------------------------------------------------- ④ 深链接与空值
eq('evergreen:// 深链接在站内点 → item/<ky>', t('evergreen://note/u4bM-sS9iYP4z'), {
  kind: 'inApp',
  path: 'item/u4bM-sS9iYP4z',
})
eq('空 href → none', t(''), { kind: 'none' })
eq('null href → none', t(null), { kind: 'none' })
eq('页内锚点 → none', t('#top'), { kind: 'none' })

rmSync(work, { recursive: true, force: true })

console.log(fails.length === 0 ? `全部通过：${pass}/${pass}` : `失败 ${fails.length}/${pass + fails.length}:\n - ` + fails.join('\n - '))
process.exit(fails.length === 0 ? 0 : 1)
