import { App, NewAddonParams } from '../../engine/App';
import { IAddonElement } from '../ElementRegistry/ElementRegistry';
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap';
import { InlineElement } from '../Inlines/Inlines';
import { SlashMenuItems } from '../SlashMenu/SlashMenu';
import { PomoElementComp } from './PomoElementComp';
import { PomoNeededProps, POMO_DEFAULT_DURATION } from './PomoComp';
import { $t } from '../../../i18n';
import { FORM_EL } from '../Form/Form';
import { TimeSecond } from '../../interfaces/unit';
import { isEmpty } from '../../utils/isEmpty';
import { datekit, h24, HH_mm } from '../../utils/date/datekit';
import { Item } from '../../interfaces/item';
import { time } from '../../utils/date/time';
import { CustomEditor } from '@/slate-item/custom-types';
import { Node } from 'slate';

export type PomoElement = InlineElement &
  PomoNeededProps & {
    // default: false
    log: 'yes' | 'no';
    // 使用次数
    count?: number;
  };

export function createPomoAddon({ app, $ }: NewAddonParams) {
  class Pomo implements IAddonElement<PomoElement> {
    app!: App;
    config = {};

    fieldset() {
      return {
        duration: {
          type: FORM_EL.number,
          title: $t`pomo.duration`,
          placeholder: String(POMO_DEFAULT_DURATION),
          // options: [5, 10, 15, 20, 25, 30, 45, 60],
        },
        // log: {
        //   type: FORM_EL.select,
        //   title: $t`pomo.log`,
        //   options: {
        //     no: $t`common.no`,
        //     yes: $t`common.yes`,
        //   },
        //   quote: $t`pomo.log_quote`,
        // },
      };
    }

    exportString(el: PomoElement) {
      return `{{pomo ${el.duration}}}`;
    }

    isVoid(val: InlineElement) {
      return this.verify(val);
    }

    createComponent() {
      return PomoElementComp;
    }

    showCreateRecordForm(params: {
      duration: number;
      item: UnitPersist;
      time: number;
    }) {
      $.form.popup({
        subitems: {
          rating: {
            type: 'rating',
            title: $t`pomo.rating_title`,
          },
          msg: {
            type: 'alert',
            quote: $t`pomo.rating_quote`,
          },
          comment: {
            type: 'text',
            multiple: true,
            title: $t`pomo.comment_title`,
          },
        },
        buttons: {
          [$t`common.save`]: (values) => {
            if (!isEmpty(values?.rating) || !isEmpty(values?.comment)) {
              $.pomo.createDailyRecord(params.item, {
                ...values,
                duration: params.duration,
                time: params.time,
              } as any);
            }
          },
          [$t`common.close`]: null,
        },
      });
    }

    createDailyRecord(
      item: UnitPersist,
      data: {
        duration: number;
        rating: number;
        comment: string;
        time: TimeSecond;
      }
    ) {
      const endTime = datekit(data.time)
      const startTime = endTime.add(-(data.duration??POMO_DEFAULT_DURATION), "minutes")
      const newItem = Item.newItem({
        pky: $.daily.getTodayItem().ky,
        leaves: [
          { text: '' },
          $.bilink.createElement({
            topic: h24(startTime.unix()),
            alias: startTime.format(HH_mm),
          }) as unknown as Node,
          { text: '-' },
          $.bilink.createElement({
            topic: h24(data.time),
            alias: endTime.format(HH_mm),
          }) as unknown as Node,
          { text: ' ' },
          {
            text: $t(`pomo.log_msg`, {
              duration: isEmpty(data.duration)
                ? POMO_DEFAULT_DURATION
                : data.duration,
            }) + " ",
          },
          // $.refer.createElement({ ky: item.ky, note: "Reference" }) as unknown as CustomEditor,
          { text: '\n' },
          $.rating.createElement({ value: data.rating ?? 0 }) as unknown as CustomEditor,
          { text: ' ' },
          { text: data.comment ?? '' },
        ],
        weight: Date.now(),
      });
      $.dbMemory.saveItem(newItem);
    }

    fromMarkdown(md: string) {
      return undefined;
    }

    verify(val: any): val is PomoElement {
      return (val as PomoElement).blockType === 'pomo';
    }

    strmap(): StrmapRuleInfo {
      const { pomo } = this.app.addons;
      return {
        title: 'Pomo',
        strmapRule: /\{\{pomo ?([0-9\.]*)\}\}$/,
        handle({ match }: StrmapParams) {
          const duration = parseFloat(match[1])
          return pomo.createElement({
            duration: isEmpty(duration) ? POMO_DEFAULT_DURATION : duration
          }) as unknown as CustomEditor;
        },
      };
    }

    slashMenu(): SlashMenuItems {
      const { slashMenu, pomo } = this.app.addons;
      return {
        slashPomo: {
          icon: 'svg_pomo',
          title: $t`pomo.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'pomo' },
            cn: { v: '番茄钟' },
            pinyin: { v: 'fan qie zhong' },
            py: { v: 'fqz' },
          },
          handle({ editor }) {
            const ele = $.pomo.createElement({
              duration: POMO_DEFAULT_DURATION,
            }) as unknown as CustomEditor
            slashMenu.insertText(editor, [ele, { text: '' }]);
          },
        },
      };
    }

    createElement(props: PomoNeededProps) {
      return $.inlines.createElement('pomo', '', props);
    }

    addonInfo() {
      return {
        title: $t`pomo.title`,
        type: 'fieldset',
        defaultValue: 'on',
        quote: $t`pomo.quote`,
      };
    }

    addonRun() {}
  }

  return new Pomo();
}
