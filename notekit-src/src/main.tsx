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

reactRender(appContainer, <AppEntry application={app} />)
