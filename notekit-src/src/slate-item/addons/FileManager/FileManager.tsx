import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Item, ItemNode } from '../../interfaces/item'
import { KyString, TimeMilliSecond } from '../../interfaces/unit'
import { Logic, LogicString } from '../Traits/Logic'
import React from 'react'
import { isEmpty } from '../../utils/isEmpty'
import { $t } from '../../../i18n'
import { FileManagerDeleteIcon } from './FileManagerDeleteIcon'
import { ImgElement } from '../Img/Img'
import { AttachmentElement } from '../Attachment/Attachment'
import { FileManagerComp } from './FileManagerComp'

export const FILEMANAGER_KY = 'AppFileManager'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createFileManagerAddon({ app, $ }: NewAddonParams) {

  class FileManager implements IAddon {
    app!: App

    showFileManagerDialog() {
      const rect = document.getElementById(`${app.appName}-outer`)?.getBoundingClientRect()
      $.floatViewer.showDialog({
        body: <FileManagerComp />,
        DialogProps: {
          width: 800,
          height: 500,
          canPin: {
            pin: true,
          },
          cssClass: ['node-head-visible', 'filemanager-dialog'],
          attributes: {
            'dialog-list-mode': app.states.floatViewerMode,
          }
        },
        isPin: true,
        key: FILEMANAGER_KY,
        title: $t`File Manager`
      })
    }

    addonInfo() {
      return {
        title: $t`File Manager`,
        quote: $t`Manage your uploaded files here.`,
        updated: 2026_02_16,
        defaultValue: 'on',
        isCore: true,
      }
    }


    addonBeforeRun() {
    }

    addonRun() {
      const freeUpStorage = async () => {
        const cache = await caches.open('EvergreenNote-v0-UserData')
        const keys = await cache.keys()
        const allFilesUsed: string[] = []
        const allNodes = await $.dbDisk.open(await $.libAdmin.getOpenId()).node.toArray();
        for (const node of allNodes) {
          if (!node.leaves) continue;
          for (const leaf of node.leaves) {
            const lf = leaf as (AttachmentElement | ImgElement);
            if (!lf.blockType) continue;
            if (lf.blockType === 'attachment') {
              const q = (lf as AttachmentElement).path.split('/').pop();
              q && allFilesUsed.push(q);
            } else if (lf.blockType === 'img') {
              const q = (lf as ImgElement).src.split('/').pop();
              q && allFilesUsed.push(q);
            }
          }
        }
        for (const key of keys) {
          const filename = key.url.split('/').pop();
          if (!filename) continue;
          if (!allFilesUsed.includes(filename)) {
            await cache.delete(key)
          }
        }
      }


      $.editorView.addExtraItems({
        FileManagerDeleteIcon,
      })

      $.main.addMoreExtraCommands({
        filemanager: {
          title: $t`File Manager`,
          icon: 'svg_fold',
          order: 7100,
          onClick() {
            $.filemanager.showFileManagerDialog()
          },
        },
      })
    }
  }
  return { filemanager: new FileManager() }
}
