import { $t } from '../../../../i18n';
import { App, NewAddonParams } from '../../../engine/App';
import { after } from '../../../engine/helper';
import { Element } from '../../../slate.inc';
import { datekit, YYYY_MM_DD } from '../../../utils/date/datekit';
import { IAddonElement } from '../../ElementRegistry/ElementRegistry';
import { InlineElement } from '../../Inlines/Inlines';
import { SlashMenuItems } from '../../SlashMenu/SlashMenu';
import { StrmapRuleInfo, StrmapParams } from '../../Strmap/Strmap';
import { DatePickerElementComp } from './DatePickerElementComp';
import dayjs from 'dayjs'

export type DatePickerElement = InlineElement & {
  inline: boolean;
  blockType: 'datePicker';
  children: Node[];
  value: string;
  role: 'bilink' | 'deadline';
};

/**
 * Date Addon
 */
export function createDatePickerAddon({ app, $ }: NewAddonParams) {
  class DatePicker implements IAddonElement<DatePickerElement> {
    app!: App;
    config = {};

    blockType = 'datePicker';

    /**
     * If date element is a void element ?
     */
    isVoid = (val: any) => $.datePicker.verify(val);

    fromMarkdown(markdown: string) {
      return {} as any;
    }

    exportString(el: DatePickerElement) {
      return el.value;
    }

    /**
     * Check if a value matches the data structure of date element
     */
    verify(val: any): val is DatePickerElement {
      return (
        Element.isElement(val) && (val as any).blockType === $.datePicker.blockType
      );
    }

    /**
     * Create date element
     */
    createElement(props: { value?: YYYY_MM_DD } = {}): DatePickerElement {
      const { value } = props;
      return this.app.addons.inlines.createElement(
        $.datePicker.blockType,
        value ?? '',
        {
          role: 'bilink',
          ...props,
        }
      ) as DatePickerElement;
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{datePicker\}\}/,
        handle: ({ match }: StrmapParams) => {
          return this.createElement();
        },
      };
    }

    /**
     * Add an item to slash menu to create date element
     */
    slashMenu(): SlashMenuItems {
      const { datePicker, slashMenu } = this.app.addons
      return {
        slashMenuDate: {
          id: 'slash-menu-date',
          icon: 'svg_day',
          title: $t`bilink.link_today`,
          order: 100,
          versions: {
            pinyin: { v: 'lian jie dao jin tian' },
            py: { v: 'ljdjt' },
            zh: { v: '链接到今天' },
            en: { v: 'Link to today' },
          },
          handle({ editor }: SlashHanlderParams) {
            const d = dayjs().format(YYYY_MM_DD)
            slashMenu.insertText(editor, [
              datePicker.createElement({ value: d }) as unknown as Node,
              { text: '' },
            ])
          },
        },
        slashMenuYesterday: {
          id: 'slash-menu-date',
          icon: 'svg_day',
          title: $t`bilink.link_yesterday`,
          order: 100,
          versions: {
            pinyin: { v: 'lian jie dao zuo tian' },
            py: { v: 'ljdzt' },
            cn: { v: '链接到昨天' },
            en: { v: 'Link to yesterday' },
          },
          handle({ editor }: SlashHanlderParams) {
            const d = dayjs().add(-1, 'day').format(YYYY_MM_DD)
            slashMenu.insertText(editor, [
              datePicker.createElement({ value: d }) as unknown as Node,
              {
                text: '',
              },
            ])
          },
        },
        slashMenuTomorrow: {
          id: 'slash-menu-date',
          icon: 'svg_day',
          title: $t`bilink.link_tomorrow`,
          order: 100,
          versions: {
            pinyin: { v: 'lian jie dao ming tian' },
            py: { v: 'ljdmt' },
            cn: { v: '链接到明天' },
            en: { v: 'Link to tomorrow' },
          },
          handle({ editor }: SlashHanlderParams) {
            const d = dayjs().add(1, 'day').format(YYYY_MM_DD)
            slashMenu.insertText(editor, [
              datePicker.createElement({ value: d }) as unknown as Node,
              {
                text: '',
              },
            ])
          },
        },
        slashDate: {
          icon: 'svg_day',
          title: $t`datePicker.slash_menu_title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'date picker' },
            cn: { v: '日期选择器' },
            pinyin: { v: 'ri qi xuan ze qi' },
            py: { v: 'rqxzq' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, [
              datePicker.createElement(),
              { text: '' },
            ]);
          },
        },
      }
    }

    /**
     * Add a React component to render date element
     */
    createComponent() {
      return DatePickerElementComp;
    }

    getBilinksFromItem(item: UnitPersist): string[] {
      return (
        item.leaves?.filter($.datePicker.verify).map((leaf) => leaf.value) ?? []
      );
    }

    route(date: YYYY_MM_DD, extraInfo?: any, itemEditor?: any) {
      $.daily.route(date, extraInfo, itemEditor);
    }

    addonInfo() {
      return {
        title: $t`datePicker.title`,
        quote: $t`datePicker.quote`,
        defaultValue: 'on',
        updated: 20221109,
      };
    }

    addonBeforeRun() {
      after($.bilink.getBilinksFromItem, (result, item) => {
        return [...result, ...$.datePicker.getBilinksFromItem(item)];
      });
    }

    /**
     * Initialize Date addon
     */
    addonRun() {
      // const { date } = this.app.addons;
      // Use cover()、after() to extends some addon's methods
      // Add event listener
      // document.addEventListener()
    }
  }

  return { datePicker: new DatePicker() };
}
