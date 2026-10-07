import { IAddon, App, NewAddonParams } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { cover } from '../../engine/helper'
import { pub } from '../../utils/pub'
import React from 'react'
import { $t } from '../../../i18n'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { ConfFormWrapComp } from '../Conf/ConfFormWrapComp'
import { DialogProps } from '../../utils/msg/showDialog'
import { FormElProps, FormHanlder } from '../Form/Form'
import { createPreferPlanAddon } from './PreferPlan'
import { LoadedAddonName } from '../../../main'
import { PreferStore } from './PreferStore'
import { makeAutoObservable } from 'mobx'
import { createPreferGlobalAddon } from './PreferGlobal'
import { DesktopShortcutSetting } from './DesktopShortcutSetting'
import { SettingsHotkeySetting } from './SettingsHotkeySetting'

const DEFAULT_PLAN_KY = 'main' // df = default

export type PreferPersist = UnitPersist & {
  /**
   * 配置项的主键
   */
  prky: KyString // prky = prefer key
}

export type PreferName = keyof AppConf

export function createPreferAddon(addonParams: NewAddonParams) {
  const { app, $ } = addonParams

  class PreferAddon implements IAddon {
    app!: App
    config = {}
    currentPlanKy = DEFAULT_PLAN_KY
    dialog: FormHanlder<any> = null as any
    store!: PreferStore

    // Load preferences data
    async ready(preferItems: PreferPersist[]) {
      const planKy = $.libAdmin.current.referConfig
      if (planKy) {
        $.prefer.currentPlanKy = planKy
      }

      $.prefer.store = new PreferStore({
        conn: $.libAdmin.conn,
        planKy: $.prefer.currentPlanKy,
        app: this.app,
      })
      makeAutoObservable($.prefer.store)

      const isPlanExists = await $.prefer.store.inject(preferItems)

      if (!isPlanExists) {
        await $.preferPlan.save({
          prky: DEFAULT_PLAN_KY,
          ori: $t`prefer.default_plan`,
        })
      }

      await $.preferPlan.ready()

      // COMPAT:
      if (
        Array.isArray(app.cfg.enabledAddons) &&
        typeof app.cfg.addonStatus === 'undefined'
        // isEmpty(app.cfg.addonStatus)
      ) {
        const obj: any = {}
        for (const addonName of app.cfg.enabledAddons) {
          obj[addonName] = true
        }
        app.cfg.addonStatus = obj
      }

      pub.emit(pub.evt.cfgLoaded, { cfg: $.prefer.getValues() })
    }

    getValues() {
      return $.prefer.store?.getValues()
    }

    getValue<T extends PreferName>(cfgItemName: T): AppConf[T] {
      return $.prefer.store?.getValue(cfgItemName)
    }

    setValue<T extends PreferName>(cfgItemName: T, value: AppConf[T]) {
      return $.prefer.store.setValue(cfgItemName, value)
    }

    // enableAddon(addonName: LoadedAddonName, status: boolean) {
    //   app.cfg.enabledAddons ??= [];
    //   if (!status) {
    //     app.cfg.enabledAddons = app.cfg.enabledAddons.filter(
    //       (name) => name !== addonName
    //     );
    //   } else {
    //     const info = (app.addons as any)[addonName]?.addonInfo?.();
    //     if (Array.isArray(info.depend)) {
    //       for (const dep of info.depend) {
    //         if (!app.cfg.enabledAddons.includes(dep)) {
    //           $.prefer.enableAddon(dep, true);
    //         }
    //       }
    //     }
    //     app.cfg.enabledAddons = Array.from(
    //       new Set([...app.cfg.enabledAddons, addonName])
    //     );
    //   }
    // }

    enableAddon(addonName: LoadedAddonName, status: boolean) {
      app.cfg.addonStatus ??= {}
      app.cfg.addonStatus = {
        ...app.cfg.addonStatus,
        [addonName]: Boolean(status),
      }
      const info = (app.addons as any)[addonName]?.addonInfo?.()
      if (Array.isArray(info.depend)) {
        for (const dep of info.depend) {
          if (!$.prefer.isAddonEnabled(dep)) {
            $.prefer.enableAddon(dep, true)
          }
        }
      }
    }

    isAddonEnabled(addonName: LoadedAddonName): boolean {
      // 插件不存在
      const addon = app.addons[addonName]
      if (!addon) {
        return false
      }

      // 插件被显式启用或禁用
      if (typeof app.cfg.addonStatus?.[addonName] === 'boolean') {
        return app.cfg.addonStatus[addonName] as boolean
      }

      const info = (addon as any)?.addonInfo?.()

      // 核心插件，必须开启
      if (info?.isCore) {
        return true
      }

      // 通过 addonInfo() 的 defaultValue 判断是否开启插件
      return info?.defaultValue !== 'off'
    }

    // isAddonEnabled(addonName: LoadedAddonName) {
    //   // 插件被显式启用
    //   if (app.cfg.enabledAddons?.includes(addonName)) {
    //     return true;
    //   }

    //   // 插件不存在
    //   const addon = app.addons[addonName];
    //   if (!addon) {
    //     return false;
    //   }

    //   const info = (addon as any)?.addonInfo?.();

    //   // 插件是核心插件，必须开启
    //   if (info?.isCore) {
    //     return true;
    //   }

    //   // 如果 app.cfg.enabledAddons 已经被定义
    //   // 就说明用户已经手动配置过了，
    //   // 不能再通过插件的 defaultValue 来判断是否启用
    //   if (Array.isArray(app.cfg.enabledAddons)) {
    //     return false;
    //   }

    //   return info?.defaultValue !== 'off';
    // }

    cfgItems: { [addonName: string]: { [cfgName: string]: FormElProps<any> } } = {}
    addCfgItems(addonName: string, items: { [k: string]: FormElProps<any> }) {
      $.prefer.cfgItems[addonName] = {
        ...($.prefer.cfgItems[addonName] ?? {}),
        ...items,
      }
    }

    getCfgItems(addonName: LoadedAddonName) {
      const addon = app.addons[addonName]
      if (
        addon &&
        'addonInfo' in addon &&
        $.prefer.isAddonEnabled(addonName as LoadedAddonName)
      ) {
        const info = addon.addonInfo?.() as any
        return {
          ...(info?.subitems ?? {}),
          ...($.prefer.cfgItems[addonName] ?? {}),
        }
      }
      return {}
    }

    showCfgForm(
      params: {
        activeKey?: string // 要激活的配置组
        picks?: string[] // 挑选想要显示的配置组
        hideTabs?: boolean // 是否隐藏左侧 Tabs
        hideDialogTitle?: boolean // 是否隐藏对话窗口
        DialogProps?: Partial<DialogProps<any>>
      } = {} as any
    ) {
      const {
        activeKey,
        picks,
        hideTabs,
        hideDialogTitle,
        DialogProps: dialogProps = {},
      } = params
      const subitems = {} as any
      for (const [addonName, addon] of Object.entries($)) {
        if (Array.isArray(picks) && !picks.includes(addonName)) {
          continue
        }
        if (
          'addonInfo' in addon &&
          $.prefer.isAddonEnabled(addonName as LoadedAddonName)
        ) {
          const adnConfig = addon.addonInfo!()
          const newSubitems = {} as any
          const cfgItems = $.prefer.getCfgItems(addonName as LoadedAddonName)
          if (!isEmpty(cfgItems)) {
            // eslint-disable-next-line prettier/prettier
            for (const [ky, item] of Object.entries(cfgItems)) {
              ;(item as UnitPersist).pky = `cfg-${addonName}`
              $.conf.formItems[ky] = item as any
              if (!['hidden', 'object'].includes((item as any).type)) {
                newSubitems[ky] = item
              }
            }
          }
          if (notEmpty(newSubitems)) {
            subitems[addonName] = {
              ...adnConfig,
              subitems: newSubitems,
            }
          }
        }
      }

      const shellBridge = (window as any).notekitShell
      if ((!picks || picks.includes('desktop')) && shellBridge?.getWakeShortcut) {
        subitems.desktop = {
          type: 'fieldset', title: '快捷键', order: 0,
          subitems: {
            desktopWakeShortcut: { type: 'text', render: DesktopShortcutSetting },
            ...(shellBridge?.getSettingsShortcut ? { settingsOpenHotkey: { type: 'text', render: SettingsHotkeySetting } } : {}),
          },
        }
      }

      $.prefer.dialog = $.form.popup({
        title: hideDialogTitle ? undefined : $t`conf.title`,
        width: 400,
        subitems,
        initialValues: $.prefer.getValues(),
        FormWrap: (props: any) => {
          return (
            <ConfFormWrapComp
              {...props}
              hideTabs={hideTabs}
              activeKey={activeKey}
              fields={subitems}
            />
          )
        },
        onChangeElement(name, value) {
          $.prefer.setValue(name as PreferName, value)
        },
        DialogProps: {
          classList: ['preferences-dialog', 'app-modal'],
          maxWidth: 'md',
          backdrop: true,
          clickAway: true,
          ...dialogProps,
        },
      })
    }

    showAddonForm(addonName: string) {
      $.prefer.showCfgForm({
        // activeKey: addonName,
        picks: [addonName],
        hideTabs: true,
        hideDialogTitle: true,
      })
    }

    addonBeforeRun() {
      const { get, set } = $.conf
      cover($.conf?.get, (k) => {
        if (k in $.prefer.store.items) {
          return $.prefer.getValue(k as PreferName)
        }
        return get.call($.conf, k)
      })

      cover($.conf?.set, (k, v, byProxy) => {
        if (k in $.prefer.store.items) {
          return $.prefer.setValue(k as PreferName, v as any)
        }
        return set.call($.conf, k, v, byProxy)
      })

      cover($.addonCenter.enableAddon, (addonName, status) => {
        return $.prefer.enableAddon(addonName as LoadedAddonName, status)
      })
    }

    addonRun() {
      // Electron 下「打开设置」组合由主进程 before-input-event 执行（settings-shortcut.json，
      // 面板内可改）；渲染层不再注册同键位热键，避免双路径与快捷键面板的过期显示。
      // 浏览器/开发环境没有 notekitShell，保留 ⌘Esc 兑底。
      const bridge = (window as any).notekitShell
      const custom = !!bridge?.getSettingsShortcut

      $.main?.addMoreExtraCommands({
        preferences: {
          title: $t`conf.title`,
          icon: 'svg_settings',
          ...(custom ? {} : { hotkey: 'mod+esc' }),
          order: 4000,
          onClick() {
            $.prefer.showCfgForm()
          },
        },
      })

      if (custom) {
        // 命令面板里的快捷键提示跟随用户配置
        bridge.getSettingsShortcut().then((r: { accelerator?: string }) => {
          const cmd = ($.main as any)?.moreExtraCommands?.preferences
          if (cmd && r?.accelerator) cmd.hotkey = r.accelerator
        }).catch(() => {})
      } else {
        $.hotkey?.register({
          preferences: {
            title: $t`conf.title`,
            hotkey: 'mod+esc',
            icon: 'svg_settings',
            context: 'everywhere',
            handle() {
              $.prefer.showCfgForm()
            },
          },
        })
      }
    }
  }
  return {
    prefer: new PreferAddon(),
    ...createPreferPlanAddon(addonParams),
    ...createPreferGlobalAddon(addonParams),
  }
}
