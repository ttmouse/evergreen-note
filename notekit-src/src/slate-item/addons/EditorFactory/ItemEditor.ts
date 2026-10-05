import { App } from '../../engine/App'
import {
  BaseEditor,
  Descendant,
  Editor,
  Element,
  ElementEntry,
  ExtendedType,
  Location,
  Node,
  NodeEntry,
  Operation,
  Path,
  Point,
  Range,
  Text,
  Transforms,
  ReactEditor,
  apply as slateApply,
  addMark,
  removeMark,
  getDirtyPaths,
  range,
  start,
  end,
  point,
  hasInlines,
  string,
  nodes,
  path,
  node,
  hasPath,
  deselect,
  getVoid,
  select,
  above,
  pathRefs,
  levels,
  pointRefs,
  rangeRefs,
  unhangRange,
  withoutNormalizing,
  setSelection,
  isNormalizing,
  normalize,
  setNormalizing,
  elementReadOnly,
  setNodes,
  isBlock,
  isStart,
  insertFragment,
  isEnd,
  after,
  before,
  collapse,
  deleteText,
  edges,
  first,
  fragment,
  marks,
  isEmpty as slateIsEmpty,
  hasBlocks,
  hasTexts,
  insertNodes,
  isEdge,
  last,
  leaf,
  liftNodes,
  mergeNodes,
  moveNodes,
  move,
  next,
  parent,
  pathRef,
  pointRef,
  positions,
  previous,
  rangeRef,
  removeNodes,
  setPoint,
  splitNodes,
  unsetNodes,
  unwrapNodes,
  wrapNodes,
  shouldMergeNodesRemovePrevNode,
  shouldNormalize,
  EditorFragmentDeletionOptions,
  normalizeNode,
} from '../../slate.inc'
import { omit } from '../../utils/object/omit'
// By @Hardy
// 用我修改过的 general.ts 代替原来的 general.ts
import {
  Item,
  ItemEntry,
  ItemId,
  ItemNode,
  ItemTransforms,
  rangeToArray,
  ItemPartElement,
  KyString,
  UNIT_STATUS,
} from '../..'
import { isEmpty } from '../../utils/isEmpty'
import { getRangeText } from '../EditorView/helper'
import { pub } from '../../utils/pub'
import { time } from '../../utils/date/time'
import { invoke } from '../../engine/helper'
import { ItemDOM } from '../../components/ItemView'
import { atLater } from '../../utils/atLater'
import { nodeString } from '../../utils/string/nodeString'
import { trim } from '../../utils/string/trim'
import { nanoid } from '../../utils/string/mkid'

export const PART_POS = {
  head: 0,
  text: 0,
  quote: 1,
  body: 1,
  subitems: 0,
} as const

/**
 * The things by which we can find an item in the editor
 * NOTICE:
 * By `Range` or `ItemRange`,
 * we'll only pick out the anchor point to find the item,
 * and the focus point will be ignored.
 *
 * One more thing:
 * If you let an ItemReference value to be undefined,
 * in the methods of `editor` object,
 * the current selection will be untilized as ItemReference
 */
export type ItemReference =
  | Location
  | ItemNode
  | ItemId
  | ElementEntry
  | ItemRange
  | undefined

/**
 * An ItemSet represents a set of items
 * To which we can apply a sery of operations.
 * If it is undefined, it will utilize the value of selection
 */
export type ItemSet = ItemNode[] | ItemReference

export type TransformMethod = (
  editor: ItemEditor,
  props: { at: Path; [k: string]: any }
) => void

export interface BaseItemEditor extends BaseEditor {
  // Name all of the functions with the prefix 'item...'
  // so that we can see all item functions when we type 'editor.item'
  // VSCode will show us all of these functions.
  // And furthermore, we use this prefix to avoid the naming collisions from others Slate plugins
  editorId: string

  app(): App

  findPath(node: Node): Path | null

  itemCreate(item: Partial<ItemNode>): ItemNode
  itemInsert(items?: ItemSet, atItem?: ItemReference): void

  itemRemove(items?: ItemSet): void
  itemIndent(items?: ItemSet): void
  itemOutdent(items?: ItemSet): void
  itemSetProps(props: Partial<ItemNode>, item?: ItemReference): void
  itemSelect(items?: ItemSet): void
  itemFocus(item: ItemReference, offset?: number): void
  itemFocusEnd(item?: ItemReference): void
  itemFoldup(willFoldup: boolean, item: ItemReference): void
  itemFoldupSiblings(willFoldup: boolean, item?: ItemReference): void
  itemInsertLeaves(item: ItemReference, leaves: Node[]): void
  itemMerge(item: ItemReference, anotherItem: ItemReference): void
  /**
   * Transform multiple items
   */
  itemsBatch(
    method: TransformMethod,
    options?: {
      at?: Location
      [k: string]: any
    }
  ): void

  itemCache(item: KyString | ItemNode): ItemNode

  /**
   * Get item selection
   * This is similar to Slate selection or DOM selection,
   * But item selection would always use items as the anchor node and focus node.
   */
  itemSelection(): ItemRange
  /**
   * Get all of the selected items as an array,
   * which will exclude the item if its parent item is in the array
   */
  itemsFromSelection(): ElementEntry[]
  /**
   * Find a set of items
   * @param items
   */
  itemsFrom(items: ItemSet): ItemNode[]
  itemEntriesFrom(items: ItemSet): ItemEntry[]

  /**
   * Get all of the previous items of an item witn a same parent item
   * @param item
   */
  // itemsPrevAll(item?: ItemReference): ItemNode[]

