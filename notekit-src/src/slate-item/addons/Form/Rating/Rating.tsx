import { App, NewAddonParams  } from '../../../engine/App';
import { mkid } from '../../../utils/string/mkid';
import { IAddonElement } from '../../ElementRegistry/ElementRegistry';
import { InlineElement } from '../../Inlines/Inlines';
import { RatingElementComp } from './RatingElementComp';
import { SlashMenuItems } from '../../SlashMenu/SlashMenu';
import { StrmapRuleInfo, StrmapParams } from '../../Strmap/Strmap';
import { FormNeededProps } from '../interfaces';
import { $t } from '../../../../i18n';

/**
 * Rating 表单元素的接口
 */
export type RatingElement = FormNeededProps &
  InlineElement & {
    blockType: string;
    value: number;
  };

export class Rating implements IAddonElement<RatingElement> {
  app!: App;
  config = {};

  isVoid(val: RatingElement) {
    return this.verify(val);
  }

  createComponent() {
    return RatingElementComp;
  }

  exportString(el: RatingElement) {
    return `{{rating ${el.value}}}`;
  }

  verify(val: any): val is RatingElement {
    return val.blockType === 'rating';
  }

  strmap(): StrmapRuleInfo {
    const { rating } = this.app.addons;
    return {
      title: 'Rating',
      strmapRule: /\{\{rating\}\}$/,
      handle({ match }: StrmapParams) {
        return rating.createElement({ value: 0 });
      },
    } as any;
  }

  slashMenu(): SlashMenuItems {
    const { slashMenu, rating } = this.app.addons;
    return {
      slashRating: {
        icon: 'svg_rating',
        title: $t`rating.slash_menu_title`,
        order: slashMenu.order.inline,
        versions: {
          en: { v: 'rating' },
          cn: { v: '评分' },
          pinyin: { v: 'ping fen' },
          py: { v: 'pf' },
        },
        handle({ editor }) {
          slashMenu.insertText(editor, [
            rating.createElement({ value: 0 }),
            { text: '' },
          ]);
        },
      },
    };
  }

  createElement(props: { value: number }): RatingElement {
    return {
      inline: true,
      isVoid: true,
      iky: mkid(),
      blockType: 'rating',
      ...props,
      children: [{ text: `{{rating}}` }],
    } as unknown as RatingElement;
  }

  addonInfo() {
    return {
      title: $t`rating.title`,
      quote: $t`rating.quote`,
      defaultValue: 'on',
    };
  }

  addonRun() {
    // Initialization for this the addon Rating
  }
}

export function createRatingAddon({ app, $ }: NewAddonParams) {
  return new Rating();
}
