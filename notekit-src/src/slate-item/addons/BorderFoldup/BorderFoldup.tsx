import { $t } from '../../../i18n';
import { IAddon, App, NewAddonParams } from '../../engine/App';
import { cls } from '../../styles';
import { ItemTransforms } from '../../transforms/item';
import { on } from '../../utils/dom/on';
import { domToItem } from '../EditorView/helper';

/**
 * Foldup each subitem by clicking left border
 */
export class BorderFoldup implements IAddon {
  app!: App;
  config = {};

  addonInfo() {
    return {
      title: $t`borderFoldup.title`,
      quote: $t`borderFoldup.quote`,
      defaultValue: 'off',
      type: 'fieldset',
    };
  }

  addonRun() {
    const styleClass = cls`
      .node-body-hover {
        border-color: #aad5fd;
        box-shadow: -2px 0px 0px #aad5fd;
        cursor: pointer;
        transition: box-shadow 0.3s;
      }
    `;
    document.body.classList.add(styleClass);

    const selector = '.editor-view .node-body[data-slate-node="element"]:not(.node[layout="flexmap"] *)';

    const canFoldup = (el: HTMLElement) => {
      return el.matches('.node-layout-tablesimple *') === false;
    };

    on('mouseover', selector, (e: MouseEvent) => {
      const ele = e.target as HTMLElement;
      if (canFoldup(ele)) {
        ele.classList.add('node-body-hover');
      }
    });

    on('mouseout', selector, (e: MouseEvent) => {
      const ele = e.target as HTMLElement;
      ele.classList.remove('node-body-hover');
    });

    on('click', selector, (e: MouseEvent) => {
      const ele = e.target as HTMLElement;
      if (!canFoldup(ele)) {
        return;
      }
      const { left } = ele.getBoundingClientRect();
      const { pageX } = e;
      if (left + 14 > pageX) {
        const item = domToItem(ele);
        if (item) {
          const willFoldup = !ele.querySelector(
            ':scope > .node-subitems > .node-foldup'
          );
          ItemTransforms.foldupSubItems(item.GetEditor(), {
            at: item.GetSlPath(),
            foldup: willFoldup,
          });
        }
      }
    });
  }
}

export function createBorderFoldupAddon({ app, $ }: NewAddonParams) {
  return { borderFoldup: new BorderFoldup() };
}
