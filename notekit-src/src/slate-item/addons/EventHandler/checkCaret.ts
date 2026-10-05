import { ItemEditor, Item } from '../..'
import { Editor, Range, Node, Path } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { getRangeText } from '../EditorView/helper'

export const checkCaret = (editor: ItemEditor) => {
  const a = () => editor.itemSelection()
  const s = () => editor.selection as Range
  const is = {
    at: (params: { selector?: string }) => {
      const { selector } = params
      if (selector) {
        return a().anchor.itemDom.matches(selector)
      }
      return false
    },
    collapsed: () => s() && Range.isCollapsed(s()),
    atEmptyText: () => {
      return (
        editor.itemTextPlain(a().anchor.path).length < 1 &&
        Array.from(Node.children(editor, editor.itemPathText())).length === 1
      )
    },
    atTextEnd: () => {
      const { item } = a().anchor
      const totalStr = Item.headString(item)
      const leaves = editor.itemLeaves()
      const rangeStr = getRangeText(editor, {
        anchor: {
          path: editor.itemPathText().concat(0),
          offset: 0,
        },
        focus: s().focus,
      })

      return (
        (!isEmpty(Node.string(leaves[0])) || leaves.length > 1) &&
        (Editor.isEnd(editor, s().focus, editor.itemPathText()) ||
          rangeStr.length === totalStr.length)
      )
    },
    atTextBegin: () =>
      !is.atEmptyText() &&
      // Range.start(s()).offset < 1 &&
      Editor.isStart(editor, Range.start(s()), editor.itemPathText()) &&
      Range.isCollapsed(s()),
    atTitle: () => a().anchor.path.length < 2,
    atDocFirstItem: () => a().anchor.path.join(',') === '0,1,0,0',
    atQuote: () =>
      s() &&
      Path.isAncestor(editor.itemPathQuote(s().anchor.path), s().anchor.path),
  }
  return is
}
