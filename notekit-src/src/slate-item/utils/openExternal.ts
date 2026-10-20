/**
 * 站外链接：交给系统默认浏览器。
 *
 * 2026-10-20 报障：点开外链会在 App 自己的窗口里导航 —— 整个界面被那页网页顶掉，
 * 没有后退入口，只能重启。所有「送出去」的入口都走这里，保证只有一种行为。
 *
 * 桌面壳里走本地服务的 /api/open-external（沙箱 preload 拿不到 electron.shell，
 * Electron 44 实测）；纯浏览器（vite dev / 预览）没有外壳，新标签页就是默认浏览器的等价物。
 */
export function openInSystemBrowser(url: string) {
  if ((window as any).notekitShell?.platform) {
    fetch('/api/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => {})
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
