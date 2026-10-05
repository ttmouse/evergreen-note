import { App, NewAddonParams } from '../../../engine/App'
import { Item, ItemEntry } from '../../../interfaces/item'
import { ItemTransforms } from '../../../transforms/item'
import { pub } from '../../../utils/pub'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import './kanban.layout.less'
import { mkid } from '../../../utils/string/mkid'
import { IAddonLayout } from '../LayoutFactory'
import { $$ } from '../../../utils/lang'
import { Path, Transforms } from '../../../slate.inc'
import { $t } from '../../../../i18n'

export function createKanbanAddon({ app, $ }: NewAddonParams) {
  class Kanban implements IAddonLayout {
    app!: App
    config = {}

    levelNames = { kanban: ['kanban', 'kanban-column', 'kanban-item'] }

    insertSubitemsIfNeeded(editor: ItemEditor, kanbanPath: Path) {
      if (editor.itemCountSubitems(kanbanPath) < 1) {
        if (editor.itemTextPlain().length < 1) {
          editor.itemFocus(kanbanPath)
          editor.insertText($t`kanban.untitled`)
          Transforms.select(editor as any, editor.itemPathText())
        }
        const ky1 = mkid()
        ItemTransforms.insertItems(editor, {
          at: kanbanPath,
          items: Item.make(
            {
              ori: '',
              placeholder: $t(`kanban.column_placeholder`, { order: 1 }),
              ky: ky1,
              subitems: [
                { pky: ky1, weight: 5000, placeholder: $$`item 1`, ori: '' },
              ],
            },
            { editor }
          ),
        })
        const ky2 = mkid()
        ItemTransforms.insertItems(editor, {
          at: kanbanPath,
          items: Item.make(
            {
              ori: '',
              placeholder: $t(`kanban.column_placeholder`, { order: 2 }),
              ky: ky2,
              subitems: [
                { pky: ky2, weight: 5000, placeholder: $$`item 1`, ori: '' },
              ],
            },
            { editor }
          ),
          pos: -1,
        })
      }
    }

    addonBeforeRun() {
      $.layoutFactory?.registerLayouts({
        kanban: {
          title: $t`kanban.item_menu_title`,
          icon: 'svg_kanban',
        },
      })
    }

    addonRun() {
      // Initialization for this the addon LayoutKanban

      $.slashMenu?.addItems({
        slashKanban: {
          icon: 'svg_kanban',
          title: $t`kanban.slash_menu_title`,
          order: $.slashMenu.order.layout,
          versions: {
            en: { v: 'as kanban' },
            pingyin: { v: 'kanban' },
            py: { v: 'kb' },
            cn: { v: '看板' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, '')
            $.layoutFactory.applies('kanban', editor)
          },
        },
      })

      $.eventHandler?.addEnterIndentRule(
        ({ editor, path }) => editor.itemParent(path).layout === 'kanban'
      )

      // 暂时不插入子节点以配合模板功能
      // pub.on(
      //   pub.evt.editorNormalized,
      //   (editor: ItemEditor, entry: ItemEntry) => {
      //     const [item, path] = entry
      //     if (item.layout === 'kanban') {
      //       $.kanban.insertSubitemsIfNeeded(editor, path)
      //       return
      //     }
      //     return true
      //   }
      // )
    }
  }

  return { kanban: new Kanban() }
}
