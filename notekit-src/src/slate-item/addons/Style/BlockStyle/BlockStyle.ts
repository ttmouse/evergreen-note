/* eslint-disable @typescript-eslint/no-unused-vars */
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { Item, ItemNode } from '../../../interfaces/item'
import { APP_STYLE_KY } from '../Style'
import { sty } from '../../../styles/atom'
import { colorBase } from '../../../styles'
import { isEmpty } from '../../../utils/isEmpty'
import { UnitProps } from '../../../interfaces/unit'
import { Logic, LogicString } from '../../Traits/Logic'
import { StyleLogic } from './StyleLogic'
import { pub } from '../../../utils/pub/pub'
import { ElementComponentProps } from '../../EditorView/EditorView'
import { after, cover } from '../../../engine/helper'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { ItemTransforms } from '../../../transforms/item'
import { recur } from '../../../utils/recur'
import { Path, Text, Location } from '../../../slate.inc'
import { CodeblockElement } from '../../Codeblock/Codeblock'
import { deepClone } from '../../../utils/object/deepClone'
import { showSnack } from '../../../utils/msg/showSnack'
import { createBlockStyleConditionAddon } from '../BlockStyleCondition/BlockStyleCondition'
import { BlockStyleLogic } from './BlockStyleLogic'
import { $t } from '../../../../i18n'
import { LoadedAddonName } from '@/main'

export const APP_BLOCKSTYLE_KY = 'AppBlockStyles'

const demoBlockStyle = sty`/* Create a block style named "demo" */
.node[block-style~='demo'] {
  outline: 1px solid ${[colorBase.red, 500]};
  border-radius: 4px;
}`

export type ItemWithBlockStyle = UnitPersist & {
  blockStyle?: {
    styles: string[] // 普通笔记所应用的块样式
    condition?: LogicString // 定义 BlockStyle 的自动应用条件
  }
}

type BlockStyles = { [styleName: string]: boolean }

function unitPersistToMenu(
  item: UnitPersist,
  callback: (one: UnitPersist) => Partial<UnitProps>
) {
  return {
    ...callback(item),
    ky: item.ky,
    pky: item.pky,
    subitems: (item.subitems as any)
      ?.map((one: any) => unitPersistToMenu(one, callback))
      .filter((one: any) => !isEmpty(one)),
  }
}

