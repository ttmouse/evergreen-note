import React from 'react';
import { IAddon, App, NewAddonParams } from '../../../engine/App';
import { CustomItem, SearchDialogComp } from './SearchDialogComp';
import { mkid } from '../../../utils/string/mkid';
import { cover } from '../../../engine/helper';
import { isEmpty } from '../../../utils/isEmpty';
import { LogicString } from '../../Traits/Logic';
import { DialogProps } from '../../../utils/msg/showDialog';
import { $t } from '../../../../i18n';
import { cls, colorBase } from '../../../styles';
import { $$ } from '../../../utils/lang';
import { showSnack } from '../../../utils/msg/showSnack';

class KwStore {
  list: string[] = [];

  add(kw: string) {
    if (isEmpty(kw) || /^w+$/.test(kw)) {
      return;
    }
    this.list = this.list.filter((item) => item !== kw);
    this.list.unshift(kw);
    this.save();
  }

  save() {
    localStorage.setItem('kw', JSON.stringify(this.list));
  }

  load() {
    const str = localStorage.getItem('kw');
    if (str) {
      this.list = JSON.parse(str);
    }
  }
}

export function createSearchDialogAddon({ app, $ }: NewAddonParams) {
  class SearchDialog implements IAddon {
    app!: App;
    config = {};

    dialogId = mkid();
    store = new KwStore();
    lastKeyword = '';

    show<T>(
      options: Partial<DialogProps<T>> & { keyword: LogicString } = {} as any
    ) {
      const { keyword = '', SnapProps: snap } = options;
      return $.dialog.show({
        width: 700,
        classList: [cls`transition: opacity 0.5s ease-in-out;`],
        dialogId: this.dialogId,
        body: (
          <SearchDialogComp
            keyword={keyword}
            fetchList={$.searchDialog.fetchList}
            onChoose={({ item }) => $.searchDialog.handleChoose(item)}
          />
        ),
        SnapProps: {
          targetBox: {
            left: 0,
            top: 60,
            width: window.innerWidth,
            height: window.innerHeight - 40,
          },
          place: ['center', 'top-in'],
          ...snap,
        },
      });
    }

    fetchList(keyword: string) {
      try {
        const result = $.searchDialog.findAll(keyword);
        $.sorter.sortByCglEvaluate(result, keyword)

        $.searchDialog.unshiftItemForCreateTopic(keyword, result);

        return result;
      } catch(e) {
        console.warn('Failed to fetch search result for keyword: ', keyword, e);
        return [];
      }
    }

    unshiftItemForCreateTopic(keyword: string, result: UnitPersist[]) {
      if (
        /[:(]/.test(keyword) === false && // keyword is not a search command like "tag:xxx"
        !$.topic.isExist(keyword)
      ) {
        // 当没有找到对应的 topic 时，提供创建 topic 的选项
        result.unshift({
          ky: 'create-topic',
          headString: (
            <CustomItem
              keyword={keyword}
              caption={$t`searchDialog.create_topic`}
            />
          ),
          onConfirm() {
            const topicItem = $.topic.createTopic(keyword);
            if (!topicItem) {
              showSnack($$`Fail to create topic: ${keyword}`);
              return;
            }
            $.router.to(topicItem);
            $.searchDialog.close();
          },
        } as any);
      }
      return result;
    }

    findAll(...args: Parameters<typeof $.search['findAll']>) {
      return $.search.findAll(...args);
    }

    saveKeyword(kw: string) {
      $.searchDialog.store.add(kw);
    }

    close() {
      $.dialog.remove($.searchDialog.dialogId);
    }

    handleChoose(item: UnitPersist & { onConfirm?: () => void }) {
      if (!isEmpty($.searchDialog.lastKeyword)) {
        $.searchDialog.saveKeyword($.searchDialog.lastKeyword);
      }
      if (!item) {
        return;
      }
      if (item.onConfirm) {
        item.onConfirm();
      } else {
        if ($.router.to(item) === 'main') $.searchDialog.close();
        else {
          document.getElementById('search-dialog-input')?.focus()
          const dlg = document.getElementById($.searchDialog.dialogId)
          dlg && (dlg.style.opacity = '0.8');
        }
      }
    }

    addonInfo() {
      return {
        title: $t`searchDialog.title`,
        quote: $t`searchDialog.quote`,
        defaultValue: 'on',
        isCore: true,
        updated: 20221031,
      };
    }

    addonBeforeRun() {
      cover($.search.showDialog, (opt) => {
        return $.searchDialog.show(opt);
      });
    }

    addonRun() {
      $.searchDialog.store.load();
    }
  }

  return { searchDialog: new SearchDialog() };
}