  /**
   * Get an item
   * @param item
   */
  item(item?: ItemReference): ItemNode
  /**
   * Make index for items
   * @param by
   */
  itemEntryMakeIndex(by: 'id' | 'ky'): { [k: string]: ItemEntry }

  /**
   * Get a subitem by index in array
   * @param item
   * @param index
   */
  itemEntrySubitem(item: ItemReference, index: number): ItemEntry | null

  /**
   * Get an item's parent item
   * @param item
   */
  itemParent(item?: ItemReference): ItemNode
  /**
   * Get an item's next item
   * @param item
   */
  itemNext(item?: ItemReference): ItemNode | null
  /**
   * Get all of the next items of an item within a same parent item
   * @param item
   */
  itemNextAll(item?: ItemReference): Generator<ItemNode>
  /**
   * Get an item's previous item
   * @param item
   */
  itemPrev(item?: ItemReference): ItemNode | null

  /**
   * Get an item's entry
   * It'll use the selection's anchor item path without the `item: ItemReference` parameter
   * @param item
   */
  itemEntry(item?: ItemReference): ItemEntry

  /**
   * Get the last descendant item's entry
   */
  itemEntryLast(item?: ItemReference): ItemEntry

  itemEntryAbove(item?: ItemReference): ItemEntry

  /**
   * Get an item's sub items
   * @param item
   */
  itemSubitems(
    item?: ItemReference,
    sliceStart?: number,
    sliceEnd?: number
  ): ItemNode[]

  /**
   * 以 item 为粒度的路径
   * @param bulletPath bulletPath 中的每一个数字都是一个 item 在列表中的 index
   */
  itemPathConvert(bulletPath: number[]): Path

  /**
   * Get an item's path
   * @param item
   */
  itemPath(item?: ItemReference): Path
  itemPathLeaf(item?: ItemReference): Path
  itemPathText(item?: ItemReference): Path
  itemPathHead(item?: ItemReference): Path
  itemPathBody(item?: ItemReference): Path
  itemPathSubitems(item?: ItemReference): Path
  itemPathQuote(item?: ItemReference): Path
  itemPathPrev(item?: ItemReference): Path | null
  itemPathNext(item?: ItemReference): Path | null
  itemPathParent(item?: ItemReference): Path
  itemPathFirstSubitem(item?: ItemReference): Path
  itemPathLastSubitem(item?: ItemReference): Path

  /**
   * Check if an item exists
   * @param item
   */
  itemHas(item?: ItemReference): boolean

  itemTextTree(item?: ItemReference): string
  itemTextTreeIsEmpty(item?: ItemReference): boolean

  /**
   * Check whether an item has neither plain nor sub items
   * @param item
   */
  itemHasNothing(item?: ItemReference): boolean
  itemHasPrev(item?: ItemReference): boolean
  itemHasNext(item?: ItemReference): boolean
  /**
   * Check whether an item has any sub items
   * @param item
   */
  itemHasSubitems(item?: ItemReference): boolean
  /**
   * Check whether an item is foldup
   * @param item
   */
  itemIsFoldup(item?: ItemReference): boolean
  /**
   * Count the number of the item's sub items
   * @param item
   */
  itemCountSubitems(item?: ItemReference): number
  /**
   * Get the plain text of the item
   * @param item
   */
  itemTextPlain(item?: ItemReference): string
  itemTextQuote(item?: ItemReference): string
  itemTextBeforeCaret: () => string
  itemTextRange: (range?: Range) => string

  /**
   * Get a item's leaves
   */
  itemLeaves: (item?: ItemReference) => Text[]

  itemLeavesQuote: (item?: ItemReference) => Text[]

  /**
   * Get the path composed with the item's IDs
   * @param item
   */
  itemIdPath(item?: ItemReference): ItemId[]
  /**
   * Get depth of item
   * The depth is equal to item's parent items length
   * @param item
   */
  itemDepth(item?: ItemReference): number
  /**
   * Get a slate element within an item
   * @param item
   * @param type
   */
  itemPart(
    item: ItemReference,
    type: 'head' | 'subitems' | 'body' | 'quote'
  ): ItemPartElement | undefined
  /**
   * Get the position of the item within its parent
   * @param item
   */
  itemIndex(item?: ItemReference): number
  itemSaveOperation(op: Operation): void
  itemSave(item?: ItemReference): void
  checkSave(path: Path): void

  /**
   * Give some keywords for highlighting
   * @param keywords
   */
  highlight(keywords: string[]): void

  restoreSelection: (moveDistance?: number) => void

  deleteRange: (
    range: Range,
    options?: {
      at?: Location
      distance?: number
      unit?: 'character' | 'word' | 'line' | 'block'
      reverse?: boolean
      hanging?: boolean
      voids?: boolean
    }
  ) => Point | null

  /**
   * Delete some texts before caret if match a certain pattern
   */
  deleteBackwardMatch: (regex: RegExp) => void

  replaceTextBeforeCaret: (regex: RegExp, text: string | Node[]) => void

  withoutSaving(fn: () => void): void
}

export type ItemEditor = ExtendedType<'Editor', BaseItemEditor> & BaseItemEditor

export type ItemRange = {
  anchor: {
    itemDom: ItemDOM
    item: ItemNode
    path: Path
    offset: number
  }
  focus: {
    itemDom: ItemDOM
    item: ItemNode
    path: Path
    offset: number
  }
  isMulti: boolean
  isCollapsed: boolean
}

let EDITOR_ID = 1

