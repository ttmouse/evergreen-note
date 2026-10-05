/* eslint-disable no-console */
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { cover } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { omit } from '../../utils/object/omit'
import { useItem } from '../../hooks/useItem'
import React from 'react'
import { $t } from '../../../i18n'
import { TrashComp } from './TrashComp'
import { EleIcon, EleOuter } from '../../components/Ele'
import { Tip } from '../../components/Tip/Tip'
import { Icon } from '../../../components/MaterialIcon'
import { cls, preset } from '../../styles'
import { showSnack } from '../../utils/msg/showSnack'
import { atFirst } from '../../utils/atLater'
import { icons } from '../../../components/SvgIcon'
import { time } from '@/slate-item/utils/date/time'

export type TrashGroups = { [updated: string]: UnitPersist[] }

export function createTrashAddon({ app, $ }: NewAddonParams) {
  class Trash implements IAddon {
    app!: App
    config = {}

    async recoverItems(items: UnitPersist[], checkSuccess = false) {
      await items.forEach($.trash.recover)
      return items.every((item) => !isEmpty($.dbMemory.getItem(item.ky)))
    }

    async recover(item: KyString | UnitPersist) {
      if (typeof item === 'string') {
        item = (await $.dbDisk.open(await $.libAdmin.getOpenId()).node.get(item)) as UnitPersist
      }
      try {
        if (
          isEmpty(item) ||
          (!$.trash.isTrash(item) && '$trash' in item === false)
        ) {
          return false
        }
        console.log(`Recover item ${item.ky}: ${Item.headString(item)}`)
        const newItem = omit(item, ['status', '$trash'])

        if (
          Item.hasParent(item) &&
          (isEmpty($.dbMemory.getItem(item.pky)) ||
            !Item.isNormalStatus($.dbMemory.getItem(item.pky)))
        ) {
          await $.trash.recover(item.pky)
          atFirst(
            () => $.router.to({ ky: (item as UnitPersist).pky }),
            'recover-router',
            500
          )
        } else {
          atFirst(() => $.router.to(newItem), 'recover-router', 500)
        }

        if (Array.isArray(item.subitems)) {
          await $.trash.recoverItems(item.subitems as UnitPersist[])
        }

        return $.dbMemory.saveItem(newItem)
      } catch (e) {
        console.error(e)
      }
    }

    isTrash(item: UnitPersist) {
      return item?.status === -1
    }

    /**
     * 读取回收站的数据
     * @param size 要读取多少条数据
     * @returns
     */
    async getItems(size = 500): Promise<UnitPersist[]> {
      return ((await $.dbDisk.getItems()) as UnitPersist[])
        .filter(
          (item) => $.trash.isTrash(item) && Item.headString(item).length > 0
        )
        .sort((a, b) => b.updated - a.updated)
        .slice(0, size)
        .map((item) => ({
          $trash: true,
          ...omit(item, ['status', '$trash']),
        }))
    }

    async clearAll() {
      let percent = 0
      const snack = showSnack({
        content: `Clearing trash...`,
        progress: true,
      })
      const trashItems = ((await $.dbDisk.getItems()) as UnitPersist[]).filter(
        (item) => $.trash.isTrash(item)
      )

      const tb = await $.dbDisk.open(await $.libAdmin.getOpenId()).node;

      for (const [i, item] of trashItems.entries()) {
        const newUnit = { status: -2, created: 0, updated: time(), ky: item.ky };
        await tb.delete(item.ky);
        await tb.update(item.ky, newUnit);
        $.sync2.addPending($.libAdmin.current.ky, 'node', newUnit as UnitPersist)
        percent = Math.round((i / trashItems.length) * 100)
        snack.update({
          content: `Clearing trash... ${percent}%`,
        })
      }
      snack.close(1000)
    }

    showItems() {
      const dialogId = $.dialog.show({
        title: $t`trash.title`,
        body: <TrashComp />,
        classList: ['trash-dialog'],
        width: 600,
        SnapProps: {
          targetBox: window,
          place: ['right-in', 'top-in'],
        },
        buttons: {
          [$t`trash.clear`]: async () => {
            await $.trash.clearAll()
            $.dialog.close(dialogId)
          },
          [$t`common.close`]: null,
        },
      })
    }

    addonBeforeRun() {
      $.hotkey.register({
        trash: {
          title: $t`trash.title`,
          hotkey: 'alt+esc',
          handle() {
            $.trash.showItems()
          },
          context: 'everywhere',
        },
      })
    }

    addonRun() {
      const { saveItem } = $.dbMemory
      setTimeout(() => {
        cover(saveItem, (item, options) => {
          if ('$trash' in item) {
            console.error('Cannot save item in trash')
            return item
          }
          return saveItem.call($.dbMemory, item, options)
        })
      }, 100)

      const { findAllAsync } = $.search
      cover(findAllAsync, async (condition, options, forComponent) => {
        if (condition.includes('is:trash')) {
          options = {
            ...options,
            readTrash: true,
            items: (await $.trash.getItems()).slice(0, 100).map((item) => ({
              ...item,
              status: 1,
              $trash: true,
            })),
          }
          condition = condition.replace('is:trash', '')
          if (isEmpty(condition)) {
            condition = '*'
          }
          console.log('Search in trash', condition, options)
        }
        const result = await findAllAsync.call($.search, condition, options, forComponent)
        return result
      })

      $.topic.lockHead(({ item }) => '$trash' in item)

      $.editorView.addExtraItems({
        TrashRecoverIcon() {
          const item = useItem()
          if (!('$trash' in item)) return null
          const [isTrash, setIsTrash] = React.useState(true)

          const onClick = (e: React.MouseEvent) => {
            $.trash.recover(item)
            console.log($.dbMemory.getItem(item.ky))
            setIsTrash(false)
            const el = e.target as HTMLElement
            el.closest('.note-block')?.remove()
          }

          return (
            <Tip title={$t`trash.restore_item`} placement="right">
              <EleOuter classOuter="trash-restore-btn">
                <EleIcon onClick={onClick} classIcon={cls(preset.icon.basic)}>
                  <Icon name="svg_restore" />
                </EleIcon>
              </EleOuter>
            </Tip>
          )
        },
      })

      $.main.addMoreExtraCommands({
        trash: {
          title: $t`trash.title`,
          icon: icons.svg_trash,
          order: 9000,
          hotkey: 'mod+alt+t',
          onClick: async () => {
            $.trash.showItems()
          },
        },
      })
    }
  }

  return { trash: new Trash() }
}
