import { App, CommandMaps, NewAddonParams } from '../../engine/App';
import { KyString } from '../../interfaces/unit';
import { Element } from '../../slate.inc';
import { IAddonElement } from '../ElementRegistry/ElementRegistry';
import { InlineElement } from '../Inlines/Inlines';
import { SlashMenuItems } from '../SlashMenu/SlashMenu';
import { StrmapRuleInfo } from '../Strmap/Strmap';
import { LogicString } from '../Traits/Logic';
import { RandomElementComp } from './RandomComp';
import { shuffle } from '../../utils/array/shuffle';
import { isEmpty } from '../../utils/isEmpty';
import { showSnack } from '../../utils/msg/showSnack';
import { $t } from '../../../i18n';

export type RandomNeededProps = {
  /**
   * The condition to indicate the scope of the random.
   */
  value?: string;
  /**
   * The last random item.
   */
  lastKy?: string;
};

export type RandomElement = InlineElement & RandomNeededProps;

declare global {
  interface AppConf {
    randomRule?: LogicString;
  }
}

/**
 * Random Addon
 */
export function createRandomAddon({ app, $ }: NewAddonParams) {
  class Random implements IAddonElement<RandomElement> {
    app!: App;
    config = {
      randomRule: '',
    };

    /**
     * Is random element a void element ?
     */
    isVoid = () => false;

    fromMarkdown(markdown: string) {
      return {} as any;
    }

    exportString(el: RandomElement): string {
      return `{{random ${el.value}}}`;
    }

    /**
     * Check if a value matches the data structure of random element
     */
    verify(val: any): val is RandomElement {
      return Element.isElement(val) && (val as any).blockType === 'random';
    }

    /**
     * Create random element
     */
    createElement(props?: RandomNeededProps): RandomElement {
      const { value = '*' } = props ?? {};
      return this.app.addons.inlines.createElement(
        'random',
        ``,
        props
      ) as RandomElement;
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{random\s+/,
        handle: () => {
          return this.createElement();
        },
      };
    }

    /**
     * Add an item to slash menu to create random element
     */
    slashMenu(): SlashMenuItems {
      const { slashMenu, random, search } = this.app.addons;
      return {
        slashRandom: {
          icon: 'svg_dice',
          title: $t`random.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'random block' },
            cn: { v: '随机块' },
            pinyin: { v: 'sui ji kuai' },
            py: { v: 'sjk' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, [
              random.createElement({}),
              { text: '' },
            ]);
            search.focusInput(editor);
          },
        },
      };
    }

    /**
     * Add a React component to render random element
     */
    createComponent() {
      return RandomElementComp;
    }

    findAll(
      condition: LogicString, // condition to find items
      options: {
        items?: UnitPersist[]; // If not provided, will search all items
        limit?: number; // If not provided, will search all items
        isRecur?: boolean; // Whether read the subitems for each result item
        foldupEach?: boolean; // Whether foldup each result item
      } = {}
    ): UnitPersist[] {
      return this.app.addons.search.findAll(condition, options);
    }

    to(ky: KyString) {
      $.router.to({ ky });
    }

    getShuffledItems() {
      const list = isEmpty(app.cfg.randomRule)
        ? $.dbMemory.list
        : $.random.findAll(app.cfg.randomRule);
      return shuffle([...list]);
    }

    randomIndex = 0;
    shuffledItems!: null | UnitPersist[];
    route() {
      $.random.shuffledItems ??= $.random.getShuffledItems();
      if (isEmpty($.random.shuffledItems)) {
        showSnack(
          $t(`random.no_item_found`, { rule: app.cfg.randomRule })
        );
        return;
      }
      const item = $.random.shuffledItems[$.random.randomIndex];
      $.random.randomIndex += 1;
      if ($.random.randomIndex >= $.random.shuffledItems.length) {
        $.random.randomIndex = 0;
      }
      $.random.to(item.ky);
    }

    addonInfo() {
      return {
        title: $t`random.title`,
        type: 'fieldset',
        quote: $t`random.quote`,
        defaultValue: 'off',
        subitems: {
          randomRule: {
            title: $t`random.random_route_rule`,
            type: 'text',
            onElChange() {
              $.random.shuffledItems = null;
            },
            quote: $t`random.random_route_rule_quote`,
          },
        },
      };
    }

    addonCommands() {
      return {
        random: {
          title: $t`random.route`,
          icon: 'svg_dice',
          hotkey: 'f1',
          context: 'everywhere',
          handle() {
            $.random.route();
            return false;
          },
        },
      } as CommandMaps;
    }

    addonRun() {
      $.main.addExtraCommands({
        random: {
          title: $t`random.route`,
          icon: 'svg_dice',
          onClick() {
            $.random.route();
          },
        },
      });
    }
  }

  return { random: new Random() };
}
