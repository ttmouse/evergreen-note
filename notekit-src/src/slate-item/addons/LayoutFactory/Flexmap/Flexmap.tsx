import React from 'react'
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { cover } from '../../../engine/helper'
import { Item, ItemEntry } from '../../../interfaces/item'
import { Path, Transforms } from '../../../slate.inc'
import { ItemTransforms } from '../../../transforms/item'
import { pub } from '../../../utils/pub'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { BodyWithHelperTitle } from './BodyWithHelperTitle'
import './flexmap.layout.less'
import { checkCaret } from '../../EventHandler/checkCaret'
import { $$ } from '../../../utils/lang'
import { $t } from '../../../../i18n'

/**
 * Mindmap
 */

export function createFlexmapAddon({ app, $ }: NewAddonParams) {
  class Flexmap implements IAddon {
    app!: App
    config = {}

    addSlashItems() {
      const { slashMenu } = this.app.addons
      slashMenu?.addItems({
        slashMindmap: {
          icon: 'svg_mindmap',
          title: $t`flexmap.slash_menu_title`,
          order: slashMenu.order.layout,
          versions: {
            en: { v: 'as mindmap' },
            pingyin: { v: 'si wei dao tu' },
            py: { v: 'swdt' },
            cn: { v: '思维导图' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, '')
            $.layoutFactory.applies('flexmap', editor)
          },
        },
      })
    }

    /**
     * 修改 enter 键的行为
     * 当换行时, 若鼠标位于思维导图节点的文本末尾, 则创建同级节点
     */
    mofidyHotkey() {
      $.hotkey?.register(
        {
          flexmapInsertBelow: {
            hotkey: 'enter',
            title: $$`Insert below`,
            modified: true,
            handle({ editor }) {
              const isCaret = checkCaret(editor)
              const sel = editor.itemSelection()
              if (
                sel?.anchor.itemDom.matches('[ctx-layout="flexmap"]') &&
                !isCaret.atEmptyText() &&
                isCaret.atTextEnd()
              ) {
                const at = sel.anchor.path
                ItemTransforms.insertNextItems(editor, { at })
                editor.itemFocus(editor.itemPathNext(at)!)
                return false
              }
              return true
            },
          },
        },
        'flexmap'
      )
    }

    insertSubitemsIfNeeded(editor: ItemEditor, mindmapPath: Path) {
      if (editor.itemCountSubitems(mindmapPath) < 1) {
        if (editor.itemTextPlain().length < 1) {
          editor.itemFocus(mindmapPath)
          editor.insertText($t`flexmap.untitled`)
          Transforms.select(editor, editor.itemPathText())
        }
        ItemTransforms.insertItems(editor, {
          at: mindmapPath,
          items: Item.make({ ori: '' }, { editor }),
        })
        ItemTransforms.insertItems(editor, {
          at: mindmapPath,
          items: Item.make({ ori: '' }, { editor }),
          pos: -1,
        })
      }
    }

    addonBeforeRun() {
      $.layoutFactory?.registerLayouts({
        flexmap: {
          title: $t`flexmap.item_menu_title`,
          icon: 'svg_mindmap',
          onClick() {
            $.layoutFactory?.handleFloatMenu('flexmap')
          },
        },
      })
    }

    addonRun() {
      // Initialization for this addon LayoutFlexmap
      const { editorView, flexmap } = this.app.addons

      pub.on(
        pub.evt.editorNormalized,
        (editor: ItemEditor, entry: ItemEntry) => {
          const [item, path] = entry
          if (item.layout === 'flexmap') {
            flexmap.insertSubitemsIfNeeded(editor, path)
            return
          }
          return true
        }
      )

      // Add a helper title for flexmap
      const { renderElement } = editorView
      cover(renderElement, (props) => {
        const { element, children } = props

        let newChildren = children
        if (element.type === Item.partTypes.body) {
          newChildren = <BodyWithHelperTitle>{children}</BodyWithHelperTitle>
        }
        return renderElement.call(editorView, {
          ...props,
          children: newChildren,
        })
      })

      this.mofidyHotkey()
      this.addSlashItems()
    }
  }

  return { flexmap: new Flexmap() }
}
