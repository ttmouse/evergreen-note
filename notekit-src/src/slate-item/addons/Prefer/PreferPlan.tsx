import Link from '@mui/material/Link';
import React from 'react';
import { $t } from '../../../i18n';
import { IAddon, App, NewAddonParams } from '../../engine/App';
import { after, cover } from '../../engine/helper';
import { Item } from '../../interfaces/item';
import { KyString, UNIT_ROLE } from '../../interfaces/unit';
import { time } from '../../utils/date/time';
import { isEmpty } from '../../utils/isEmpty';
import { deepClone } from '../../utils/object/deepClone';
import { pick } from '../../utils/object/pick';
import { mkid } from '../../utils/string/mkid';
import { NoteDatabase } from '../DbDisk/NoteDatabase';
import { normalizeItem } from '../DbMemory/helper';
import { ItemStore } from '../LibAdmin/ItemStore';
import { PreferPersist } from './Prefer';
import { PreferListComp } from './PreferListComp';

const DEFAULT_PLAN_KY = 'main';

export function createPreferPlanAddon({ app, $ }: NewAddonParams) {
  class PreferPlan implements IAddon {
    app!: App;
    config = {};

    /**
     * 用于处理偏好方案的 Store
     */
    store!: ItemStore<PreferPersist>;
    conn!: NoteDatabase;

    async ready() {
      $.preferPlan.conn = $.libAdmin.conn;

      $.preferPlan.store = new ItemStore({
        app,
        conn: $.preferPlan.conn,
        table: 'prefer',
        filter: (item) => {
          return item.role === UNIT_ROLE.PREFER_PLAN;
        },
        save: (item) => {
          if (!item.prky) {
            item = {
              ...item,
              prky: mkid(),
            };
          }
          item = {
            ...item,
            updated: time(),
          };
          $.preferPlan.store.items[item.ky] = item;
          return $.preferPlan.conn.prefer.put(deepClone(item));
        },
      });
    }

    get(planKy?: KyString) {
      if (!planKy) {
        planKy = DEFAULT_PLAN_KY;
      }
      return $.preferPlan.store.get(planKy);
    }

    getOptions() {
      const options: { [ky: string]: string } = {
        [DEFAULT_PLAN_KY]: $t`prefer.default_plan`,
      };
      for (const item of $.preferPlan.store.getList()) {
        options[item.ky] = item.ori;
      }
      return options;
    }

    save(planInfo: { prky: KyString; ori: string }) {
      const preferPlan = Item.newItem({
        pky: '-',
        role: UNIT_ROLE.PREFER_PLAN,
        ky: planInfo.prky,
        ...planInfo,
      });
      return $.preferPlan.store?.save(
        normalizeItem(preferPlan) as PreferPersist
      );
    }

    showUpdateForm(params: { ky: KyString }) {
      const { ky } = params;
      const item = $.preferPlan.store.get(ky);
      if (!item) {
        return;
      }
      $.prefer.dialog = $.form.popup({
        title: $t`prefer.title`,
        initialValues: pick(item, ['ori', 'quote']),
        subitems: {
          ori: {
            title: $t`prefer.plan_title`,
            type: 'text',
          },
          quote: {
            title: $t`prefer.plan_desc`,
            type: 'text',
            multiple: true,
            rows: 2,
          },
        },
        buttons: {
          [$t`common.done`]: (values) => {
            $.preferPlan.save({ ...item, ...values });
          },
          [$t`common.cancel`]: null,
        },
      });
    }

    delete(ky: KyString) {
      $.preferPlan.store.delete(ky);
    }

    showList() {
      $.dialog.show({
        title: $t`prefer.plan_list`,
        width: 300,
        body: <PreferListComp />,
      });
    }

    addonInfo() {
      return {
        title: $t`prefer.title`,
        quote: $t`prefer.quote`,
        // defaultValue: 'off',
        updated: 20221201,
        hidden: true,
      };
    }

    addonBeforeRun() {
      after($.libAdmin.getFieldset, (result) => {
        return {
          ...result,
          referConfig: {
            type: 'select',
            title: $t`prefer.choose_plan`,
            options: {
              ...$.preferPlan.getOptions(),
              $NEW: $t`common.new`,
            },
          },
          referQuote: {
            type: 'alert',
            quote: (
              <span>
                {$t`prefer.plan_quote`}
                <br />
                <Link href="#" onClick={() => $.preferPlan.showList()}>
                  {$t`prefer.manage_plan`}
                </Link>
              </span>
            ),
            when: (values: any) => values.referConfig !== '$NEW',
          },
          $newConfig: {
            type: 'text',
            title: $t`prefer.plan_title`,
            when: { referConfig: '$NEW' },
            quote: $t`prefer.new_plan_quote`,
          },
        };
      });

      const { save } = $.libAdmin;
      cover(save, async (libInfo) => {
        // 创建了新的偏好方案
        if (
          libInfo.referConfig === '$NEW' &&
          !isEmpty((libInfo as any).$newConfig)
        ) {
          const prky = mkid();
          const preferPlanItem = {
            ori: (libInfo as any).$newConfig,
            ky: prky,
            prky,
          };
          $.preferPlan.save(preferPlanItem);
          libInfo.referConfig = preferPlanItem.ky;
        }

        let shouldReload = false;
        if ($.libAdmin.current && libInfo.ky === $.libAdmin.current.ky) {
          const prevReferConfig = $.libAdmin.current.referConfig;
          if (prevReferConfig !== libInfo.referConfig) {
            // 修改了偏好方案，需要重新加载
            shouldReload = true;
          }
          $.libAdmin.current = libInfo;
        }

        const result = await save.call($.libAdmin, libInfo);
        if (shouldReload) {
          $.imports.reload();
        }

        return result;
      });
    }

    addonRun() {
      // Initialization for this the addon PreferPlan
    }
  }

  return { preferPlan: new PreferPlan() };
}