export function createBlockStyleAddon(params: NewAddonParams) {
  const { app, $ } = params
  class BlockStyle implements IAddon {
    app!: App
    config = {}
    styles = {}

    /**
     * 从CSS代码中提取自定义样式的名称
     * @param lessCss
     * @returns
     */
    extractStyleName(item: ItemWithBlockStyle): string | null {
      const cb = item.leaves?.find(
        (leaf) => $.codeblock.verify(leaf) && leaf.mode === 'css'
      ) as CodeblockElement
      if (cb) {
        const match = /\[\s*block-style\s*\S?=\s*['"](.+?)['"]\s*\]/i.exec(
          cb.value.trim()
        )
        if (match) {
          return match[1]
        }
      }
      return null
    }

    getMenu() {
      const blockStyleItem = $.dbMemory.getItem(APP_BLOCKSTYLE_KY, {
        isRecur: true,
      })
      const menu = unitPersistToMenu(blockStyleItem, (one): any => {
        const styleName = $.blockStyle.extractStyleName(one as any)
        const cb = one.leaves?.find(
          (leaf) => $.codeblock.verify(leaf) && leaf.mode === 'css'
        ) as CodeblockElement
        if (styleName) {
          const title = (one.leaves[0] as Text).text
          const result = {
            title,
            icon: 'svg_dot',
            onMouseDown() {
              if (!$.style.isInstalled(one.ky)) {
                $.dialog.show({
                  title: $t`blockStyle.install_dialog_title`,
                  body: $t('blockStyle.install_dialog_body', {
                    styleName: title,
                  }),
                  buttons: {
                    [$t`blockStyle.install_button`]: () => {
                      $.style.install(one.ky)
                      showSnack(
                        $t(`blockStyle.install_success`, { styleName: title })
                      )
                    },
                    [$t`common.cancel`]: null,
                  },
                })
              }
              const { editor, item } = $.floatMenu.getContext()
              $.blockStyle.setStyle(editor, item, styleName)
            },
            extra: [
              {
                title: $t`blockStyle.clear`,
                icon: 'svg_clear',
                cond() {
                  const { item, editor } = $.floatMenu.getContext()
                  const theItem = $.dbMemory.getItem(item.ky)
                  return $.blockStyle.hasStyle(theItem, styleName)
                },
                onMouseDown(e: MouseEvent) {
                  e.stopPropagation()
                  const { item, editor } = $.floatMenu.getContext()
                  $.blockStyle.unsetStyle(editor, item, styleName)
                },
              },
            ],
          }
          return result
        }
        return {
          title: Item.headString(one),
          icon: 'svg_dot',
        }
      })
      return menu
    }

    toggleStyle(editor: ItemEditor, item: ItemNode | Path, styleName: string) {
      const theItem = editor.item(item)
      if ($.blockStyle.hasStyle(theItem, styleName)) {
        $.blockStyle.unsetStyle(editor, theItem, styleName)
      } else {
        $.blockStyle.setStyle(editor, theItem, styleName)
      }
    }

    setStyle(editor: ItemEditor, item: ItemNode | Path, styleName: string) {
      if (Path.isPath(item)) {
        item = editor.item(item)
      }
      const data = item.blockStyle ? deepClone(item.blockStyle) : {}
      data.styles ??= []

      const splited = styleName.split('_')
      if (splited.length > 1) {
        data.styles = data.styles.filter(
          (one: string) => !one.startsWith(`${splited[0]}_`)
        )
      }

      data.styles.push(styleName)
      data.styles = Array.from(new Set(data.styles))
      ItemTransforms.setItems(editor, {
        at: item.GetSlPath(),
        props: { blockStyle: data },
      })
    }

    unsetStyle(editor: ItemEditor, item: ItemNode, styleName: string) {
      const blockStyle = item.blockStyle
        ? deepClone(item.blockStyle)
        : { styles: [] }
      blockStyle.styles = blockStyle.styles?.filter(
        (one: string) => one !== styleName
      )

      ItemTransforms.setItems(editor, {
        at: item.GetSlPath(),
        props: { blockStyle },
      })
    }

    hasStyle(item: UnitPersist, styles: string | string[]): boolean {
      if (!Array.isArray(styles)) {
        styles = [styles]
      }

      return styles.some((styleName) =>
        item.blockStyle?.styles?.some(
          (one) => one === styleName || one.startsWith(`${styleName}_`)
        )
      )
    }

    getBacklinkItems(ky: string) {
      const blockStyleItem = $.dbMemory.getItem(ky) as ItemWithBlockStyle
      let logic = ''
      const styleName = $.blockStyle.extractStyleName(blockStyleItem)
      if (styleName) {
        logic = `style(${styleName})`
      }
      if (blockStyleItem.blockStyle?.condition) {
        logic = `${logic} OR (${blockStyleItem.blockStyle.condition})`
      }
      if (logic.length > 0) {
        return $.search.findAll(logic, {
          isRecur: true,
        })
      }
      return []
    }

    wrap(
      editor: ItemEditor,
      styleName: string | string[],
      options: {
        at: Location
        data?: Partial<UnitPersist>
      }
    ) {
      const { at, data = {} } = options
      const styles = Array.isArray(styleName) ? styleName : [styleName]
      ItemTransforms.wrapItems(editor, {
        at,
        props: {
          ori: '',
          ...data,
          blockStyle: {
            styles,
          },
        },
      })
    }

    addonInfo() {
      return {
        title: $t`blockStyle.title`,
        quote: $t`blockStyle.quote`,
        type: 'fieldset',
        defaultValue: 'off',
        depend: ['style'] as LoadedAddonName[],
      }
    }

    addonBeforeRun() {
      Logic.register({
        style: StyleLogic,
        'block-style': BlockStyleLogic,
      })
    }

    addonRun() {
      if (!$.dbMemory.itemExist(APP_BLOCKSTYLE_KY)) {
        $.dbMemory.saveItem(
          Item.newItem({
            ky: APP_BLOCKSTYLE_KY,
            pky: APP_STYLE_KY,
            leaves: [{ text: 'Block styles' }],
            subitems: [
              {
                ky: `${APP_BLOCKSTYLE_KY}-1st`,
                pky: APP_BLOCKSTYLE_KY,
                leaves: [
                  { text: 'Demo' },
                  $.codeblock.createElement({
                    mode: 'css',
                    langName: 'CSS',
                    value: demoBlockStyle,
                    lineNumbers: true,
                  }),
                  { text: '' },
                ],
              },
            ],
          }),
          { isRecur: true }
        )
      } else {
        const menu = $.blockStyle.getMenu()
        $.floatMenu.addItems({
          blockStyle: {
            ...menu,
            order: 7000,
            title: $t`blockStyle.title`,
            icon: 'svg_block_style',
          },
        })
      }

      after($.backlink.getLinkedItems, (items, ky) => {
        return [...items, ...$.blockStyle.getBacklinkItems(ky)]
      })

      // after($.refer.getCount, (count, ky) => {
      //   const item = $.dbMemory.getItem(ky);
      //   if (item.path?.includes(APP_BLOCKSTYLE_KY)) {
      //     return count + $.blockStyle.getBacklinkItems(ky).length;
      //   }
      //   return count;
      // });

      $.topic.lockHead((props) => props.item?.ky === APP_BLOCKSTYLE_KY)

      const { renderElement } = $.editorView
      cover(renderElement, (props: ElementComponentProps<any>) => {
        if (props.element.type === Item.partTypes.outer) {
          if (Array.isArray(props.element.blockStyle?.styles)) {
            ;(props.attributes as any)['block-style'] =
              props.element.blockStyle.styles.join(' ')
          }
        }
        return renderElement.call($.editorView, props)
      })

      $.snippet?.allowTitleField('blockStyle')
    }
  }

  return {
    blockStyle: new BlockStyle(),
    ...createBlockStyleConditionAddon(params),
  }
}
