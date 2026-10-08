import { IAddon, App, NewAddonParams } from '../../engine/App'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { $t } from '../../../i18n'
import { omit } from '../../utils/object/omit'
import { showSnack, SnackHanlder } from '@/slate-item/utils/msg/showSnack'
import { after } from '@/slate-item/engine/helper'
import { TRANSFER_BATCH_SIZE } from '@/slate-item/constants'
import { icons } from '@/components/SvgIcon'

function compress(props: { item: UnitPersist, app: App, maxDepth?: number, depth?: number }): Object {
  const item = props.item;
  const app = props.app;
  const maxDepth = props.maxDepth || 0;
  const depth = props.depth || 0;
  if (depth > maxDepth) return {};
  let result: any = {}
  const proc = omitItemKeys(item);
  if (item.subitems) {
    for (const subitem of (item.subitems as any)) {
      const r = compress({ item: subitem, app, maxDepth, depth });
      result = Object.assign(result, r);
    }
  }
  if (item.leaves) {
    for (const leaf of (item.leaves as unknown as ({ blockType?: string, children?: { text: string }[], value?: string } & Node)[])) {
      if (leaf.blockType) {
        let subitem: UnitPersist | null = null;
        switch (leaf.blockType) {
          case 'refer':
          case 'embed':
            if (leaf.value) {
              subitem = app.addons.dbMemory.getItem(leaf.value, { isRecur: true });
            }
            break;
          case 'bilink':
            if (leaf.children && leaf.children[0]) {
              const topicName = leaf.children[0].text;
              const topic = app.addons.dbMemory.getTopic(topicName);
              if (!topic) break;
              subitem = app.addons.dbMemory.getItem(topic.ky, { isRecur: true });
            }
            break;
          default:
            break;
        }
        if (subitem) {
          const r = compress({ item: subitem, app, maxDepth, depth: depth + 1 });
          result = Object.assign(result, r);
        }
      }
    }
  }
  delete proc['subitems'];
  if (proc.ky) result[proc.ky] = proc;
  return result;
}

function omitItemKeys(item: UnitPersist) {
  const shouldOmit = [
    'layout',
    'ikys',
    'mentionCount',
    'referText',
    'referBlock',
    'mentions',
    'foldup',
  ]
  return omit(item, (k, v) => {
    return (
      ['crumbs', 'mentions', 'text', 'json', 'path'].includes(k) ||
      k.startsWith('$') ||
      (k === 'ori' && notEmpty(item.leaves)) ||
      (isEmpty(v) && shouldOmit.includes(k))
    )
  })
}

export function createShareAddon(addonParams: NewAddonParams) {
  const { app, $ } = addonParams

  class Share implements IAddon {
    app!: App
    config = {}

    addonBeforeRun() {
      if ($.sandbox.isSandbox()) {
        app.disableAddon('daily')
        app.disableAddon('srs')
        return
      }
    }

    floatMenuItems() {
      return {
        share: {
          icon: icons.svg_link,
          title: $t`share.share`,
          onClick() {
            $.share.popupShareForm($.floatMenu.getContext().item)
          },
        },
        copyLink: {
          icon: icons.svg_link,
          title: $t`share.copy_link`,
          onClick() {
            const ky = $.floatMenu.getContext().item?.ky
            if (!ky) return
            navigator.clipboard
              .writeText(`evergreen://note/${ky}`)
              .then(() => showSnack({ content: $t`share.copy_link_done`, severity: 'success', autoClose: 1000 }))
              .catch(() => showSnack({ content: 'Copy failed', severity: 'error', autoClose: 1000 }))
          },
        },
      }
    }

    async uploadShareData(item: UnitPersist, formValues: any) {
      const { maxDepth } = formValues;
      const itemPersist = $.dbMemory.getItem(item.ky, { isRecur: true })
      const data = Object.values(compress({ item: itemPersist, app, maxDepth }));
      const shareId = `${app.user.id}-${itemPersist.ky}`;
      
      // 分批上传
      const batchSize = TRANSFER_BATCH_SIZE;
      const totalBatches = Math.ceil(data.length / batchSize);
      let snack: SnackHanlder = showSnack({ 
        content: `Uploading...`, 
        autoClose: Infinity, 
        severity: 'default', 
        vertical: 'bottom',
        horizontal: 'right',
        progress: 0,
        clickAway: false 
      });
      
      try {
        for (let i = 0; i < totalBatches; i++) {
          const startIndex = i * batchSize;
          const endIndex = Math.min(startIndex + batchSize, data.length);
          const batch = data.slice(startIndex, endIndex);

          snack.update({
            content: `Uploading... ${Math.round((i + 1) / totalBatches * 100)}%`,
            progress: (i + 1) / totalBatches * 100,
          });

          const res: any = await app.addons.http.post(
            '/api/share-document',
            {
              content: JSON.stringify(batch),
              shareId: shareId,
              clearFirst: i === 0 ? 'true' : 'false', // 首次上传时清空数据库
            }
          );
          
          if (res.code !== 0) {
            throw new Error('Upload failed');
          }
        }
        
        // 上传完成
        $.form.popup({
          title: "Share success",
          initialValues: {
            link: `${location.protocol}//${location.host}/share?shareId=${shareId}`,
          },
          subitems: {
            link: {
              type: 'text',
              title: 'Share Link',
            }
          },
          buttons: {
            [$t`common.copy`]: () => {
              navigator.clipboard.writeText(`${location.protocol}//${location.host}/share?shareId=${shareId}`)
                .then(()=>{
                  showSnack({
                    content: "Copied to clipboard",
                    severity: 'success',
                    autoClose: 1000,
                    clickAway: true,
                  });
                })
                .catch(()=>{
                  showSnack({
                    content: "Copy failed",
                    severity: 'error',
                    autoClose: 1000,
                    clickAway: true,
                  });
                });
              
            },
            [$t`common.cancel`]: null,
          },
        })
      } catch (error) {
        showSnack({
          clickAway: true,
          severity: 'error',
          content: "Share failed",
          autoClose: 1000,
        })
      } finally {
        snack.close(10);
      }
    }

    popupShareForm(item: UnitPersist) {
      $.form.popup({
        title: $t`share.share`,
        initialValues: {
          maxDepth: 0,
        },
        subitems: {
          maxDepth: {
            type: 'text',
            title: 'Share Linking Depth',
          },
        },
        buttons: {
          [$t`common.done`]: async (values: any) => {
            await $.share.uploadShareData(item, values);
          },
          [$t`common.cancel`]: null,
        },
      } as any);
    }

    addonRun() {
      if ($.sandbox.isSandbox()) return
      $.floatMenu?.addItems($.share.floatMenuItems())
      $.main.addMoreExtraCommands({
        shareManager: {
          title: $t`Manage Shared Docs`,
          icon: 'svg_link',
          order: 5000,
          async onClick() {
            window.open('/share-manager/', '_blank')
          },
        }
      })
      $.editorView.addDropdown({
        share: {
          icon: 'svg_link',
          title: $t`share.share`,
          async onClick(e, { item }) {
            $.share.popupShareForm(item)
          },
        },
        copyLink: {
          icon: 'svg_link',
          title: $t`share.copy_link`,
          onClick(e, { item }) {
            if (!item?.ky) return
            navigator.clipboard
              .writeText(`evergreen://note/${item.ky}`)
              .then(() => showSnack({ content: $t`share.copy_link_done`, severity: 'success', autoClose: 1000 }))
              .catch(() => showSnack({ content: 'Copy failed', severity: 'error', autoClose: 1000 }))
          },
        },
      })
    }
  }
  return {
    share: new Share(),
  }
}
