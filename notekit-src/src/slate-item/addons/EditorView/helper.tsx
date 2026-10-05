import { ItemDOM } from '../../components/ItemView'
import { ItemNode } from '../../interfaces/item'
import { UnitProps } from '../../interfaces/unit'
import {
  Editor,
  Path,
  Text,
  Range,
  Node as SlNode,
  ReactEditor,
  Transforms,
} from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { nodeString } from '../../utils/string/nodeString'
import { pub } from '../../utils/pub'

export type HtmlEle = EventTarget | Element | HTMLElement

export function domToItem(dom: HtmlEle): ItemNode | null {
  const itemDom = (dom as HTMLElement).closest('.node') as ItemDOM
  return itemDom?.$item
}

export function domToEditor(dom: HtmlEle): ItemEditor | null {
  const itemDom = (dom as HTMLElement).closest('.node') as ItemDOM
  return itemDom?.$editor
}

export function getRangeTextData(editor: ItemEditor, range: Range): SlNode[] {
  const fragment: SlNode[] = []
  const [start, end] = Range.edges(range)
  for (const [node, path] of Editor.nodes(editor, {
    at: range,
    match: (n: SlNode) => Text.isText(n) || editor.isInline(n),
  })) {
    if (Text.isText(node) && editor.isInline(SlNode.parent(editor, path))) {
      continue
    }
    if (Path.equals(end.path, path)) {
      let pos = 0
      if (Path.equals(start.path, end.path)) {
        pos = start.offset
      }
      fragment.push({
        ...node,
        text: (node as Text).text.slice(pos, end.offset),
      })
    } else if (Path.equals(start.path, path)) {
      fragment.push({
        ...node,
        text: (node as Text).text.slice(start.offset),
      })
    } else {
      fragment.push(node as Text)
    }
  }
  return fragment
}

export function getRangeText(editor: ItemEditor, range: Range): string {
  const fragment: Text[] = []
  for (const [node, path] of Editor.nodes(editor, {
    at: range,
    match: (n: SlNode) => Text.isText(n) || editor.isInline(n),
  })) {
    if (editor.isInline(node as any)) {
      continue
    }
    if (Path.equals(range.focus.path, path)) {
      fragment.push({
        ...node,
        text: (node as Text).text.slice(0, range.focus.offset),
      })
    } else {
      fragment.push(node as Text)
    }
  }
  return fragment.map((text) => SlNode.string(text)).join('')
}

export function obj2list(
  obj: any,
  mapFunc = (v: any, k: string) => v,
  parentKey?: string
) {
  const list: any[] = []
  for (const [k, v] of Object.entries<UnitProps>(obj)) {
    const key = parentKey ? `${parentKey}-${k}` : k
    if (/^[0-9]+$/.test(String(k)) === false) {
      Object.assign(v, {
        id: key,
        key,
        name: key,
      })
    }

    if (isEmpty(v)) {
      continue
    }
    if (v.body && !Array.isArray(v.body)) {
      v.body = obj2list(v.body, mapFunc, key)
      v.subitems = v.body
    }
    if (v.subitems && !Array.isArray(v.subiems)) {
      v.subitems = obj2list(v.subitems, mapFunc, key)
      v.body = v.subitems
    }
    if (v.extra) {
      v.extra = obj2list(v.extra, mapFunc, `${key}-extra`)
    }
    if (v.foot) {
      v.foot = obj2list(v.foot, mapFunc, `${key}-foot`)
    }

    list.push({ ...mapFunc(v, k) })
  }
  return list as UnitProps[]
}

export function domSelect(editor: ItemEditor, dom: HTMLElement) {
  const node = ReactEditor.toSlateNode(editor as any, dom)
  const path = ReactEditor.findPath(editor as any, node)
  Transforms.select(editor, path)
}

export function getInnerEditor(domContainer: HTMLElement) {
  const { $editor } = domContainer.querySelector('.node-top') as ItemDOM
  return $editor
}

