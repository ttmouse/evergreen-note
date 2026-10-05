import React from 'react'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { Routes, Route } from 'react-router-dom'
import { createBrowserHistory } from 'history'
import { KyString } from '../../interfaces/unit'
import { ContextRoute } from './RouterContexts'
import { after } from '../../engine/helper'
import { composeId } from '../DbDisk/helper'
import { isEmpty } from '../../utils/isEmpty'
import { showSnack } from '../../utils/msg/showSnack'
import { parseAddonUrlScheme } from './helper'
import { ItemEditor, ItemNode } from '@/slate-item'
import { keyState } from '../KeyClick/helper'
import { cls } from '@/slate-item/styles'
import { MAX_Z_INDEX } from '@/slate-item/hooks/useTopZIndex'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { $t } from '../../../i18n'

export type RouteMaps = {
  [route: string]: {
    title: string
    comp: React.FC<{ inFloatWindow?: boolean }>
    // 最小显示宽度，这在悬浮窗口中可以用到
    minWidth?: number
  }
}

export type RouteToResult = 'floatView' | 'andy' | 'side' | 'main' 

const urlMatch = /https?:\/\/.+?\/([^/]+)/.exec(window.location.href)
export const ROUTE_KEY = urlMatch ? urlMatch[1] : 'v2'
const styleBackToTop = cls`
position: fixed;
background: lightpink;
padding: 0.5em 0.7em;
border-radius: 0.3em;
box-shadow: 0 2px 5px rgba(0,0,0,0.3);
font-size: 1.2em;
color: #333;
cursor: pointer;
opacity: 0;
transition: opacity 0.3s ease-in-out;
z-index: ${MAX_Z_INDEX.BACK_TO_TOP};
pointer-events: none;
`
/**
 * 路由插件
 */
