import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Path, Location } from '../../slate.inc'
import { $$ } from '../../utils/lang'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import './item-headless.less'

export function createItemHeadlessAddon({ app, $ }: NewAddonParams) {
  class ItemHeadless implements IAddon {
    app!: App
    config = {}

    transform(editor: ItemEditor, at: Path) {
      $.blockStyle.setStyle(editor, at, 'headless')
    }

    wrapCol(editor: ItemEditor, at: Location) {
      $.blockStyle.wrap(editor, 'headless_col', { at })
    }

    wrapRow(editor: ItemEditor, at: Location) {
      $.blockStyle.wrap(editor, 'headless_row', { at })
    }

    addonRun() {
      $.hotkey?.register({
        indentHeadless: {
          modified: true,
          hotkey: 'tab',
          title: $$`Indent headless`,
          handle({ editor }) {
            if (editor.itemSelection()?.isMulti) {
              return true
            }
            const parentItem = editor.itemParent()
            const parentPath = editor.itemPathParent()
            const index = editor.itemIndex()
            if (
              index === 0 &&
              $.blockStyle.hasStyle(parentItem, 'headless_col')
            ) {
              editor.itemIndent(parentPath)
              return false
            }
            return true
          },
        },
      })

      // $.floatMenu.addItems({
      //   headless: {
      //     title: $$`Headless column`,
      //     icon: 'svg_dot',
      //     onClick: () => {
      //       const { editor, item } = $.floatMenu.getContext();
      //       $.itemHeadless.wrapCol(editor, item.GetSlPath());
      //     },
      //   },

      //   multiColumns: {
      //     title: $$`Headless row`,
      //     icon: 'svg_kanban',
      //     onClick: () => {
      //       const { editor, item } = $.floatMenu.getContext();
      //       $.itemHeadless.wrapRow(editor, item.GetSlPath());
      //     },
      //   },
      // });
    }
  }

  return { itemHeadless: new ItemHeadless() }
}
