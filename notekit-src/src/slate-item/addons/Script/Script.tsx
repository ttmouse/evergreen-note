import { IAddon, App, NewAddonParams } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { $$ } from '../../utils/lang'
import { notEmpty } from '../../utils/isEmpty'
import { after, before, cover } from '../../engine/helper'
import { dialogShow } from '../../utils/msg/showDialog'
import React from 'react'
import ReactDOM from 'react-dom'
import { omit } from '../../utils/object/omit'
import { ScriptInstallIcon } from './ScriptInstallIcon'
import { Item } from '../../interfaces/item'
import { $t } from '../../../i18n'
import { createTmpDom } from '../../utils/dom/createTmpDom'

export type ScriptInfo = {
  enabled: boolean
  scripts: null | { [iky: KyString]: string }
}

export type ScriptConfig = {
  scriptInstalled?: {
    [ky: string]: ScriptInfo
  }
}

declare global {
  interface AppConf extends ScriptConfig {}
}

export const APP_SCRIPT_KY = `AppScripts`

export function createScriptAddon(addonParams: NewAddonParams) {
  const { app, $ } = addonParams

  class Script implements IAddon {
    app!: App

    config: ScriptConfig = {
      scriptInstalled: {},
    }

    addonInfo() {
      return {
        title: $t`script.title`,
        type: 'fieldset',
        defaultValue: 'off', // 默认开启本插件
        quote: $t`script.quote`,
        subitems: {
          scriptManage: {
            title: $t`script.management`,
            type: 'button',
            onClick: () => {
              $.floatViewer.show({
                title: $t`script.management`,
                item: 'AppScripts',
                container: createTmpDom(),
              })
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
          scriptInstalled: {
            type: 'object',
            defaultValue: {} as ScriptConfig,
          },
        },
      }
    }

    exec(code: string) {
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'params',
        `const { app, $, after, before, cover, React, ReactDOM } = params; ${code}`
      )
      const scriptCtxParams = {
        ...addonParams,
        after,
        before,
        cover,
        React,
        ReactDOM,
      }
      return fn(scriptCtxParams)
    }

    install(ky: KyString, willEnable = true) {
      if (!$.dbMemory.itemExist(ky)) {
        console.error($$`The script [${ky}] doesn't exist`)
        return
      }
      const item = $.dbMemory.getItem(ky)
      const ins = { enabled: willEnable, scripts: {} } as any
      for (const leaf of item.leaves) {
        if ($.codeblock.verify(leaf) && leaf.mode === 'javascript') {
          ins.scripts[leaf.iky] = leaf.value
        }
      }
      app.cfg.scriptInstalled = {
        ...app.cfg.scriptInstalled,
        [ky]: ins,
      }
    }

    uninstall(ky: KyString) {
      if (app.cfg.scriptInstalled?.[ky]) {
        app.cfg.scriptInstalled = omit(app.cfg.scriptInstalled, [ky])
      }
    }

    toggle(ky: KyString) {
      if ($.script.isInstalled(ky)) {
        $.script.uninstall(ky)
      } else {
        $.script.install(ky)
      }
    }

    isInstalled(ky: KyString) {
      return !!app.cfg.scriptInstalled?.[ky]
    }

    update(ky: KyString) {
      $.script.install(ky, true)
    }

    invokeAll() {
      if (window.location.href.includes('&script=false')) {
        return
      }

      const installed = app.cfg.scriptInstalled
      for (const [ky, info] of Object.entries(installed ?? {})) {
        try {
          if (info.enabled && notEmpty(info.scripts)) {
            for (const code of Object.values(info.scripts!)) {
              notEmpty<string>(code) && $.script.exec(code)
            }
          }
        } catch (err) {
          console.error(err)
          dialogShow({
            title: $t`script.error`,
            body: (err as any).toString(),
            buttons: {
              check: {
                title: $t`script.check`,
                onClick: () => $.router.to({ ky }),
                color: 'error',
              },
            },
          })
        }
      }
    }

    getScriptItems() {
      return Object.keys(app.cfg.scriptInstalled ?? {}).map((ky) =>
        $.dbMemory.getItem(ky)
      )
    }

    addonRun() {
      $.editorView.addExtraItems({ ScriptInstallIcon })
      $.topic?.createTopic('App/Scripts', { ky: APP_SCRIPT_KY })
      after($.backlink.getLinkedItems, (result, ky) => {
        const item = $.dbMemory.getItem(ky)
        if (item?.topic === 'app/scripts') {
          return [...result, ...$.script.getScriptItems()]
        }
      })

      after($.dbMemory.saveItem, (_, item) => {
        if (app.cfg.scriptInstalled?.[item.ky]?.enabled) {
          if (!Item.isNormalStatus(item)) {
            $.script.uninstall(item.ky)
          } else {
            $.script.update(item.ky)
          }
        }
      })
    }
  }

  const script = new Script()

  after(app.registerAddon, (_, addonName, addon) => {
    if (addonName === 'prefer') {
      after((addon as any).ready, async (result) => {
        await result
        if (app.isAddonEnabled('script')) {
          await script.invokeAll()
        }
      })
    }
  })

  return { script }
}
