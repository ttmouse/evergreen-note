/**
 * 站内链接归一化：把 <a href> 翻译成「点下去到底该干什么」。
 *
 * 背景（2026-10-09 用户报障：「侧边栏里的笔记入口点了会重载整个软件，而不是直接在左边打开笔记」）：
 * AI 面板的回复走 marked → 原始 <a href>，那一轮 AI 写的是
 *   [全域营销链路](http://127.0.0.1:11820/static/?open=u4bM-sS9iYP4z)
 * 而 Router 的文档级 mousedown 拦截器只认「href 里不含冒号」的相对链接（见 addonRun），
 * 带 scheme 的一律放过 → 点击变成真正的页面跳转。APP_URL 恰好就是
 * http://127.0.0.1:11820/static/ ，于是整个 App 重新加载（丢掉全部内存态），
 * 而不是在左侧主视图打开那篇笔记。
 *
 * 这里只做纯函数解析，接线在 Router 的 mousedown 监听里；单测 tools/test-router-link.mjs。
 */

export type LinkTarget =
  /** 什么都不做：空 href、页内锚点 */
  | { kind: 'none' }
  /** 站内路由：把 path 交给 $.router.to(path) */
  | { kind: 'inApp'; path: string }
  /** 外部链接：不归 Router 管，保持浏览器/外壳的默认行为 */
  | { kind: 'external'; url: string }

/** 页面挂载路径：main.cjs 的 APP_URL = `${ORIGIN}/static/` */
const APP_MOUNT = '/static'
/** 分享出去的深链接（Share 插件用的就是它） */
const EVERGREEN_NOTE = /^evergreen:\/\/note\/([^/?#]+)/i
/** 带协议（http:、evergreen:…）或协议相对（//host）的绝对链接 */
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
/** 同源但不是页面路由的路径（后端接口），不该被吞成站内路由 */
const NON_ROUTE = /^\/api\//

function defaultOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : ''
}

function defaultBase() {
  return typeof window !== 'undefined' ? window.location.href : undefined
}

export function resolveLinkTarget(
  href: string | null | undefined,
  origin: string = defaultOrigin(),
  base?: string
): LinkTarget {
  const raw = (href ?? '').trim()
  if (!raw) return { kind: 'none' }
  // 插件命令，保持既有行为原样透传
  if (raw.startsWith('re:')) return { kind: 'inApp', path: raw }
  // 页内锚点：既不是路由也不是外部链接
  if (raw.startsWith('#')) return { kind: 'none' }

  // 分享深链接：站内点它不该再绕一圈系统协议（那会变成"又开一个 App"）
  const ever = EVERGREEN_NOTE.exec(raw)
  if (ever) return { kind: 'inApp', path: `item/${safeDecode(ever[1])}` }

  // 相对链接：原样交给 router —— 这是拦截器一直以来的行为，不改
  if (!ABSOLUTE.test(raw)) return { kind: 'inApp', path: raw }

  let url: URL
  try {
    url = new URL(raw, base)
  } catch {
    return { kind: 'external', url: raw }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'external', url: raw }
  if (origin && url.origin !== origin) return { kind: 'external', url: raw }

  // 同源绝对链接 —— 归一成站内路由，绝不整页重载
  const open = url.searchParams.get('open')
  if (open) return { kind: 'inApp', path: `item/${open}` }

  const inner = url.pathname.startsWith(APP_MOUNT)
    ? url.pathname.slice(APP_MOUNT.length)
    : url.pathname
  if (NON_ROUTE.test(inner)) return { kind: 'external', url: raw }

  const path = inner.replace(/\/+$/, '') || '/'
  if (path === '/index.html') return { kind: 'inApp', path: '/' }
  return { kind: 'inApp', path: `${path}${url.search}` }
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
