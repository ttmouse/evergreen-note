import { IAddon, App, NewAddonParams } from '../../engine/App';
import { Item } from '../../interfaces/item';
import { KyString, UnitPersist } from '../../interfaces/unit';
import { after, before } from '../../engine/helper';
import { LoadedAddonName } from '../../../main';
import { isEmpty, notEmpty } from '../../utils/isEmpty';
import { KYS } from '../../utils/string/mkid';
import { until } from '../../utils/until';
import { omit } from '../../utils/object/omit';
import { ConfFormWrapComp } from './ConfFormWrapComp';
import React from 'react';
import { FormElProps, FormHanlder } from '../Form/Form';
import { atLater } from '../../utils/atLater';
import { ADDON_CENTER_CONF_KY } from '../AddonCenter/AddonCenter';
import { DialogProps } from '../../utils/msg/showDialog';
import { $t } from '../../../i18n';

export type ConfPersist = UnitPersist & {
  value: unknown;
};

export function createConfAddon({ app, $ }: NewAddonParams) {
  const CONF_KY = `AppConfigs`;
  let _flatAll = {} as any;

  class Conf implements IAddon {
    app!: App;

    config = {
      confAddonEnabled: true,
    };

    all = {};
    dialog: FormHanlder<any> = null as any;
    cached: null | { [ky: KyString]: UnitPersist } = null;

    formItems: {
      [ky: KyString]: Partial<UnitPersist> &
        Pick<UnitPersist, 'ky' | 'pky'> &
        FormElProps<any>;
    } = {};

    get flatAll() {
      if (isEmpty(_flatAll)) {
        for (const [, data] of Object.entries($.conf.all)) {
          Object.assign(_flatAll, data);
        }
      }
      return _flatAll;
    }

    // showForm(
    //   params: {
    //     activeKey?: string; // 要激活的配置组
    //     pick?: string[]; // 挑选想要显示的配置组
    //     hideTabs?: boolean; // 是否隐藏左侧 Tabs
    //     hideDialogTitle?: boolean; // 是否隐藏对话窗口
    //     DialogProps?: Partial<DialogProps<any>>;
    //   } = {} as any
    // ) {
    //   const {
    //     activeKey,
    //     pick,
    //     hideTabs,
    //     hideDialogTitle,
    //     DialogProps: dialogProps = {},
    //   } = params;
    //   const subitems = {} as any;
    //   for (const [addonName, addon] of Object.entries($)) {
    //     if (Array.isArray(pick) && !pick.includes(addonName)) {
    //       continue;
    //     }
    //     if ('addonInfo' in addon && app.isAddonEnabled(addonName)) {
    //       const adnConfig = addon.addonInfo!();
    //       const newSubitems = {} as any;
    //       if (!isEmpty((adnConfig as any).subitems)) {
    //         for (const [ky, item] of Object.entries((adnConfig as any).subitems)) {
    //           (item as UnitPersist).pky = `cfg-${addonName}`;
    //           $.conf.formItems[ky] = item as any;
    //           if (!['hidden', 'object'].includes((item as any).type)) {
    //             newSubitems[ky] = item;
    //           }
    //         }
    //       }
    //       if (notEmpty(newSubitems)) {
    //         subitems[addonName] = {
    //           ...adnConfig,
    //           subitems: newSubitems,
    //         };
    //       }
    //     }
    //   }

    //   $.conf.dialog = $.form.popup({
    //     title: hideDialogTitle ? undefined : $t`conf.title`,
    //     width: 400,
    //     subitems,
    //     initialValues: $.conf.flatAll,
    //     FormWrap: (props: any) => {
    //       return (
    //         <ConfFormWrapComp
    //           {...props}
    //           hideTabs={hideTabs}
    //           activeKey={activeKey}
    //           fields={subitems}
    //         />
    //       );
    //     },
    //     onChangeElement(name, value) {
    //       $.conf.set(name, value);
    //     },
    //     DialogProps: {
    //       classList: ['preferences-dialog'],
    //       maxWidth: 'md',
    //       ...dialogProps,
    //     },
    //   });
    // }

    // showAddonForm(addonName: string) {
    //   $.conf.showForm({
    //     // activeKey: addonName,
    //     pick: [addonName],
    //     hideTabs: true,
    //     hideDialogTitle: true,
    //   });
    // }

    async load() {
      await until(() => !!$.cacher.data);
      $.conf.cached = omit($.cacher.data, (k, v) => v.path?.includes(CONF_KY));
    }

    create<T extends Object>(addonName: LoadedAddonName, initialValues: T) {
      const addonConfKy = `cfg-${addonName}`;

      if (addonConfKy in $.dbMemory.nodes === false) {
        const settings = ($[addonName] as any).addonInfo?.();
        const ori = settings?.title ?? addonName;
        $.dbMemory.saveItem(
          Item.newItem({
            ky: addonConfKy,
            ori,
            pky: CONF_KY,
          })
        );
      }
      const data = {} as T;
      for (const [key, val] of Object.entries(initialValues)) {
        const value = $.conf.get(key) ?? val;
        (data as any)[key] = value;
        ($.conf.formItems as any)[key] = {
          pky: `cfg-${addonName}`,
          value,
        };
      }

      ($.conf.all as any)[addonName] = data;

      return new Proxy<T>(data, {
        get(target, key: string, reiceiver: any) {
          return $.conf.get(key) ?? Reflect.get(target, key, reiceiver);
        },

        set(target, key: string, value: unknown, reiceiver: any) {
          $.conf.set(key, value, true);
          return Reflect.set(target, key, value, reiceiver);
        },
      });
    }

    set(confKey: KyString, value: unknown, setByProxy = false) {
      let item = $.dbMemory.getItem(confKey);
      const { pky } = $.conf.formItems[confKey];
      const [, addonName] = pky.split('-');
      if (isEmpty(item)) {
        item = Item.newItem({
          ky: confKey,
          pky,
        });
      }
      if (!setByProxy) {
        ($.conf.all as any)[addonName][confKey] = value;
      }
      const newItem = {
        ...item,
        value,
        leaves: [
          {
            text: $.conf.formItems[confKey].title ?? confKey,
            label: true,
          } as any,
          {
            text: String(value),
            value,
          },
        ],
      };
      $.dbMemory.saveItem(newItem);
      $.cacher.save(newItem);
      $.conf.cached ??= {};
      $.conf.cached[newItem.ky] = newItem;
      $.cacher.save(newItem);
      atLater(() => {
        _flatAll = {};
      }, 'reset-conf');
    }

    get(confKey: KyString) {
      return (
        $.dbMemory.getItem(confKey)?.value ?? $.conf.cached?.[confKey]?.value
      );
    }

    // addonCommands(): HotkeyMaps {
    //   return {
    //     confShowForm: {
    //       title: $t`imports.import_database`,
    //       hotkey: 'mod+esc',
    //       context: 'global',
    //       handle() {
    //         $.conf.showForm();
    //       }
    //     }
    //   }
    // }

    addonBeforeRun() {
      // after($.dbMemory.load, async (result) => {
      //   await result;
      //   $.topic?.createTopic('App/Configs', {
      //     ky: CONF_KY,
      //     asky: ['configs'],
      //     subitems: [
      //       { pky: CONF_KY, ky: ADDON_CENTER_CONF_KY, ori: 'Addon center' },
      //     ],
      //   });
      // });

      // before(app.execAddonRun, (addon, addonName: any) => {
      //   if (!isEmpty(addon.config)) {
      //     addon.config = $.conf.create(addonName, addon.config);
      //   }
      // });
    }

    addonRun() {
      // $.main?.addMoreExtraCommands({
      //   preferences: {
      //     title: $t`conf.title`,
      //     icon: 'svg_settings',
      //     hotkey: 'mod+esc',
      //     order: 4000,
      //     onClick() {
      //       $.conf.showForm();
      //     },
      //   },
      // });

      // $.hotkey?.register({
      //   preferences: {
      //     title: $t`conf.title`,
      //     hotkey: 'mod+esc',
      //     icon: 'svg_settings',
      //     context: 'global',
      //     handle() {
      //       $.conf.showForm();
      //     },
      //   },
      // });

      $.topic.lockHead(({ item }) => $.traits.match(`under:${CONF_KY}`, item));

      // setTimeout(() => this.showAddonForm('alias'), 100);
    }
  }

  return { conf: new Conf() };
}
