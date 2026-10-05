import { Editor, Range, Text } from '@/slate-item/slate.inc'
import { ItemEditor } from './ItemEditor'

export function getRangeText(
  editor: ItemEditor,
  theRange?: Range
): string | null {
  theRange ??= editor.selection as any
  if (!theRange) {
    return null
  }

  const rangeText = []

  // Iterate through the selected nodes
  for (const [node, path] of Editor.nodes(editor, { at: theRange })) {
    if (Text.isText(node)) {
      // Extract the text from the selected range
      const range = Editor.range(editor, path)
      const overlap = Range.intersection(theRange, range)
      if (overlap) {
        const start = overlap.anchor.offset
        const end = overlap.focus.offset
        const text = node.text.slice(start, end)
        rangeText.push(text)
      }
    }
  }

  // Join the selected text
  return rangeText.join('')
}
