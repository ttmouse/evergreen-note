import React from 'react'
import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { LoadedAddonName } from '../../../main'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { cover } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { UnitProps } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { upperCaseFirst } from '../../utils/string'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { AddonCenterComp } from './AddonCenterComp'
import { isItemAddon } from './helper'
import { browser } from '@/slate-item/utils/browser'

export const ADDON_CENTER_CONF_KY = 'conf-addonCenter'

export function createAddonCenterAddon({ app, $ }: NewAddonParams) {
  class AddonCenter implements IAddon {
    app!: App
    config = {}

    isDialogOpen = false

    getVisibleList(): UnitProps[] {
      const list = Object.entries(app.addons)
        .map(([addonName, addon]) => {
          if (addonName === 'addonCenter') {
            return null
          }
          const info = (addon as any).addonInfo?.()
          if (isEmpty(info) || info.isCore) {
            return null
          }
          info.addonName = addonName
          info.title ??= upperCaseFirst(addonName).replace(/([A-Z])/g, ' $1')
          return info as UnitProps
        })
        .filter((item) => !!item)
      return list as any
    }

    addonInfo() {
      return {
        title: $t`addonCenter.title`,
        type: 'fieldset',
        isCore: true,
        subitems: {
          addonCenterManage: {
            title: $t`addonCenter.management`,
            quote: $t(`addonCenter.management_quote`, {
              count: $.addonCenter.getVisibleList().length,
            }),
            type: 'button',
            onClick: () => {
              $.addonCenter.show()
              // $.conf.dialog?.close();
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
        },
      }
    }

    isCore(addonName: string) {
      return (app.addons as any)[addonName]?.addonInfo?.()?.isCore
    }

    isAddonEnabled(addonName: string) {
      // let addonItem = $.cacher.get(addonName);
      // if (!addonItem) {
      //   addonItem = $.dbMemory.getItem(addonName);
      // }
      // if (!isEmpty(addonItem)) {
      //   if (!isEmpty(addonItem.value)) {
      //     return addonItem.value !== 'off';
      //   }
      // }

      // const addon = (app.addons as any)[addonName];
      // if (!addon) {
      //   return false;
      // }

      // const info = addon?.addonInfo?.();
      // return info?.isCore || info?.defaultValue !== 'off';
      return app.isAddonEnabled(addonName as LoadedAddonName)
    }

    getAddonInfo(addonName: string): UnitProps | null {
      const addon = (app.addons as any)[addonName]
      if (addon && 'addonInfo' in addon) {
        const adnConfig = addon.addonInfo!()
        adnConfig.type = 'fieldset'
        const newSubitems = {} as any
        if (!isEmpty(adnConfig.subitems)) {
          for (const [ky, item] of Object.entries(adnConfig.subitems)) {
            ;(item as UnitPersist).pky = `cfg-${addonName}`
            $.conf.formItems[ky] = item as any
            if (!['hidden', 'object'].includes((item as any).type)) {
              newSubitems[ky] = item
            }
          }
        }
        return {
          ...adnConfig,
          subitems: newSubitems,
        }
      }
      return null
    }

    getAddonTitle(addonName: string) {
      return (
        (app.addons as any)[addonName]?.addonInfo?.().title ??
        upperCaseFirst(addonName).replace(/([A-Z])/g, ' $1')
      )
    }

    enableAddon(addonName: string, status: boolean) {
      const info = (app.addons as any)[addonName]?.addonInfo?.()
      if (!isEmpty(info?.depend)) {
        // 将当前 addon 的依赖 addon 也一并启用
        for (const depend of info.depend) {
          if (status) {
            $.addonCenter.enableAddon(depend, true)
          }
        }
      }
      let addonItem = $.dbMemory.getItem(addonName)
      if (isEmpty(addonItem)) {
        addonItem = Item.newItem({
          ky: addonName,
          pky: ADDON_CENTER_CONF_KY,
          ori: $.addonCenter.getAddonTitle(addonName),
        })
      }
      const newItem = {
        ...addonItem,
        value: status ? 'on' : 'off',
      }
      $.dbMemory.saveItem(newItem)
      $.cacher.save(newItem)
    }

    show() {
      // The dialog can be registered before its portal mounts.
      if ($.dialog.dialogComponents.some(dialog => dialog.id === 'addon-center-manager')) return
      const dialogId = $.dialog.show({
        dialogId: 'addon-center-manager',
        title: $t`addonCenter.title`,
        titleVisibility: 'visible',
        clickAway: false,
        onClose: (_event, reason) => {
          if (reason === 'escapeKeyDown') $.dialog.close(dialogId)
        },
        maxWidth: 'lg',
        classList: ['addon-center-dialog'],
        body: <AddonCenterComp />,
      })
    }

    addonCommands(): HotkeyMaps {
      return {
        addonCenter: {
          title: $t`addonCenter.title`,
          icon: 'svg_addon',
          hotkey: 'mod+f1',
          context: 'everywhere',
          handle() {
            $.addonCenter.show()
          },
        },
      }
    }

    addonRun() {
      $.topic.lockHead(({ item }) => isItemAddon(item))

      if(!browser.isMobile)
        $.main.addMoreExtraCommands({
          addons: {
            title: $t`addonCenter.title`,
            icon: icons.svg_addon2,
            hotkey: 'mod+f1',
            onClick: () => {
              $.addonCenter.show()
            },
          },
        })
    }
  }

  return { addonCenter: new AddonCenter() }
}