export function findRangeFromDomPoint(
  editor: ReactEditor,
  target: HTMLElement,
  x: number,
  y: number
): Range {
  if (x == null || y == null) {
    throw new Error(`Cannot resolve a Slate range from a DOM event`)
  }

  const node = ReactEditor.toSlateNode(editor, target)
  const path = ReactEditor.findPath(editor, node)

  // If the drop target is inside a void node, move it into either the
  // next or previous node, depending on which side the `x` and `y`
  // coordinates are closest to.
  if (Editor.isVoid(editor, node)) {
    const rect = target.getBoundingClientRect()
    const isPrev = editor.isInline(node)
      ? x - rect.left < rect.left + rect.width - x
      : y - rect.top < rect.top + rect.height - y

    const edge = Editor.point(editor, path, {
      edge: isPrev ? 'start' : 'end',
    })
    const point = isPrev
      ? Editor.before(editor, edge)
      : Editor.after(editor, edge)

    if (point) {
      const range = Editor.range(editor, point)
      return range
    }
  }

  // Else resolve a range from the caret position where the drop occured.
  let domRange
  const { document } = ReactEditor.getWindow(editor)

  // COMPAT: In Firefox, `caretRangeFromPoint` doesn't exist. (2016/07/25)
  if (document.caretRangeFromPoint) {
    domRange = document.caretRangeFromPoint(x, y)
  } else {
    const position = (document as any).caretPositionFromPoint(x, y)

    if (position) {
      domRange = document.createRange()
      domRange.setStart(position.offsetNode, position.offset)
      domRange.setEnd(position.offsetNode, position.offset)
    }
  }

  if (!domRange) {
    throw new Error(`Cannot resolve a Slate range from a DOM event`)
  }

  // Resolve a Slate range from the DOM range.
  const range = ReactEditor.toSlateRange(editor, domRange, {
    exactMatch: false,
    suppressThrow: false,
  })
  return range
}

let lastTextActive: ItemDOM | null = null
let lastQuoteActive: ItemDOM | null = null

// 给光标所在的 item 添加 node-active CSS类，以便做一些样式处理
export const handleItemFocus = (e: Event) => {
  const sel = window.getSelection()
  const el = sel?.anchorNode?.parentElement as HTMLElement
  if (el?.matches('.node-text *')) {
    lastQuoteActive?.closest('.node')?.classList.remove('node-quote-active')
    lastQuoteActive = null
    const active = el.closest('.node') as ItemDOM
    if (active !== lastTextActive) {
      if (lastTextActive) {
        lastTextActive.classList.remove('node-active')
        const { $editor: ed, $item: it } = lastTextActive
        pub.emit(pub.evt.itemBlur, {
          editor: ed,
          item: it,
          itemDom: lastTextActive,
        })
        lastTextActive = null
      }
      active.classList.add('node-active')
      const { $editor, $item } = active
      pub.emit(pub.evt.itemFocus, { editor: $editor, item: $item })
      lastTextActive = active
    }
  } else if (el?.matches('.node-quote *')) {
    lastTextActive?.classList.remove('node-active')
    lastTextActive = null
    const active = el.closest('.node-quote') as ItemDOM
    if (active !== lastQuoteActive) {
      if (lastQuoteActive) {
        const itemDom = lastQuoteActive.closest('.node') as ItemDOM
        itemDom.classList.remove('node-quote-active')
        const { $editor: ed, $item: it } = itemDom
        pub.emit(pub.evt.itemQuoteBlur, { editor: ed, item: it, itemDom })
        lastQuoteActive = null
      }
      const { $editor, $item } = active
      active.closest('.node')?.classList.add('node-quote-active')
      pub.emit(pub.evt.itemQuoteFocus, { editor: $editor, item: $item })
      lastQuoteActive = active
    }
  }
}

export function getActiveEditor() {
  const sel = window.getSelection()
  if (!sel) {
    return null
  }
  const itemDom = sel.anchorNode?.parentElement?.closest('.note-block') as ItemDOM
  return itemDom?.$editor
}
