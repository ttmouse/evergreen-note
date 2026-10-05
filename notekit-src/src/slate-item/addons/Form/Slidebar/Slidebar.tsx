import { $t } from '../../../../i18n';
import { App, NewAddonParams  } from '../../../engine/App';
import { mkid } from '../../../utils/string/mkid';
import { IAddonElement } from '../../ElementRegistry/ElementRegistry';
import { InlineElement } from '../../Inlines/Inlines';
import { SlashMenuItems } from '../../SlashMenu/SlashMenu';
import { StrmapRuleInfo, StrmapParams } from '../../Strmap/Strmap';
import { FormNeededProps } from '../interfaces';
import { SlidebarElementComp } from './SlidebarElementComp';

/**
 * Slidebar 表单元素的接口
 */
export type SlidebarElement = FormNeededProps &
  InlineElement & {
    blockType: string;
    value: number;
  };

export class Slidebar implements IAddonElement<SlidebarElement> {
  app!: App;
  config = {};

  isVoid(val: SlidebarElement) {
    return this.verify(val);
  }

  createComponent() {
    return SlidebarElementComp;
  }

  exportString(el: SlidebarElement) {
    return `{{slidebar ${el.value}}}`;
  }

  fromMarkdown(md: string) {
    return undefined;
  }

  verify(val: any): val is SlidebarElement {
    return val.blockType === 'slidebar';
  }

  strmap(): StrmapRuleInfo {
    const { slidebar } = this.app.addons;
    return {
      title: 'Slidebar',
      strmapRule: /\{\{slidebar\}\}$/,
      handle({ match }: StrmapParams) {
        return slidebar.createElement({ value: 0 });
      },
    } as any;
  }

  slashMenu(): SlashMenuItems {
    const { slashMenu, slidebar } = this.app.addons;
    return {
      slashSlidebar: {
        icon: 'svg_slidebar',
        title: $t`sliderbar.slash_menu_title`,
        order: slashMenu.order.inline,
        versions: {
          en: { v: 'slider' },
          cn: { v: '滑动条' },
          pinyin: { v: 'huo dong tiao' },
          py: { v: 'hdt' },
        },
        handle({ editor }) {
          slashMenu.insertText(editor, [
            slidebar.createElement({ value: 0 }),
            { text: '' },
          ]);
        },
      },
    };
  }

  createElement(props: { value: number }): SlidebarElement {
    return {
      inline: true,
      isVoid: true,
      iky: mkid(),
      blockType: 'slidebar',
      ...props,
      children: [{ text: `{{slidebar}}` }],
    } as unknown as SlidebarElement;
  }

  addonInfo() {
    return {
      title: $t`slidebar.title`,
      quote: $t`slidebar.quote`,
      defaultValue: 'on',
    };
  }

  addonRun() {
    // Initialization for this the addon Slidebar
  }
}

export function createSlidebarAddon({ app, $ }: NewAddonParams) {
  return new Slidebar();
}
