import React from 'react'
import { UnitCrumbs, UnitProps } from '../..'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { MainComp } from './MainComp'
import { makeAutoObservable } from 'mobx'
import { mkid } from '../../utils/string/mkid'
import { icons } from '../../../components/SvgIcon'
import { after } from '../../engine/helper'
import { scrollToTop } from '../../utils/dom/scrollToTop'
import { $t } from '../../../i18n'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'
import { browser } from '@/slate-item/utils/browser'
import { Item } from '../../interfaces/item'
import { ROUTE_KEY } from '../Router/Router'

export type MainCommands = {
  [key: string]: Partial<UnitProps>
}

export type WorkspaceTab = { key: string; title: string }

/**
 * 主编辑区域插件
 */
export function createMainAddon({ app, $ }: NewAddonParams) {
  class Main implements IAddon {
    app!: App
    config = {}

    ids = {
      subitems: `${app.appName}-router`,
      extra: `${app.appName}-sysbar`,
      outer: `${app.appName}-outer`,
      crumbs: `${app.appName}-crumbs`,
    }

    /**
     * 主区域右上角菜单
     */
    extraCommands: MainCommands = {}

    moreExtraCommands: MainCommands = {}

    /**
     * 主区域的面包屑数据
     */
    crumbs: UnitCrumbs = [] as any
    pageTitle = document.title
    workspaceTabs: WorkspaceTab[] = []
    workspaceActiveKey = ''
    workspaceLibrary = ''
    workspaceScroll: Record<string, number> = {}

    constructor() {
      makeAutoObservable(this)
    }

    setCrumbs(crumbs: UnitCrumbs | any[]) {
      $.main.crumbs = crumbs as UnitCrumbs
    }

    openWorkspaceTab(key: string, title: string, index = this.workspaceTabs.length) {
      const library = $.libAdmin.current.ky
      if (this.workspaceLibrary !== library) {
        this.workspaceTabs = []
        this.workspaceScroll = {}
        this.workspaceLibrary = library
      }
      const existing = this.workspaceTabs.find(tab => tab.key === key)
      if (existing) existing.title = title
      else this.workspaceTabs.splice(index, 0, { key, title })
      this.workspaceActiveKey = key
    }

    trackWorkspaceRoute(title?: string) {
      if (app.states.floatViewerMode === 'andy') return
      const pathname = $.router.history.location.pathname
      let key = pathname.replace(`/${ROUTE_KEY}/`, '').replace(/^\/|\/$/g, '') || 'diaries'
      if (key.startsWith('item/')) key = decodeURIComponent(key.slice(5))
      if (key === 'andyMode' || (key in $.router.routes && key !== 'diaries')) return
      const item = key === 'diaries' ? null : $.dbMemory.getItem(key)
      if (key !== 'diaries' && !item?.ky) return
      const existingTitle = this.workspaceTabs.find(tab => tab.key === key)?.title
      this.openWorkspaceTab(key, title || existingTitle || (item ? Item.headString(item, { parseRefer: true }) : $.router.routes.diaries?.title) || key)
    }

    replaceWorkspaceTab(sourceKey: string, key: string) {
      if (sourceKey === key) return
      const index = this.workspaceTabs.findIndex(tab => tab.key === sourceKey)
      if (index < 0 || this.workspaceTabs.some(tab => tab.key === key)) return
      const item = $.dbMemory.getItem(key)
      if (!item?.ky) return
      this.workspaceTabs.splice(index, 1, { key, title: Item.headString(item, { parseRefer: true }) || key })
      this.workspaceActiveKey = key
    }

    rememberWorkspaceScroll() {
      const body = document.querySelector(`#${this.ids.outer} > .node-body`) as HTMLElement | null
      const pathname = $.router.history.location.pathname
      const key = decodeURIComponent(pathname.replace(`/${ROUTE_KEY}/`, '').replace(/^item\//, '').replace(/^\/|\/$/g, '')) || 'diaries'
      if (body && this.workspaceTabs.some(tab => tab.key === key)) this.workspaceScroll[key] = body.scrollTop
    }

    selectWorkspaceTab(key: string) {
      if (!this.workspaceTabs.some(tab => tab.key === key)) return
      if (app.states.floatViewerMode === 'andy') {
        const viewer = app.states.floatViewerList.find(dlg => dlg.key === key)
        if (viewer) $.andy.scrollIntoView(viewer.dialogId)
      } else if (key !== this.workspaceActiveKey || $.router.getRecordPath().replace(/^item\//, '') !== key) {
        this.rememberWorkspaceScroll()
        $.router.toMain(key)
      }
      this.workspaceActiveKey = key
    }

    forgetWorkspaceTab(key: string) {
      const index = this.workspaceTabs.findIndex(tab => tab.key === key)
      if (index < 0) return
      this.workspaceTabs.splice(index, 1)
      if (this.workspaceActiveKey === key) {
        this.workspaceActiveKey = this.workspaceTabs[Math.min(index, this.workspaceTabs.length - 1)]?.key || ''
      }
    }

    closeWorkspaceTab(key: string) {
      const wasActive = key === this.workspaceActiveKey
      this.forgetWorkspaceTab(key)
      if (app.states.floatViewerMode === 'andy') {
        const viewer = app.states.floatViewerList.find(dlg => dlg.key === key)
        if (viewer) $.dialog.close(viewer.dialogId)
        if (this.workspaceActiveKey) this.selectWorkspaceTab(this.workspaceActiveKey)
      } else if (wasActive) {
        $.router.toMain(this.workspaceActiveKey || 'diaries')
      }
    }

    addMoreExtraCommands(commands: MainCommands) {
      Object.assign($.main.moreExtraCommands, commands)
    }

    addExtraCommands(commands: MainCommands) {
      Object.assign($.main.extraCommands, commands)
    }

    createComponent() {
      return () => <MainComp />
    }

    scrollToTop() {
      scrollToTop(`#${$.main.ids.outer} > .node-body`)
    }

    addonRun() {
      $.router.history.listen(() => {
        this.trackWorkspaceRoute()
        const key = this.workspaceActiveKey
        if (app.states.floatViewerMode !== 'andy') {
          setTimeout(() => {
            const body = document.querySelector(`#${this.ids.outer} > .node-body`) as HTMLElement | null
            if (body && this.workspaceActiveKey === key) body.scrollTop = this.workspaceScroll[key] || 0
          }, 0)
        }
      })
      // Registered pages may set their title before the history push; wait until
      // the route has changed to avoid renaming the tab being left behind.
      after($.ui.setPageTitle, () => setTimeout(() => this.trackWorkspaceRoute(this.pageTitle), 0))
      if(browser.isAppleMobile || browser.isMacSafari) {
        appendStyle(`
          #${app.appName}-outer {
            max-width: 100vw;
          }
        `)
      }
      $.ui.pushComponent($.main.createComponent())

      const moreID = `${app.options.appName}-more-dropdown`
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
      $.main.addExtraCommands({
        search: {
          icon: 'svg_search',
          title: $t`search.title`,
          hotkey: 'mod+p',
          size: 20,
          order: 5000,
          onClick: () => {
            $.search.showDialog()
          },
        },
        more: {
          icon: 'svg_more',
          title: $t`common.more`,
          size: 20,
          order: 10000,
          id: moreID,
          subitems: $.main.moreExtraCommands,
        },
      })

      $.main.addMoreExtraCommands({
        back: {
          icon: 'svg_keyboard_arrow_left',
          title: $t`Back`,
          onClick: () => {
            history.go(-1)
          },
          cond: () => isStandalone
        },
        forward: {
          title: 'Forward',
          icon: 'svg_keyboard_arrow_right',
          onClick() {
            history.go(1);
          },
          cond: () => isStandalone
        },
        // theme: {
        //   title: langs.theme_choose,
        //   icon: icons.svg_theme,
        //   onClick: () => {
        //     showSnack('Coming soon!');
        //   },
        // },
        // settings: {
        //   title: langs.settings,
        //   icon: icons.svg_settings,
        //   onClick: () => {
        //     showSnack('Coming soon');
        //   },
        // },

        update: {
          order: 10000,
          title: "Update",
          icon: icons.svg_refresh,
          onClick: () => {
            caches.delete("RoamEditv0-Main");
            $.imports.reload()
          },
        },

        logout: {
          order: 10000,
          title: $t`common.logout`,
          icon: icons.svg_logout,
          onClick: () => {
            window.location.href = '/api/logout'
          },
        },
        // trash: {
        //   title: langs.trash,
        //   icon: icons.svg_trash,
        //   onClick: () => {
        //     showSnack('Coming soon');
        //   },
        // },
      })
    }
  }

  return { main: new Main() }
}