/**
 * Create a new Slate `Editor` object.
 */
export const createItemEditor = (editorOptions: {
  app: App
  asFormElement?: boolean
  editorId?: number | string
}): ItemEditor => {
  const cacheItems: { [ky: string]: ItemNode } = {}
  const { app, editorId } = editorOptions

  // A on-off switch to disable saving.
  let canSave = true

  const editor: ItemEditor = {
    children: [],
    operations: [],
    selection: null,
    marks: null,
    editorId: String(editorId ?? EDITOR_ID++),

    app: () => app,

    markableVoid: () => false,

    itemCache(item: KyString | ItemNode): ItemNode {
      if (typeof item === 'string') {
        return cacheItems[item]
      }
      cacheItems[item.ky] = item
      return item
    },

    itemSelection(): ItemRange {
      const s = editor.selection
        ? Editor.unhangRange(editor, editor.selection as Range)
        : null
      if (s) {
        const sel = window.getSelection()
        const active = {
          anchor: {
            item: editor.item(s.anchor),
            path: editor.itemPath(s.anchor),
            offset: s.anchor.offset,
            itemDom: sel?.anchorNode?.parentElement?.closest('.node'),
          },
          focus: {
            item: editor.item(s.focus),
            path: editor.itemPath(s.focus),
            offset: s.focus.offset,
            itemDom: sel?.focusNode?.parentElement?.closest('.node'),
          },

          // Are anchor offset is equal to focus offset?
          isCollapsed: Range.isCollapsed(s),

          // Whether anchor and focus are the same item?
          get isMulti() {
            return active.focus.path.join(',') !== active.anchor.path.join(',')
          },
        } as ItemRange
        return active
      }
      throw new Error('The editor has no selection')
    },

    itemsFromSelection(): ElementEntry[] {
      return Array.from(Item.items(editor, editor.itemSelection())) as any
    },

    itemsFrom(items: ItemSet): ItemNode[] {
      items ??= editor.selection as Range
      if (Item.isItemList(items)) {
        return items
      }
      if (Location.isLocation(items)) {
        return Array.from(Item.items(editor, items as Location)).map(
          (entry) => entry[0]
        )
      }
      return [] as any
    },

    itemEntriesFrom(items: ItemSet): ItemEntry[] {
      items ??= editor.selection as Range
      if (Location.isLocation(items)) {
        return Array.from(Item.items(editor, items as Location))
      }
      return [] as any
    },

    itemSelect(path: Location) {
      Transforms.select(editor, path)
    },

    itemFocus(item: ItemReference, offset = 0) {
      const path = editor.itemPath(item)
      ReactEditor.focus(editor as any)
      const len = editor.itemTextPlain(path).length
      if (offset > len) {
        offset = len
      }
      Transforms.select(editor, {
        path: editor.itemPathLeaf(path),
        offset,
      })
    },

    itemFocusEnd(item?: ItemReference) {
      ReactEditor.focus(editor as any)
      const [node, last] = Editor.last(editor, editor.itemPathText(item))
      Transforms.select(editor, {
        path: last,
        offset: (node as Text).text.length,
      })
    },

    itemFoldup(willFoldup: boolean, item: ItemReference): void {
      willFoldup ??= true
      ItemTransforms.foldupItems(editor, {
        at: editor.itemPath(item),
        foldup: willFoldup,
      })
    },

    itemFoldupSiblings(willFoldup: boolean, item?: ItemReference): void {
      const parentPath = editor.itemPathParent(item)
      for (const [, path] of Node.children(
        editor,
        editor.itemPathSubitems(parentPath)
      )) {
        if (willFoldup && !editor.itemHasSubitems(path)) {
          continue
        }
        ItemTransforms.foldupItems(editor, {
          at: path,
          foldup: willFoldup,
        })
      }
    },

    itemInsertLeaves(item: ItemReference, leaves: Text[]) {
      editor.itemFocusEnd(editor.itemPath(item))
      const oriFocus = editor.selection?.focus
      if (oriFocus) {
        editor.insertFragment(leaves)
        // Restore the focus point after inserting fragment
        Transforms.select(editor, oriFocus)
      }
    },

    itemMerge(itemReceiver: ItemReference, itemLoser: ItemReference) {
      ItemTransforms.mergeItems(editor, {
        at: editor.itemPath(itemLoser),
        to: editor.itemPath(itemReceiver),
      })
    },

    itemsBatch(
      method: TransformMethod,
      options: {
        at?: Location
        reverse?: boolean
        [k: string]: any
      } = { reverse: false }
    ): void {
      const s = options.at ?? editor.itemSelection()
      const entries = editor.itemEntriesFrom(s)
      if (options.reverse) {
        entries.reverse()
      }

      const refs = entries.map((entry) => Editor.pathRef(editor, entry[1]))
      for (const pathRef of refs) {
        method(editor, {
          ...options,
          at: pathRef.unref(),
        } as any)
      }
    },

    itemInsert(items?: ItemSet, atItem?: ItemReference): void {
      const at: any = atItem ? editor.itemPath(atItem) : editor.selection
      if (Item.isItemList(items) || Item.isItemNode(items)) {
        ItemTransforms.insertItems(editor, { at, items })
      } else {
        ItemTransforms.splitItems(editor, { at })
      }
    },

    itemRemove(item?: ItemReference): void {
      ItemTransforms.removeItems(editor, { at: editor.itemPath(item) })
    },

    itemIndent(items?: ItemSet): void {
      editor.itemsBatch(ItemTransforms.indentItems, { at: items as any })
    },

    itemOutdent(items?: ItemSet): void {
      editor.itemsBatch(ItemTransforms.outdentItems, {
        at: items as any,
        reverse: true,
      })
    },

    itemSetProps(props: Partial<ItemNode>, item?: ItemReference): void {
      ItemTransforms.setItems(editor, {
        at: editor.itemPath(item),
        props,
      })
    },

    itemEntry(item?: ItemReference): ItemEntry {
      if (Item.isItemEntry(item)) {
        return item as ItemEntry
      }

      if (isEmpty(item)) {
        if (editor.selection) {
          item = editor.selection.anchor.path
        } else {
          throw new Error(
            "There isn't any thing for editor.itemEntry() to find the item"
          )
        }
      }

      if (Range.isRange(item)) {
        item = item.anchor.path
      } else if (Point.isPoint(item)) {
        item = item.path
      }

      if (Path.isPath(item)) {
        const slPath = item
        for (let i = slPath.length; i >= 0; i--) {
          const p = slPath.slice(0, i)
          if (!Node.has(editor, p)) {
            continue
          }
          try {
            const node = Node.get(editor, p) as ItemNode
            if ((node as any).type === 'node') {
              return [node, p]
            }
          } catch (e) {
            // void
          }
        }
      } else if (typeof item === 'string') {
        // 0.1.3 这样的数字串，代表 bullet path
        // 可通过 itemPathConvert() 转换为 Slate Path
        if (/^[\d,\s]+$/.test(item)) {
          const bulletPath = item.split(',').map((s) => parseInt(s, 10))
          return editor.itemEntry(editor.itemPathConvert(bulletPath))
        }

        // by id
        // First we try to find the path in the editor's selection,
        // if not found, then find it in the whole editor's node tree,
        // and eventually try to call ReactEditor.findPath() to find the path.
        const id = item
        try {
          if (editor.selection) {
            for (const [node, path] of rangeToArray(
              editor,
              editor.itemSelection()
            )) {
              if (
                Item.isItemNode(node) &&
                (node.$id === id || node.ky === id)
              ) {
                return [node, path]
              }
            }
          }
        } catch (err) {
          console.error(err)
        }

        for (const [node, path] of Node.elements(editor)) {
          if (Item.isItemNode(node) && (node.$id === id || node.ky === id)) {
            return [node as ItemNode, path]
          }
        }
      }

      throw new Error("Can't get the item entry")
    },

    itemEntryLast(item?: ItemReference): ItemEntry {
      const path = editor.itemPath(item)
      const [, lastPath] = Editor.last(editor as Editor, path)
      return editor.itemEntry(lastPath)
    },

    itemEntryAbove(item?: ItemReference): ItemEntry {
      const prevPath = editor.itemPathPrev(item)
      if (prevPath) {
        const [, lastPath] = Editor.last(editor as Editor, prevPath)
        return editor.itemEntry(lastPath)
      }
      if (editor.itemDepth(item) > 0) {
        return editor.itemEntry(editor.itemPathParent(item))
      }
      throw new Error('No item above')
    },

    findPath(node: Node): Path | null {
      return ReactEditor.findPath(editor as any, node)
    },

    itemCreate(item: Partial<ItemNode>): ItemNode {
      return Item.make(item, { editor })
    },

    item(item?: ItemReference): ItemNode {
      return editor.itemEntry(item)[0]
    },

    itemEntryMakeIndex(by: 'id' | 'ky'): { [k: string]: ItemEntry } {
      const index = {} as { [k: string]: ItemEntry }
      for (const [node, path] of Node.elements(editor)) {
        if (Item.isItemNode(node)) {
          const id = (node as any)[by]
          if (id) {
            index[id] = [node, path]
          }
        }
      }
      return index
    },

    itemEntrySubitem(item: ItemReference, index: number): ItemEntry | null {
      const sub = editor.itemPart(item, 'subitems')
      if (sub && sub.children[index]) {
        return [
          sub.children[index] as ItemNode,
          editor.itemPathSubitems(item)!.concat(index),
        ]
      }
      return null
    },

    itemParent(item?: ItemReference): ItemNode {
      return editor.item(editor.itemPathParent(item))
    },

    itemNext(item?: ItemReference): ItemNode | null {
      if (editor.itemHasNext(item)) {
        return editor.item(editor.itemPathNext(item) as any)
      }
      return null
    },

    *itemNextAll(
      item?: ItemReference,
      match?: (item: ItemNode, index: number) => boolean,
      breakIfNotMatch = false
    ): Generator<ItemNode> {
      // const result: ItemNode[] = [];
      let path = editor.itemPath(item)
      for (let i = 0; i < 1000; i++) {
        if (editor.itemHasNext(item)) {
          const [nextItem, nextPath] = editor.itemEntry(
            editor.itemPathNext(path)!
          )
          path = nextPath
          if (match && !match(nextItem, i)) {
            if (breakIfNotMatch) {
              break
            }
            continue
          }
          // result.push(nextItem);
          yield nextItem
        } else {
          break
        }
      }
      // return result;
    },

    itemPrev(item?: ItemReference): ItemNode | null {
      const prev = editor.itemPathPrev(item)
      if (prev) {
        return editor.item(prev)
      }
      return null
    },

    itemSubitems(
      item?: ItemReference,
      sliceStart?: number,
      sliceEnd?: number
    ): ItemNode[] {
      const sub = editor.itemPart(item, 'subitems')
      if (sub) {
        const list = sub.children.filter(
          (one) => (one as ItemNode).type === 'node'
        ) as ItemNode[]
        if (typeof sliceStart === 'number') {
          return list.slice(sliceStart, sliceEnd ?? Infinity)
        }
        return list
      }
      return [] as ItemNode[]
    },

    itemPathConvert(bulletPath: number[]): Path {
      const path = [] as Path
      for (let i = 0; i < bulletPath.length - 1; i++) {
        path.push(i, PART_POS.body, PART_POS.subitems)
      }
      const last = bulletPath.pop()
      if (last !== undefined) {
        path.push(last)
      }
      return path
    },

    itemPath(item?: ItemReference): Path {
      return editor.itemEntry(item)[1]
    },

    itemPathLeaf(item?: ItemReference): Path {
      return [...editor.itemPathText(item), 0]
    },

    itemPathText(item?: ItemReference): Path {
      return [...editor.itemPathHead(item), PART_POS.text]
    },

    itemPathHead(item?: ItemReference): Path {
      return [...editor.itemPath(item), PART_POS.head]
    },

    itemPathQuote(item?: ItemReference): Path {
      return [...editor.itemPathHead(item), PART_POS.quote]
    },

    itemPathBody(item?: ItemReference): Path {
      return [...editor.itemPath(item), PART_POS.body]
    },

    itemPathSubitems(item?: ItemReference): Path {
      return [...editor.itemPathBody(item), PART_POS.subitems]
    },

    itemPathPrev(item?: ItemReference): Path | null {
      try {
        return Path.previous(editor.itemPath(item))
      } catch {
        return null
      }
    },

    itemPathNext(item?: ItemReference): Path {
      return Path.next(this.itemPath(item))
    },

    itemPathParent(item?: ItemReference): Path {
      const p = editor.itemPath(item)
      return editor.itemPath(p.slice(0, -1))
    },

    itemPathFirstSubitem(item?: ItemReference): Path {
      return [...editor.itemPathSubitems(item), 0]
    },

    itemPathLastSubitem(item?: ItemReference): Path {
      return [
        ...editor.itemPathSubitems(item),
        editor.itemCountSubitems(item) - 1,
      ]
    },

    itemHas(item?: ItemReference): boolean {
      return Node.has(editor, editor.itemPath(item))
    },

    itemHasPrev(item?: ItemReference) {
      return !!editor.itemPathPrev(item)
    },

    itemHasNext(item?: ItemReference) {
      const nextPath = editor.itemPathNext(item)
      if (nextPath) {
        return Node.has(editor, nextPath)
      }
      return false
    },

    itemHasSubitems(item?: ItemReference): boolean {
      return editor.itemCountSubitems(item) > 0
    },

    itemCountSubitems: (item?: ItemReference): number => {
      return editor.itemSubitems(item).length
    },

    itemHasNothing: (item?: ItemReference): boolean => {
      return (
        editor.itemLeaves(item).length < 2 &&
        editor.itemLeaves(item).filter((leaf) => Element.isElement(leaf))
          .length < 1 &&
        editor.itemTextPlain(item).length < 1 &&
        editor.itemCountSubitems(item) < 1
      )
    },

    itemTextTree: (item?: ItemReference): string => {
      let content = ''
      const root = editor.item(item)
      for (const [node] of Node.nodes(root)) {
        if ((node as any).type === 'node-head') {
          content += trim(nodeString(node))
        }
      }
      return content
    },

    itemTextTreeIsEmpty: (item?: ItemReference): boolean => {
      const root = editor.item(item)
      for (const [node] of Node.nodes(root)) {
        if ((node as any).type === 'node-head') {
          const str = trim(nodeString(node))
          if (str.length > 0) {
            return false
          }
        }
      }
      return true
    },

    itemIsFoldup: (item?: ItemReference): boolean => {
      return !!editor.item(item).foldup
    },

    itemTextPlain: (item?: ItemReference): string => {
      item = item ?? (editor.selection as Range)
      return Node.string(editor.itemPart(item, 'head') as Node)
    },

    itemTextQuote(item?: ItemReference): string {
      const path = editor.itemPathQuote(item)
      if (path && Editor.hasPath(editor, path)) {
        const quoteNode = Node.get(editor, path)
        return Node.string(quoteNode)
      }
      return ''
    },

    itemTextBeforeCaret: (): string => {
      // return editor
      //   .itemTextPlain()
      //   .substring(0, editor.itemSelection().anchor.offset);
      try {
        const at = editor.selection as Range
        if (at) {
          const leftRange = {
            anchor: {
              path: editor.itemPathText(at.anchor.path).concat(0),
              offset: 0,
            } as Point,
            focus: at.anchor,
          }
          return getRangeText(editor, leftRange)
        }
        return ''
      } catch (err) {
        console.error(err)
        return ''
      }
    },

    itemTextRange: (range?: Range): string => {
      range ??= editor.selection!
      if (range) {
        return Editor.string(editor, range)
      }
      return ''
    },

    itemLeaves: (item?: ItemReference): Text[] => {
      try {
        const path = editor.itemPathText(item)
        if (!path || !Editor.hasPath(editor, path)) return []
        const node = Node.get(editor, path) as Element
        return (node.children as Text[]) ?? []
      } catch (e) {
        console.error(e)
        return []
      }
    },

    itemLeavesQuote: (item?: ItemReference): Text[] => {
      if (Editor.hasPath(editor, editor.itemPathQuote(item))) {
        return []
      }
      try {
        const node = Node.get(editor, editor.itemPathQuote(item)) as Element
        return (node.children as Text[]) ?? []
      } catch (e) {
        console.error(e)
        return []
      }
    },

    itemIdPath: (item?: ItemReference): ItemId[] => {
      const ids: string[] = []
      const itemPath = editor.itemPath(item)
      for (let i = itemPath.length - 1; i >= 0; i--) {
        const p = itemPath.slice(0, i)
        const node = Node.get(editor, p)
        if ((node as any).type === Item.partTypes.outer) {
          ids.unshift((node as any).$id)
        }
      }
      return ids
    },

    /**
     * Get the item's depth in an editor
     * @param item
     * @returns
     */
    itemDepth: (item?: ItemReference): number => {
      return editor.itemIdPath(item).length
    },

    itemPart: (
      item: ItemReference,
      type: 'head' | 'subitems' | 'body' | 'quote'
    ): ItemPartElement | undefined => {
      const partType = `node-${type}`
      if (partType === 'node-subitems') {
        const bodyPart = editor.itemPart(item, 'body')
        if (bodyPart) {
          return bodyPart.children[0] as ItemPartElement
        }
        return undefined
      }
      if (!editor.itemHas(item)) {
        return undefined
      }
      return editor
        .item(item)
        .children.find((ele: any) => ele.type === partType) as any
    },

    itemIndex: (item?: ItemReference): number => {
      const p = editor.itemPath(item)
      return p[p.length - 1]
    },

    itemSaveOperation: (op: Operation): void => {
      if (!canSave) {
        return
      }

      if (op.type !== 'set_selection') {
        let newItem: any = null
        try {
          const omitKeys = ['children', 'subitems']
          if (op.type === 'remove_node') {
            // 有时 remove_node 仅仅是删除了 leaf node, 而不是整个 item
            // 所以此时只需要保存 item 的内容即可.

            if (Item.isItemNode(op.node)) {
              newItem = { ...op.node } as any
              newItem.status = UNIT_STATUS.TRASH
            } else {
              newItem = omit(editor.item(op.path.slice(0, -1)), omitKeys)
              newItem.ori = editor.itemTextPlain(op.path)
              newItem.leaves = editor.itemLeaves(op.path)
              newItem.quote = editor.itemTextQuote(op.path)
            }
          } else if (Node.has(editor, op.path)) {
            const theItem = editor.item(op.path)
            newItem = omit(theItem, omitKeys)
            newItem.ori = editor.itemTextPlain(op.path)
            newItem.leaves = editor.itemLeaves(op.path)
            const quote = editor.itemTextQuote(op.path)
            newItem.quote = quote

            if (!isEmpty(newItem.status)) {
              delete newItem.status
            }
          }
        } catch (e) {
          console.error(e)
          return
        }

        try {
          if (Item.canPersist(newItem)) {
            if (isEmpty(newItem.weight)) {
              const prev = editor.itemPrev(op.path)
              const prevWeight = prev?.weight ?? 0
              const next = editor.itemNext(op.path)
              const nextWeight = next?.weight ?? time()
              newItem.weight = (prevWeight + nextWeight) / 2
            }
            pub.emit(pub.evt.editorChanged, {
              editor,
              item: newItem,
              opType: op.type,
            })
            atLater(
              () => {
                if (!isEmpty(newItem.lock)) {
                  const oriItem = app.addons.dbMemory.getItem(newItem.ky)
                  if (oriItem.lock?.locked === newItem.lock?.locked) {
                    return
                  }
                }
                invoke('editor', app.addons.dbMemory.saveItem, newItem)
              },
              `editor-save-item-${newItem.ky}`,
              100
            )
          }
        } catch (e) {
          console.error(e)
        }
      }
    },

    itemSave(item?: ItemReference): void {
      const p = editor.itemPath(item)
      setOri(editor, p)
      // app.addons.dbMemory.saveItem(editor.item(p));
      invoke('editor', app.addons.dbMemory.saveItem, editor.item(p))
    },

    /**
     * 查找是否有「未保存」的 item，并保存之
     * @param path
     */
    checkSave(path: Path) {
      atLater(
        () => {
          for (const [one, p] of Item.items(editor, path, { recur: true })) {
            if (one.ky in app.addons.dbMemory.nodes === false) {
              ItemTransforms.setItems(editor, {
                at: p,
                props: {
                  // 由于 RE 会在保存数据时会自动清除 $ 符号开头的属性，
                  // 所以可以随便给一个 $ 开头的属性赋值，以触发 transform，从而触发 save
                  $saveMe: Date.now(),
                },
              })
            }
          }
        },
        `checkSave-${path.join(',')}`,
        10
      )
    },

    // 在实例化的时候，由 EditorView 给出具体实现
    highlight: () => {},

    restoreSelection: (moveDistance = 0) => {
      const at = editor.selection
      ReactEditor.focus(editor as any)
      if (at) {
        Transforms.select(editor, at)
        if (moveDistance) {
          Transforms.move(editor, {
            distance: moveDistance,
            unit: 'character',
          })
        }
      }
    },

    deleteRange: (
      range: Range,
      options: {
        at?: Location
        distance?: number
        unit?: 'character' | 'word' | 'line' | 'block'
        reverse?: boolean
        hanging?: boolean
        voids?: boolean
      } = {}
    ): Point | null => {
      if (editor.itemSelection().isMulti) {
        editor.itemsBatch(ItemTransforms.removeItems, { at: range })
        return null
      }

      if (Range.isCollapsed(range)) {
        return range.anchor
      }

      const [, end] = Range.edges(range)
      const pointRef = Editor.pointRef(editor, end)
      Transforms.delete(editor, { at: range, ...options })
      return pointRef.unref()
    },

    insertBreak: () => {
      editor.itemInsert()
    },

    isInline: (ele: any) => {
      return Element.isElement(ele) && Boolean((ele as any).inline)
    },
    isVoid: () => false,
    onChange: () => {},

    addMark: (...args) => addMark(editor, ...args),

    deleteBackwardMatch: (regex: RegExp) => {
      const txt = editor.itemTextBeforeCaret()
      if (regex.source.endsWith('$') === false) {
        throw new Error('regex must end with "$"')
      }
      const match = txt.match(regex)
      if (match) {
        Transforms.delete(editor, {
          unit: 'character',
          reverse: true,
          distance: match[0].length,
        })
      }
    },

    replaceTextBeforeCaret: (regex: RegExp, replacement: string | Node[]) => {
      editor.deleteBackwardMatch(regex)
      if (!Node.isNodeList(replacement)) {
        replacement = [{ text: String(replacement) }]
      }
      editor.insertFragment(replacement)
    },

    withoutSaving(fn: () => void) {
      canSave = false
      app.addons.dbMemory.withoutSaving(fn)
      canSave = true
    },

    deleteBackward: (unit: 'character' | 'word' | 'line' | 'block') => {
      const { selection } = editor

      if (selection && Range.isCollapsed(selection)) {
        Transforms.delete(editor, { unit, reverse: true })
        setOri(editor, editor.itemPath())
      }
    },

    deleteForward: (unit: 'character' | 'word' | 'line' | 'block') => {
      const { selection } = editor

      if (selection && Range.isCollapsed(selection)) {
        Transforms.delete(editor, { unit })
        setOri(editor, editor.itemPath())
      }
    },

    deleteFragment: (direction?: EditorFragmentDeletionOptions | undefined) => {
      const { selection } = editor

      if (selection && Range.isExpanded(selection)) {
        Transforms.delete(editor, {
          reverse: direction?.direction === 'backward',
        })
        setOri(editor, editor.itemPath())
      }
    },

    getFragment: () => {
      const { selection } = editor

      if (selection) {
        return Node.fragment(editor, selection)
      }
      return []
    },

    insertFragment: (fragment: Node[]) => {
      insertFragment(editor, fragment, {
        hanging: false,
        voids: true,
      })
      setOri(editor, editor.itemPath())
    },

    insertNode: (node: Node) => {
      Transforms.insertNodes(editor, node)
      setOri(editor, editor.itemPath())
    },

    insertText: (text: string) => {
      const { selection, marks } = editor
      if (selection) {
        if (marks) {
          const node = { text, ...marks }
          Transforms.insertNodes(editor, node)
        } else {
          Transforms.insertText(editor, text)
        }
        setOri(editor, editor.itemPath())

        // 入口读到的 marks 用完即清（单次预设）。
        // 但字符串映射规则可能在这次插入过程中同步设置了新的预设标记
        // （如输入 {red} 为后续文字预设颜色），那种新 marks 要保留。
        if (editor.marks === marks) {
          editor.marks = null
        }
      }
    },

    // normalizeNode: (entry: NodeEntry) => {
    //   const [node, path] = entry

    //   // There are no core normalizations for text nodes.
    //   if (Text.isText(node)) {
    //     return
    //   }

    //   // Ensure that block and inline nodes have at least one text child.
    //   if (Element.isElement(node) && node.children.length === 0) {
    //     const child = { text: '' }
    //     Transforms.insertNodes(editor, child, {
    //       at: path.concat(0),
    //       voids: true,
    //     })
    //     return
    //   }

    //   // Determine whether the node should have block or inline children.
    //   const shouldHaveInlines = Editor.isEditor(node)
    //     ? false
    //     : Element.isElement(node) &&
    //       (editor.isInline(node) ||
    //         node.children.length === 0 ||
    //         Text.isText(node.children[0]) ||
    //         editor.isInline(node.children[0]))

    //   // Since we'll be applying operations while iterating, keep track of an
    //   // index that accounts for any added/removed nodes.
    //   let n = 0

    //   for (let i = 0; i < node.children.length; i++, n++) {
    //     const currentNode = Node.get(editor, path)
    //     if (Text.isText(currentNode)) continue
    //     const child = node.children[i] as Descendant
    //     const prev = currentNode.children[n - 1] as Descendant
    //     const isLast = i === node.children.length - 1
    //     const isInlineOrText =
    //       Text.isText(child) ||
    //       (Element.isElement(child) && editor.isInline(child))

    //     // Only allow block nodes in the top-level children and parent blocks
    //     // that only contain block nodes. Similarly, only allow inline nodes in
    //     // other inline nodes, or parent blocks that only contain inlines and
    //     // text.
    //     if (isInlineOrText !== shouldHaveInlines) {
    //       Transforms.removeNodes(editor, { at: path.concat(n), voids: true })
    //       return
    //     } else if (Element.isElement(child)) {
    //       // Ensure that inline nodes are surrounded by text nodes.
    //       if (editor.isInline(child)) {
    //         if (prev == null || !Text.isText(prev)) {
    //           const newChild = { text: '' }
    //           Transforms.insertNodes(editor, newChild, {
    //             at: path.concat(n),
    //             voids: true,
    //           })
    //           return
    //         } else if (isLast) {
    //           const newChild = { text: '' }
    //           Transforms.insertNodes(editor, newChild, {
    //             at: path.concat(n + 1),
    //             voids: true,
    //           })
    //           return
    //         }
    //       }
    //     } else {
    //       // Merge adjacent text nodes that are empty or match.
    //       if (prev != null && Text.isText(prev)) {
    //         if (Text.equals(child, prev, { loose: true })) {
    //           Transforms.mergeNodes(editor, {
    //             at: path.concat(n),
    //             voids: true,
    //           })
    //           return
    //         } else if (prev.text === '') {
    //           Transforms.removeNodes(editor, {
    //             at: path.concat(n - 1),
    //             voids: true,
    //           })
    //           return
    //         } else if (child.text === '') {
    //           Transforms.removeNodes(editor, {
    //             at: path.concat(n),
    //             voids: true,
    //           })
    //           return
    //         }
    //       }
    //     }
    //   }
    // },

    normalizeNode: (...args) => normalizeNode(editor, ...args),

    removeMark: (...args) => removeMark(editor, ...args),

    apply: (op: Operation) => {
      slateApply(editor, op)
      if (op.type !== 'set_selection') {
        try {
          editor.itemSaveOperation(op)
        } catch (e) {
          console.error(e)
        }
      }
      if (op.type === 'set_selection') {
        pub.emit(pub.evt.selectionChanged, { editor, op })
      }
    },
    insertSoftBreak() {
      return Transforms.splitNodes(editor, { always: true })
    },
    isElementReadOnly: () => false,
    isSelectable: () => true,
    getDirtyPaths: (...args) => getDirtyPaths(editor, ...args),
    shouldNormalize: (...args) => shouldNormalize(editor, ...args),
    above: (...args) => above(editor, ...args),
    after: (...args) => after(editor, ...args),
    before: (...args) => before(editor, ...args),
    collapse: (...args) => collapse(editor, ...args),
    delete: (...args) => deleteText(editor, ...args),
    deselect: (...args) => deselect(editor, ...args),
    edges: (...args) => edges(editor, ...args),
    elementReadOnly: (...args) => elementReadOnly(editor, ...args),
    end: (...args) => end(editor, ...args),
    first: (...args) => first(editor, ...args),
    fragment: (...args) => fragment(editor, ...args),
    getMarks: (...args) => marks(editor, ...args),
    hasBlocks: (...args) => hasBlocks(editor, ...args),
    hasInlines: (...args) => hasInlines(editor, ...args),
    hasPath: (...args) => hasPath(editor, ...args),
    hasTexts: (...args) => hasTexts(editor, ...args),
    insertNodes: (...args) => insertNodes(editor, ...args),
    isBlock: (...args) => isBlock(editor, ...args),
    isEdge: (...args) => isEdge(editor, ...args),
    isEmpty: (...args) => slateIsEmpty(editor, ...args),
    isEnd: (...args) => isEnd(editor, ...args),
    isNormalizing: (...args) => isNormalizing(editor, ...args),
    isStart: (...args) => isStart(editor, ...args),
    last: (...args) => last(editor, ...args),
    leaf: (...args) => leaf(editor, ...args),
    levels: (...args) => levels(editor, ...args),
    liftNodes: (...args) => liftNodes(editor, ...args),
    mergeNodes: (...args) => mergeNodes(editor, ...args),
    move: (...args) => move(editor, ...args),
    moveNodes: (...args) => moveNodes(editor, ...args),
    next: (...args) => next(editor, ...args),
    node: (...args) => node(editor, ...args),
    nodes: (...args) => nodes(editor, ...args),
    normalize: (...args) => normalize(editor, ...args),
    parent: (...args) => parent(editor, ...args),
    path: (...args) => path(editor, ...args),
    pathRef: (...args) => pathRef(editor, ...args),
    pathRefs: (...args) => pathRefs(editor, ...args),
    point: (...args) => point(editor, ...args),
    pointRef: (...args) => pointRef(editor, ...args),
    pointRefs: (...args) => pointRefs(editor, ...args),
    positions: (...args) => positions(editor, ...args),
    previous: (...args) => previous(editor, ...args),
    range: (...args) => range(editor, ...args),
    rangeRef: (...args) => rangeRef(editor, ...args),
    rangeRefs: (...args) => rangeRefs(editor, ...args),
    removeNodes: (...args) => removeNodes(editor, ...args),
    select: (...args) => select(editor, ...args),
    setNodes: (...args) => setNodes(editor, ...args),
    setNormalizing: (...args) => setNormalizing(editor, ...args),
    setPoint: (...args) => setPoint(editor, ...args),
    setSelection: (...args) => setSelection(editor, ...args),
    splitNodes: (...args) => splitNodes(editor, ...args),
    start: (...args) => start(editor, ...args),
    string: (...args) => string(editor, ...args),
    unhangRange: (...args) => unhangRange(editor, ...args),
    unsetNodes: (...args) => unsetNodes(editor, ...args),
    unwrapNodes: (...args) => unwrapNodes(editor, ...args),
    void: (...args) => getVoid(editor, ...args),
    withoutNormalizing: (...args) => withoutNormalizing(editor, ...args),
    wrapNodes: (...args) => wrapNodes(editor, ...args),
    shouldMergeNodesRemovePrevNode: (...args) =>
      shouldMergeNodesRemovePrevNode(editor, ...args),
  }

  return editor
}

function setOri(editor: ItemEditor, path?: Path) {
  const p = path ?? editor.itemPath()
  ItemTransforms.setItems(editor, {
    at: p,
    props: {
      $changed: nanoid(),
      ori: editor.itemTextPlain(p),
      leaves: editor.itemLeaves(p),
    },
  })
}