export function createRouterAddon({ app, $ }: NewAddonParams) {
  class Router implements IAddon {
    app!: App
    config = {}
    routes = {} as RouteMaps
    history = createBrowserHistory()
    currentPath = ''
    backToTopBtn: HTMLDivElement | null = null;
    backToTopKeyHandler: ((event: KeyboardEvent) => void) | null = null;
    backToTopBtnHideTimer: NodeJS.Timeout | null = null;
    // 滚动位置记录对象
    scrollPositions = {} as Record<string, number>

    getRecordPath() {
      const p = location.pathname.replace(`/${ROUTE_KEY}/`, '')
      return p || 'diaries'
    }

    /**
     * 记录当前页面的滚动位置
     */
    recordScrollPosition() {
      const scrollElement = document.querySelector(`#${app.appName}-router article`) as HTMLElement
      if (scrollElement) {
        this.scrollPositions[this.getRecordPath()] = scrollElement.scrollTop
      }
    }

    /**
     * 恢复页面的滚动位置
     */
    scrollWithBack(element: HTMLElement | null = null, scrollTop: number = 0) {
      if (element) {
        setTimeout(() => {
          element.scrollTop = scrollTop
          if (scrollTop <= 0) return;
          
          // 检查是否需要显示返回顶部按钮（基于阈值）
          const viewportHeight = element.getBoundingClientRect().height || (window.visualViewport?.height || window.innerHeight);
          const threshold = viewportHeight * 0.2;
          
          if (scrollTop >= threshold) {
            this.showBackToTopBtn(element);
          }
        }, 0)
      }
    }

    /**
     * 显示返回顶部按钮
     */
    showBackToTopBtn(element: HTMLElement) {
      if (!this.backToTopBtn) return;
      
      const rect = element.getBoundingClientRect();
      const backToTopBtn = this.backToTopBtn;
      
      // 根据父元素位置进行绝对定位
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      backToTopBtn.style.right = `calc(${Math.max(viewportWidth - rect.right, 0)}px + 1em)`;
      backToTopBtn.style.bottom = `calc(${Math.max(viewportHeight - rect.bottom, 0)}px + 1em)`; 
      backToTopBtn.style.pointerEvents = 'auto';
      
      const buttonEnterWithAnimation = () => {
        // 触发动画
        setTimeout(() => {
          // 让按钮滑入
          backToTopBtn.style.opacity = "1";
        }, 50);
      }

      buttonEnterWithAnimation();
      
      const buttonRemoveAndClear = () => {
        clearTimeout(this.backToTopBtnHideTimer!);
        this.backToTopBtnHideTimer = null;
        this.backToTopKeyHandler && document.removeEventListener("keydown", this.backToTopKeyHandler);
        this.backToTopKeyHandler = null;
        backToTopBtn.style.opacity = "0";
        backToTopBtn.style.pointerEvents = 'none';
      }

      const backToTop = () => {
        element.scrollTo({ top: 0, behavior: 'smooth' });
        buttonRemoveAndClear();
      }
      
      // 重新绑定点击事件
      backToTopBtn.onclick = backToTop;
      
      // 重新绑定键盘事件（移除之前的监听器）
      if (this.backToTopKeyHandler) {
        document.removeEventListener("keydown", this.backToTopKeyHandler);
      }
      
      this.backToTopKeyHandler = (event: KeyboardEvent) => {
        // 按上键回顶部
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          backToTop();
        }
      };
      
      document.addEventListener("keydown", this.backToTopKeyHandler);
      
      // 3秒后自动隐藏
      if (this.backToTopBtnHideTimer) {
        clearTimeout(this.backToTopBtnHideTimer);
      }
      this.backToTopBtnHideTimer =
        setTimeout(() => {
          buttonRemoveAndClear();
        }, 3000);
    }

    restoreScrollPosition(path: string) {
      $.router.scrollWithBack(document.querySelector(`#${app.appName}-router article`) as HTMLElement, this.scrollPositions[path] || 0)
    }

    /**
     * 添加页面路由
     *
     * 本函数是供其他插件注册它们各自的路由信息
     * @param routes
     */
    register(routes: RouteMaps) {
      Object.assign($.router.routes, routes)
      return this
    }

    /**
     * 添加默认的路由
     *
     * 多个插件如果都注册了默认路由，那么通过 priority 参数决定采用哪一个：取 priority 值最小的
     * @param priority
     * @param Comp
     */
    defaults = [] as { priority: number; Comp: React.FC }[]
    addDefault(priority: number, Comp: React.FC) {
      $.router.defaults.push({ priority, Comp })
      return this
    }

    fix(routePath: string) {
      const str = routePath.replace(new RegExp(`(item|${ROUTE_KEY})\\/`), '')
      return `/${ROUTE_KEY}/${str}`
    }

    /**
     * 解析 re: 开头的路由
     * @param url
     * @returns
     */
    invoke(url: string) {
      const { addonName, methodName, args } = parseAddonUrlScheme(url.slice(3))
      if (isEmpty(addonName) || isEmpty(methodName)) {
        showSnack({
          content: `Addon name or function name can not be empty`,
          severity: 'error',
        })
        return
      }
      if (addonName in $ === false) {
        showSnack({
          content: `Addon '${addonName}' not found`,
          severity: 'error',
        })
        return
      }
      ($ as any)[addonName][methodName](...args)
    }


    floatViewZoomIn(toPath: any, itemEditor: ItemEditor | HTMLElement | null = null) {
      try {
        const zoomFloat = (floatview: HTMLElement, item: any) => {
          if(floatview) {
            if(
              app.states.floatViewerMode === "andy" &&
              (!floatview.parentElement || !floatview.parentElement.matches(".pdfreader-wrap"))
            ) return false;
            const target = (typeof item === 'string') ? item : item.ky; 
            floatview.dispatchEvent(new CustomEvent("zoomIn", {detail: target}));
            return true;
          }
        }
        if((itemEditor || (typeof toPath !== "string" && ("GetEditor" in toPath)))) {
          if (itemEditor instanceof HTMLElement || itemEditor instanceof SVGElement) {
            const floatview = itemEditor.closest(".floatview-zoomer") as HTMLElement | null;
            if (floatview && zoomFloat(floatview, toPath)) return true;
            return false;
          }
          const editor = itemEditor || toPath.GetEditor();
          const editorEle = document.querySelector(`article[editor-id="${editor.editorId}"]`)!;
          const floatview = editorEle.closest(".floatview-zoomer");
          if(floatview) {
            return zoomFloat(floatview as HTMLElement, toPath);
          }
        }
        return false;
      } catch (error) {
        return false;
      }
    }

    /**
     * 在组件外路由跳转
     * @param toPath
     */
    to(toPath: UnitPersist | string, extraInfo = {}, itemEditor: ItemEditor | HTMLElement | null = null): RouteToResult {
      // TEMP: Andy 模式下，禁止跳转到非 andyMode 页面
      if (toPath !== '/andyMode') {
        if (!keyState.hasPressed() && this.floatViewZoomIn(toPath, itemEditor))
          return 'floatView'

        if (typeof toPath === 'object') {
          if ('ky' in toPath) {
            // 统一转到 item/ky 这种形式打开，方便其他插件处理
            return $.router.to(`item/${toPath.ky}`, extraInfo, itemEditor);
          }
        }

        const path = toPath.replace(/^\/|\/$/g, '')

        // ctrl + 点击，弹窗打开
        if (keyState.isPressed('mod') && app.isAddonEnabled('floatViewer')) {
          if (path in $.router.routes) {
            const { title, minWidth, comp: Comp } = $.router.routes[path]
            const props = {
              key: path,
              title,
              body: <Comp inFloatWindow={true} />,
              isPin: true,
            }
            const DialogProps = {} as any
            if (!isEmpty(minWidth)) {
              DialogProps.width = minWidth
            }
            $.floatViewer.showDialog({
              ...props,
              DialogProps,
            })
          } else {
            $.keyClick.openInDialog({ item: toPath.replace(/^item\//, ''), isPin: true })
          }
          return 'floatView'
        }

        // Shift opens another regular workspace tab. Andy links always follow the same column navigation.
        if (!keyState.hasPressed() && itemEditor && app.states.floatViewerMode !== 'andy') {
          $.main.replaceWorkspaceTab($.main.workspaceActiveKey, toPath.replace(/^\/?item\//, ''))
        }

        // Alt + 点击，Andy 模式打开
        if (
          app.isAddonEnabled('andy') &&
          ((typeof toPath === 'string' &&
            app.states.floatViewerMode === 'andy' &&
            (!keyState.hasPressed() || keyState.isPressed('shift'))) ||
            keyState.isPressed('alt'))
        ) {
          const ky = toPath.replace(/^item\//, '')
          if (app.states.floatViewerMode === 'andy' && (!keyState.hasPressed() || keyState.isPressed('shift'))) {
            const sourceElement = itemEditor instanceof HTMLElement || itemEditor instanceof SVGElement
              ? itemEditor
              : itemEditor
                ? document.querySelector(`article[editor-id="${itemEditor.editorId}"]`)
                : null
            const sourceId = sourceElement?.closest('.nui-dialog[dialog-list-mode="andy"]')?.id
            $.andy.navigate(ky, sourceId)
          } else {
            $.keyClick.openInAndyMode(ky, keyState.isPressed('alt') ? 0 : undefined)
          }
          return 'andy'
        }

        if (typeof toPath !== 'string') {
          throw new Error(`the route path must be a string`)
        }

        if (toPath.startsWith('re:')) {
          $.router.invoke(toPath)
          return 'main'
        }
      }

      return this.toMain(toPath, extraInfo)
    }

    // Workspace actions already chose their destination. Held shortcut keys
    // must not reinterpret them as modified link clicks.
    toMain(toPath: string, extraInfo = {}): RouteToResult {
      this.recordScrollPosition()
      if (app.states.floatViewerMode !== 'andy') $.main.rememberWorkspaceScroll()

      $.router.currentPath = toPath

      const trimedPath = toPath.replace(/^\//, '')
      if (trimedPath in $.router.routes) {
        $.ui.setPageTitle($.router.routes[trimedPath].title)
      }

      $.router.mark(toPath)

      const dbid = $.libAdmin.current.ky
      extraInfo = {
        lib: composeId(dbid),
        v: app.options.version,
        ...extraInfo,
      }
      const urlParams = new URLSearchParams(extraInfo).toString()
      toPath = `${$.router.fix(`${toPath.replace(/^\//g, '')}`)}?${urlParams}`
      $.router.history.push(toPath, extraInfo)
      return 'main'
    }

    /**
     * 历史后退（⌘[）
     *
     * 路由由 createBrowserHistory 驱动，直接走 window.history 即可：popstate 会被
     * react-router（unstable_HistoryRouter 用的就是同一个 history 实例）与 addonRun
     * 里注册的 history.listen 同时接管，标题与滚动位置照常恢复。
     */
    back() {
      this.history.go(-1)
    }

    /**
     * 历史前进（⌘]）
     */
    forward() {
      this.history.go(1)
    }

    /**
     * 浏览器式的前进后退快捷键（⌘[ / ⌘]）
     *
     * 用 everywhere：光标在笔记里、侧栏、对话框里都该生效。同一次按键被编辑器路径与
     * 文档级监听各派发一遍的情况由 Hotkey 统一去重，这里不用管。
     */
    addonCommands(): HotkeyMaps {
      return {
        historyBack: {
          title: $t`hotkey.browser_back`,
          hotkey: 'mod+[',
          context: 'everywhere',
          handle: () => {
            $.router.back()
            return false
          },
        },
        historyForward: {
          title: $t`hotkey.browser_forward`,
          hotkey: 'mod+]',
          context: 'everywhere',
          handle: () => {
            $.router.forward()
            return false
          },
        },
      }
    }

    createNotFoundComponent() {
      return () => (
        <main>
          <p>Not found</p>
        </main>
      )
    }

    /**
     * 创建路由的 React 组件
     * @returns
     */
    createComponent() {
      const NotFound = $.router.createNotFoundComponent()
      return () => {
        return (
          <Routes>
            {Object.entries($.router.routes).map(([path, regInfo], key) => {
              const { title, comp: Component } = regInfo
              const comp = (
                <ContextRoute.Provider value={path}>
                  <Component />
                </ContextRoute.Provider>
              )
              return (
                <Route path={$.router.fix(path)} key={path} element={comp} />
              )
            })}
            <Route path="*" element={<NotFound />} />
          </Routes>
        )
      }
    }

    mark(pathname = window.location.pathname) {
      // $.ui?.getContainer().setAttribute('data-route', pathname);
      document.body.setAttribute('data-route', pathname)
    }

    addonBeforeRun() {
      after(app.execAddonRunAll, async (result) => {
        await result
        $.router.defaults.sort((a, b) => a.priority - b.priority)
        $.router.register({
          '/': {
            title: 'Home',
            comp: $.router.defaults[0].Comp,
          },
        })
      })
    }

    addonRun() {
      $.router.mark()

      // 创建返回顶部按钮并添加到 document.body
      this.backToTopBtn = document.createElement("div");
      this.backToTopBtn.className = styleBackToTop;
      this.backToTopBtn.innerHTML = "↑";
      document.body.appendChild(this.backToTopBtn);

      // 监听路由变化事件
      this.history.listen(({ action }) => {
        const path = this.getRecordPath()
        if (path in $.router.routes) $.ui.setPageTitle($.router.routes[path].title)
        setTimeout(() => {
          this.restoreScrollPosition(path)
        }, 0)
        // if (action === 'POP') {
          
        // }
      })

      // 编一对页面内的链接进行处理
      document.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement
        const a = target.closest('a')
        if (a) {
          const url = a.getAttribute('href')
          if (!url) {
            return
          }
          if (url.startsWith('re:')) {
            $.router.to(url, {}, a)
            a.blur?.()
            e.preventDefault()
            e.stopPropagation()
          } else if (!url.includes(':')) {
            // 非 https://、file:// 之类的协议，只是 RE 内部链接
            $.router.to(url, {}, a)
            e.preventDefault()
            e.stopPropagation()
          }
        }
      })
    }
  }

  return new Router()
}
