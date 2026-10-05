import { IAddon, App, NewAddonParams } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { $$ } from '../../utils/lang'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { after, before, cover } from '../../engine/helper'
import { dialogShow } from '../../utils/msg/showDialog'
import React from 'react'
import ReactDOM from 'react-dom'
import { omit } from '../../utils/object/omit'
import { Item } from '../../interfaces/item'
import { $t } from '../../../i18n'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { mkid } from '@/slate-item/utils/string/mkid'
import { Logic } from '../Traits/Logic'


export type GroupFunc = (items: UnitPersist[],
  options: {
    foldupAll?: boolean // 折叠列表中的所有主题
    foldupSome?: string[] // 折叠列表中的指定主题
    parentLayout?: string
  }) => UnitPersist[]
export type CustomizedGroupMode = {
  title: string
  icon: string
  layout: string
} & ({ conditions: { name: string, condition: string, logic?: Logic }[] } | { func: GroupFunc })

export const APP_GROUPS_KY = `AppGroups`

export function createGroupHelperAddon(addonParams: NewAddonParams) {
  const { app, $ } = addonParams

  class GroupHelper implements IAddon {
    app!: App

    addonInfo() {
      return {
        title: $t`Group Helper`,
        type: 'fieldset',
        isCore: true,
        quote: $t`Help you to group your notes`,
        subitems: {
          groupManage: {
            title: $t`Group Management`,
            type: 'button',
            onClick: () => {
              $.floatViewer.show({
                title: $t`Group Management`,
                item: 'AppGroups',
                container: createTmpDom(),
              })
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
        },
      }
    }

    getGroupFunc(mode: string): GroupFunc {
      const groupModes = this.getGroupModeItems()
      const groupMode = groupModes[mode]
      if ('func' in groupMode) {
        return groupMode.func
      } else {
        return (items: UnitPersist[], options: {
          foldupAll?: boolean
          foldupSome?: string[]
          parentLayout?: string
        }) => {
          const { foldupAll, foldupSome, parentLayout } = options
          const groups: { [key: string]: UnitPersist } = {}
          const extraInfo = Item.getSubRequirementByParentLayout(parentLayout)
          groupMode.conditions.push({name:'Others', condition: "*"})
          for (const condition of groupMode.conditions) {
            groups[condition.name] = {
              ky: mkid(),
              layout: 'item-group',
              $crumbsContext: 'result',
              $readonly: true,
              $isTmp: true,
              foldup: foldupAll,
              icon: 'svg_arrow_down',
              subitems: [],
              ori: condition.name,
            } as any
            condition.logic = $.traits.createLogic(condition.condition)
            Object.assign(groups[condition.name], extraInfo)
          }
          for (const item of items) {
            for (const condition of groupMode.conditions) {
              if (condition.logic!.exec(item)) {
                (groups[condition.name].subitems! as UnitPersist[]).push(item)
                break
              }
            }
          }
          return Object.values(groups).filter(e=>notEmpty(e.subitems))
        }
      }
    }

    defaultGroupModes: { [ky: string]: CustomizedGroupMode } = {
      'none': {
        title: 'No Group',
        icon: 'svg_dot',
        layout: 'result-nogroup',
        func: (items, _) => items
      },
      'topic': {
        title: 'By Topic',
        icon: 'svg_dot',
        layout: 'result',
        func: Item.groupItemsByTopic.bind(Item),
      }
    }

    getGroupModeItems() {
      const items = Object.values($.dbMemory.indexed.pky[APP_GROUPS_KY] ?? {})
      const groupModes = this.defaultGroupModes
      for (const item of items) {
        for (const leaf of item.leaves) {
          if ($.codeblock.verify(leaf) && leaf.mode === 'javascript') {
            try {
              const fn = new Function(`try{return ${leaf.value}}catch(e){return undefined}`)
              const one = {
                icon: 'svg_dot',
                layout: 'result',
                id: leaf.iky,
              }
              const val = fn()
              if (!val) throw new Error('Invalid function')
              if (!val.title || !val.conditions) throw new Error('Missing title or conditions')
              groupModes[leaf.iky] = Object.assign(one, val)
            } catch (e) {
              console.warn('Invalid group mode function', e, leaf.value)
            }
          }
        }
      }
      return groupModes
    }

    addonRun() {
      $.topic?.createTopic('App/Groups', { ky: APP_GROUPS_KY })
    }
  }

  const grouphelper = new GroupHelper()

  return { grouphelper }
}
