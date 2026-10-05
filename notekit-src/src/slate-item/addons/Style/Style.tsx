import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { atLater } from '../../utils/atLater'
import { appendStyle } from '../../utils/dom/appendStyle'
import { notEmpty } from '../../utils/isEmpty'
import { $$ } from '../../utils/lang'
import { omit } from '../../utils/object/omit'
import { StyleInstallIcon } from './StyleInstallIcon'
import { removeElement } from '../../utils/dom/removeElement'
import { createBlockStyleAddon } from './BlockStyle/BlockStyle'
import { stylisParse } from './stylisParse'
import { $t } from '../../../i18n'
import { createTmpDom } from '../../utils/dom/createTmpDom'

export const APP_STYLE_KY = 'AppStyles'

export type StyleInfo = {
  enabled: boolean
  styles: null | { [iky: KyString]: string }
}

export type StyleConfig = {
  styleInstalled?: {
    [ky: string]: StyleInfo
  }
}

declare global {
  interface AppConf extends StyleConfig {}
}

function getStyleId(ky: KyString) {
  return `usercss-${ky};`
}

export function createStyleAddon(params: NewAddonParams) {
  const { app, $ } = params

  class Style implements IAddon {
    app!: App
    config: StyleConfig = {
      styleInstalled: {},
    }

    async exec(code: string, id?: string) {
      const theCode = await $.style.parse(code)
      appendStyle(theCode, id)
    }

    addonInfo() {
      return {
        title: $t`style.title`,
        type: 'fieldset',
        defaultValue: 'on',
        quote: $t`style.quote`,
        subitems: {
          styleManage: {
            title: $t`style.management`,
            type: 'button',
            onClick: () => {
              $.floatViewer.show({
                title: $t`style.management`,
                item: 'AppStyles',
                container: createTmpDom(),
              })
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
          styleInstalled: {
            title: $t`style.installed_styles`,
            type: 'object',
            defaultValue: {},
          },
        },
      }
    }

    parse(lessCode: string): Promise<string> {
      return stylisParse(lessCode)
    }

    install(ky: KyString, willEnable = true) {
      if (!$.dbMemory.itemExist(ky)) {
        console.error($$`The style [${ky}] doesn't exist`)
        return
      }
      const item = $.dbMemory.getItem(ky)
      const ins = { enabled: willEnable, styles: {} } as any
      for (const leaf of item.leaves) {
        if ($.codeblock.verify(leaf) && leaf.mode === 'css') {
          ins.styles[leaf.iky] = leaf.value
        }
      }
      app.cfg.styleInstalled = {
        ...app.cfg.styleInstalled,
        [ky]: ins,
      }
      atLater(() => $.style.invoke(ky), getStyleId(ky))
    }

    uninstall(ky: KyString) {
      if (app.cfg.styleInstalled?.[ky]) {
        app.cfg.styleInstalled = omit(app.cfg.styleInstalled, [ky])
        const el = document.getElementById(getStyleId(ky)) as HTMLElement
        el && removeElement(el)
      }
    }

    isInstalled(ky: KyString) {
      return !!app.cfg.styleInstalled?.[ky]
    }

    toggle(ky: KyString) {
      if ($.style.isInstalled(ky)) {
        $.style.uninstall(ky)
      } else {
        $.style.install(ky)
      }
    }

    update(ky: KyString) {
      $.style.install(ky, true)
    }

    invoke(ky: KyString) {
      const installed = app.cfg.styleInstalled as StyleConfig
      const info = (installed as any)?.[ky]
      if (info?.enabled && notEmpty(info?.styles)) {
        for (const code of Object.values(info.styles)) {
          notEmpty<string>(code) && $.style.exec(code, getStyleId(ky))
        }
      }
    }

    invokeAll() {
      if (window.location.href.includes('&style=false')) {
        return
      }
      
      const installed = app.cfg.styleInstalled as StyleConfig
      for (const [ky, info] of Object.entries(installed ?? {})) {
        if (info.enabled && notEmpty(info.styles)) {
          for (const code of Object.values(info.styles)) {
            notEmpty<string>(code) && $.style.exec(code, getStyleId(ky))
          }
        }
      }
    }

    getStyleItems() {
      return Object.keys(app.cfg.styleInstalled ?? {})
        .map((ky) => $.dbMemory.getItem(ky))
        .filter((item) => !item.path?.includes(APP_STYLE_KY))
    }

    addonBeforeRun() {
      after($.dbMemory.saveItem, (_, item) => {
        if (app.cfg.styleInstalled?.[item.ky]?.enabled) {
          if (!Item.isNormalStatus(item)) {
            $.style.uninstall(item.ky)
          } else {
            $.style.update(item.ky)
          }
        }
      })
    }

    addonRun() {
      $.topic.createTopic('App/Styles', {
        ky: 'AppStyles',
      })

      $.editorView.addExtraItems({ StyleInstallIcon })
      $.topic?.createTopic('App/Styles', { ky: APP_STYLE_KY })

      after($.backlink.getLinkedItems, (result, ky) => {
        const item = $.dbMemory.getItem(ky)
        if (item?.topic === 'app/styles') {
          return [...result, ...$.style.getStyleItems()]
        }
      })

      $.style.invokeAll()
    }
  }

  return { style: new Style(), ...createBlockStyleAddon(params) }
}
