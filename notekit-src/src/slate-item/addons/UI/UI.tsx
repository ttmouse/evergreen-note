import React from 'react'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { atom } from '../../styles'
import { createDialogAddon } from './Dialog/Dialog'
import { $t, i18nCacheLanguage } from '../../../i18n'
import { APP_VERSION, PUBKEY_RESTART } from '../../constants'
import { setPubState } from '../../hooks/usePubState'
import { appendStyle } from '../../utils/dom/appendStyle'
import { browser } from '../../utils/browser'
import { ZIndexManager } from './helper'
import { FormElProps } from '../Form/Form'

declare global {
  interface AppConf {
    uiLang: 'en' | 'zh'
  }
}

type PushedComp = {
  Comp: React.FC
  order: number
}

/**
 * The app's user interface
 *
 * This addon doesn't create any actual content components,
 * but it does provide a placeholder
 * so that other addons can push their own components that.
 */
export function createUIAddon(params: NewAddonParams) {
  const { $, app } = params

  class UI implements IAddon {
    app!: App
    config = {
      uiLang: 'zh',
      uiDarkMode: 'off',
    }

    zIndexManager = new ZIndexManager()

    contentComponents: PushedComp[] = []

    get container() {
      return this.getContainer()
    }

    getContainer() {
      return app.options.container
    }

    /**
     * Provide a method for other addons to add their own components
     * @param Comp
     */
    pushComponent(Comp: React.FC, order?: number) {
      const theOrder = order ?? (this.contentComponents.length + 1) * 1000
      this.contentComponents.push({
        Comp,
        order: theOrder,
      })
      this.contentComponents.sort((a, b) => a.order - b.order)
    }

    refresh() {
      setPubState(PUBKEY_RESTART, Date.now())
    }

    on<K extends keyof DocumentEventMap>(
      type: K,
      listener: (this: HTMLElement, ev: DocumentEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ) {
      ;($.ui.container as any)?.addEventListener(type, listener, options)
    }

    off(...args: Parameters<typeof document.removeEventListener>) {
      $.ui.container?.removeEventListener(...args)
    }

    setPageTitle(str: string) {
      document.title = str
      if ($.main) $.main.pageTitle = str
    }

    addonInfo() {
      return {
        type: 'fieldset',
        title: $t`ui.title`,
        order: 5,
        isCore: true,
        subitems: {
          uiLang: {
            type: 'select',
            title: $t`ui.ui_lang`,
            options: {
              en: 'English',
              zh: '中文',
            },
            onElChange(e: any, v: any) {
              i18nCacheLanguage(v)
              $.ui.refresh()
            },
          },
          // uiDarkMode: {
          //   type: 'select',
          //   title: $t`ui.ui_dark_mode`,
          //   options: switchOptions,
          // },
        },
      }
    }

    addonBeforeRun() {}

    addonRun() {
      // if (!browser.mac) {
        appendStyle(atom.scrollbar({ width: 6 }))
      // }
    }
  }

  return {
    ...createDialogAddon(params),
    ui: new UI(),
  }
}
