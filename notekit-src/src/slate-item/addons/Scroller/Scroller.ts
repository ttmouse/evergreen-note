import { $t } from '../../../i18n';
import { IAddon, App, NewAddonParams } from '../../engine/App';
import { cover, original } from '../../engine/helper';
import { Item } from '../../interfaces/item';
import { KyString } from '../../interfaces/unit';
import { scrollToElement } from './helper';
import { getUrlParams } from '../../utils/string/url';

export function createScrollerAddon({ app, $ }: NewAddonParams) {
  class Scroller implements IAddon {
    app!: App;
    config = {};

    route(ky: KyString) {
      const item = $.dbMemory.getItem(ky);
      if (Item.isTopic(item)) {
        return original($.router.to)(item);
      }
      const topicItem = $.crumbs.getCrumbs(item).find((one) => one.isTopic);
      if (!topicItem) {
        return original($.router.to)(item);
      }
      original($.router.to)(topicItem, { highlight: item.ky });
      $.scroller.scrollTo(ky);
    }

    scrollTo(ky: KyString) {
      scrollToElement(
        `#${$.main.ids.subitems} .node[data-ky="${ky}"]:not(.inline-element *)`
      );
    }

    addonInfo() {
      return {
        title: $t`scroller.title`,
        quote: $t`scroller.quote`,
        defaultValue: 'off',
        type: 'fieldset',
        updated: 20221107,
      };
    }

    addonBeforeRun() {
      const { route } = $.refer;
      cover(route, ({ ky }) => {
        return $.scroller.route(ky);
      });
    }

    addonRun() {
      setTimeout(() => {
        if (getUrlParams()?.highlight) {
          $.scroller.scrollTo(getUrlParams().highlight);
        }
      }, 300);
    }
  }

  return { scroller: new Scroller() };
}
