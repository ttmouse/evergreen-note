/* eslint-disable no-console */
// 样式真源：原 .less/.css 编译后的合并结果（取自构建产物 index.css）。
// 源码里 40 多处样式 import 因不在 source map 中而解析不到，由 vite.config.ts 的
// stubMissingStyles 插件短路为空模块。
import './assets/all-styles.css'
import './assets/workspace-theme.css'
import './assets/scrollbars.css'
import { installScrollbars } from './slate-item/utils/dom/scrollbars'
import { App } from './slate-item/engine/App'
import { createAddons } from './edit.addons'
import { getCurrentDbid } from './slate-item/addons/DbDisk/helper'
import React from 'react'
import { AppComp } from './slate-item/addons/UI/AppComp'
import { ContextApp } from './slate-item/addons/UI/UIContexts'
import { ErrorBoundary } from './slate-item/components/ErrorBoundary/ErrorBoundary'
import { unstable_HistoryRouter as MyRouter } from 'react-router-dom'
import { createDOMContainer } from './slate-item/addons/UI/helper'
import { usePubState } from './slate-item/hooks/usePubState'
import { pub } from './slate-item/utils/pub'
import {
  IS_CLIENT,
  APP_VERSION,
  DEBUG_MODE,
  DEFAULT_APP_NAME,
  MEMBER_ID,
  PUBKEY_RESTART,
} from './slate-item/constants'
import { reactRender } from './slate-item/utils/common'
import { showSnack } from './slate-item/utils/msg/showSnack'
import { isEmpty } from './slate-item/utils/isEmpty'
import { getUrlParams } from './slate-item/utils/string/url'

export type LoadedAddons = ReturnType<typeof createAddons>
export type LoadedAddonName = keyof LoadedAddons

export { DEBUG_MODE, IS_CLIENT }

const appContainer = createDOMContainer(DEFAULT_APP_NAME)
if ((window as any).notekitShell?.platform === 'darwin') {
  document.documentElement.classList.add('mac-desktop')
}
const disposeScrollbars = installScrollbars()
if (import.meta.hot) import.meta.hot.dispose(disposeScrollbars)

function useAppView(app: App) {
  const [appView, setAppView] = React.useState<React.ReactNode>(
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100vw',
        height: '100vh',
        color: '#666',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
      }}
    >
      正在加载 Evergreen note…
    </div>
  )

  const [shouldRestart] = usePubState(PUBKEY_RESTART, {} as any)
  React.useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        await app.restart()
        if (!mounted) return
        setAppView(
          <MyRouter history={app.addons.router.history as any}>
            <AppComp>
              {app.addons.ui.contentComponents.map(({ Comp }, i) => (
                <Comp key={`key${i}`} />
              ))}
            </AppComp>
          </MyRouter>
        )
        setTimeout(() => {
          pub.emit(pub.evt.uiMounted, { app, container: appContainer })
        }, 10)
      } catch (error) {
        console.error('Notekit startup failed', error)
        if (mounted) {
          setAppView(
            <div role="alert" style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
              Evergreen note 启动失败，请查看应用日志。
            </div>
          )
        }
      }
    })()
    return () => {
      mounted = false
    }
  }, [dbid, shouldRestart])
  return [appView, setAppView]
}

function AppEntry(props: { application: App }) {
  const { application } = props
  const [appView] = useAppView(application)
  return (
    <React.StrictMode>
      <ContextApp.Provider value={application}>
        <ErrorBoundary>{appView}</ErrorBoundary>
      </ContextApp.Provider>
    </React.StrictMode>
  )
}

const [dbid] = getCurrentDbid(MEMBER_ID)
const app = App.getInstance({
  appName: DEFAULT_APP_NAME,
  dbids: [dbid],
  version: APP_VERSION,
  user: {
    id: MEMBER_ID,
    name: '',
  },
  createAddons,
  container: appContainer,
})

/**
 * 目前某些情况下，需要以全局方式去读取 app 实例，
 * 这是一个临时的方案，不建议使用
 * @deprecated
 */
export const unstable_GlobalApp = app

/**
 * [还原期调试入口] 把 app 实例挂到 window，供自动化/控制台直接调用内部能力
 * （例如 `__notekitApp.addons.imports.invokeMultiHandler({type:'fulljson', source})`）。
 * 源码本身没有这个入口——这是为验证与排障加的；不需要时删掉本段即可。
 */
;(window as any).__notekitApp = app

/**
 * 外部唤起入口：壳层收到 evergreen://note/<ky> 后转调这里，在主视图打开该笔记。
 * 导航复用 Router 的 item/:ky 路由（$.router.to），与主题列表点击同一链路；
 * zoomIn 事件只作用于悬浮窗（.floatview-zoomer），主视图不适用。
 */
;(window as any).__evergreenOpenNote = (ky: unknown): boolean => {
  const $ = (app as any).addons
  if (typeof ky !== 'string' || isEmpty(ky)) {
    console.warn('[evergreen] __evergreenOpenNote: ky 必须是非空字符串，收到：', ky)
    return false
  }
  if (!$?.router || !$?.dbMemory) {
    console.warn('[evergreen] 应用尚未就绪，无法打开笔记：', ky)
    return false
  }
  const item = $.dbMemory.getItem(ky)
  if (isEmpty(item) || item.ky !== ky) {
    showSnack({ content: `未找到笔记：${ky}`, severity: 'warning' })
    console.warn('[evergreen] 未找到笔记：', ky)
    return false
  }
  $.router.to(`item/${ky}`)
  return true
}

// 浏览器直开场景：URL 带 ?open=<ky> 时，待应用挂载且数据库加载完成后打开对应笔记
const evergreenOpenKy = getUrlParams().open
if (!isEmpty(evergreenOpenKy)) {
  pub.on(pub.evt.uiMounted, () => {
    // dbMemory 异步初始化，initFinished 之前 getItem 拿不到数据，轮询等它就绪
    let tries = 0
    const tryOpen = () => {
      const dbMemory = (app as any).addons?.dbMemory
      if (dbMemory?.initFinished) {
        ;(window as any).__evergreenOpenNote?.(evergreenOpenKy)
        return
      }
      if (tries++ < 20) setTimeout(tryOpen, 500)
      else console.warn('[evergreen] 等待数据库就绪超时，放弃打开：', evergreenOpenKy)
    }
    tryOpen()
  })
}

reactRender(appContainer, <AppEntry application={app} />)
