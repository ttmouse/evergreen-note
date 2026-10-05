import { makeAutoObservable } from 'mobx'
import { $t } from '../../../i18n'
import { LoadedAddonName } from '../../../main'
import { IAddon, App, NewAddonParams, CommandMaps } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { PreferPersist } from './Prefer'
import { PreferName, PreferStore } from './PreferStore'

export interface GlobalConf {
  /**
   * 默认数据库
   */
  globalDefaultLibrary?: KyString

  /**
   * 全局启用的插件
   */
  globalEnabledAddons?: LoadedAddonName[]
}

declare global {
  // 全局配置应该以 global 开头
  interface AppConf extends GlobalConf {}
}

export const GLOBAL_PLAN_KY = 'global'

function assertGlobalConfName(name: string) {
  if (!name.startsWith('global')) {
    throw new Error('A global config name must start with "global"')
  }
}

export function createPreferGlobalAddon({ app, $ }: NewAddonParams) {
  class PreferGlobal implements IAddon {
    app!: App
    config = {}

    store!: PreferStore

    async ready(preferItems: PreferPersist[]) {
      $.preferGlobal.store = new PreferStore({
        conn: $.libAdmin.conn,
        planKy: GLOBAL_PLAN_KY,
        app: this.app,
      })

      makeAutoObservable($.preferGlobal.store)

      const isPlanExists = await $.preferGlobal.store.inject(preferItems)

      if (!isPlanExists) {
        await $.preferPlan.save({
          prky: GLOBAL_PLAN_KY,
          ori: $t`prefer.global_plan`,
        })
      }
    }

    getValue<T extends PreferName>(cfgName: T): AppConf[T] {
      assertGlobalConfName(cfgName)
      return $.preferGlobal.store?.getValue(cfgName)
    }

    setValue<T extends PreferName>(cfgName: T, value: AppConf[T]) {
      assertGlobalConfName(cfgName)
      return $.preferGlobal.store.setValue(cfgName, value)
    }

    showCfgForm() {
      $.form.popup<GlobalConf>({
        title: 'Global settings',
        subitems: {
          globalDefaultLibrary: {
            type: 'select',
            title: 'Default library',
            options: (() => {
              const options: any = {}
              for (const lib of $.libAdmin.store.getList()) {
                options[lib.ky] = lib.ori
              }
              return options
            })(),
          },
          globalEnabledAddons: {
            type: 'list',
            title: 'Enabled addons',
            options: {
              preferPlan: 'Prefer plan',
              preferGlobal: 'Prefer global',
            },
          },
        },
        onChange(values) {
          console.log(values)
        },
      })
    }

    addonCommands(): HotkeyMaps {
      return {
        preferGlobal: {
          title: 'Global settings',
          hotkey: 'mod+alt+shift+esc',
          context: 'everywhere',
          handle() {
            $.preferGlobal.showCfgForm()
          },
        },
      }
    }

    addonRun() {
      // Initialization for this PreferGlobal
    }
  }

  return { preferGlobal: new PreferGlobal() }
}
