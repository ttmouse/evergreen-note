import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { ItemNode } from '../../../interfaces/item'
import { ItemTransforms } from '../../../transforms/item'
import { deepClone } from '../../../utils/object/deepClone'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { LogicString } from '../../Traits/Logic'
import { BlockStyleConfIcon } from './BlockStyleConfIcon'
import { APP_BLOCKSTYLE_KY, ItemWithBlockStyle } from '../BlockStyle/BlockStyle'
import { isEmpty } from '../../../utils/isEmpty'
import { pub } from '../../../utils/pub/pub'
import { atLater } from '../../../utils/atLater'
import { $$ } from '../../../utils/lang'
import { SnapProps } from '../../../utils/msg/showDialog'
import { after } from '../../../engine/helper'
import { $t } from '../../../../i18n'

/**
 * 条件样式
 * @param param0
 * @returns
 */
export function createBlockStyleConditionAddon({ app, $ }: NewAddonParams) {
  class BlockStyleCondition implements IAddon {
    app!: App
    config = {}

    save(editor: ItemEditor, item: ItemNode, condition: LogicString) {
      const blockStyle = item.blockStyle ? deepClone(item.blockStyle) : {}
      blockStyle.condition = condition
      ItemTransforms.setItems(editor, {
        at: item.GetSlPath(),
        props: { blockStyle },
      })
    }

    showForm(params: { item: ItemNode; SnapProps: SnapProps }) {
      const { item, SnapProps: snap } = params
      $.form.popup({
        title: $t`blockStyle.form_title`,
        initialValues: {
          condition: item.blockStyle?.condition ?? '',
        },
        subitems: {
          condition: {
            type: 'logicString',
            autoFocus: true,
            focused: true,
            title: $t`blockStyle.condition`,
            quote: $t`blockStyle.condition_quote`,
          },
        },
        buttons: {
          [$t`common.done`]: (values) => {
            $.blockStyleCondition.save(
              item.GetEditor(),
              item,
              values.condition as string
            )
          },
          [$t`common.cancel`]: null,
        },
        SnapProps: snap,
      })
    }

    getBlockItems(): ItemWithBlockStyle[] {
      const items = $.dbMemory.getItemsByIndex('path', APP_BLOCKSTYLE_KY)
      return (items as any).filter(
        (item) => !isEmpty(item.blockStyle?.condition)
      )
    }

    listen() {
      const conditions: { [styleName: string]: LogicString } = {}
      for (const item of $.blockStyleCondition.getBlockItems()) {
        const styleName = $.blockStyle.extractStyleName(item)
        if (styleName) {
          ;(conditions as any)[styleName] = item.blockStyle?.condition
        }
      }

      const handle = (item: ItemNode) => {
        atLater(
          () => {
            const itemDom = document.getElementById(item.$id) as HTMLElement
            if (!itemDom) {
              return
            }
            const styles = new Set(
              (itemDom.getAttribute('block-style') ?? '').split(/\s+/)
            )
            for (const [styleName, condition] of Object.entries(conditions)) {
              if (condition && $.traits.match(condition, item)) {
                styles.add(styleName)
              } else if (!item.blockStyle?.styles?.includes(styleName)) {
                styles.delete(styleName)
              }
            }
            const newStyles = Array.from(styles).join(' ')
            itemDom.setAttribute('block-style', newStyles)
          },
          `blockStyleCondition-${item.$id}`,
          300
        )
      }

      pub.on(pub.evt.editorNormalized, (editor, entry) => {
        const [item] = entry
        handle(item)
      })

      pub.on(pub.evt.editorItemMounted, ({ item }) => {
        handle(item)
      })
    }

    addonRun() {
      $.editorView.addExtraItems({ BlockStyleConfIcon })
      $.blockStyleCondition.listen()
    }
  }

  return { blockStyleCondition: new BlockStyleCondition() }
}
