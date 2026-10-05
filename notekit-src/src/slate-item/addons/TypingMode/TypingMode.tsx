import { App, NewAddonParams, IAddon } from '../../engine/App';
import { makeAutoObservable } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';
import { atLater } from '../../utils/atLater';
import { createTmpDom } from '../../utils/dom/createTmpDom';
import { $$ } from '../../utils/lang';
import { $t } from '../../../i18n';
import { reactRender } from '../../utils/common';

/**
 * 专注输入模式
 */

export function createTypingModeAddon({ $ }: NewAddonParams) {
  class TypingMode implements IAddon {
    app!: App;
    config = {};

    isOpen = false;

    constructor() {
      makeAutoObservable(this);
    }

    open(isOpen: boolean) {
      this.isOpen = isOpen;
    }

    createComponent() {
      return observer((props: { selectors: string[] }) => {
        const { selectors } = props;
        React.useEffect(() => {
          document.addEventListener('keyup', (e) => {
            if ((e.target as HTMLElement).matches('[contenteditable]')) {
              if (!$.typingMode.isOpen) {
                $.typingMode.open(true);
              }
            }
          });

          document.addEventListener('mousemove', () => {
            if ($.typingMode.isOpen) {
              $.typingMode.open(false);
            }
          });
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [$.typingMode.isOpen]);

        atLater(
          () => {
            document
              .querySelectorAll(selectors.join(','))
              .forEach((ele: Element) => {
                Object.assign((ele as HTMLElement).style, {
                  transition: '0.3 all !important',
                  opacity: $.typingMode.isOpen ? 0 : 1,
                });
              });
          },
          'TypingMode',
          100
        );

        return null;
      });
    }

    addonInfo() {
      return {
        title: $t`typingMode.title`,
        quote: $t`typingMode.quote`,
        type: 'fieldset',
        defaultValue: 'off',
      };
    }

    addonRun() {
      const TypingModeComponent = this.createComponent();
      const { main } = this.app.addons;
      reactRender(
        createTmpDom(),
        <TypingModeComponent
          selectors={[
            `#${main.ids.extra}`, // 顶部功能图标
            '.editor-toolbar',
            `#${main.ids.crumbs}`, // 顶部面包屑
            `.editor-view .node-top > .node-head > .node-extra`, // 编辑器右上角功能图标
            // `.node-tools .tool-item:not(.node-btn)`, // 节点左侧功能图标
            `svg[name=help]`, // 右下角帮助图标
          ]}
        />
      );
    }
  }

  return new TypingMode();
}
