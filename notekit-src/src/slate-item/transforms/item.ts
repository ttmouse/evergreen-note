/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable prefer-const */
import { Item, makeItemBody, makeItemHead, ItemNode } from '../interfaces/item'
import {
  Editor,
  Location,
  Node,
  Path,
  Point,
  Transforms,
  Element,
  Range,
  HistoryEditor,
} from '../slate.inc'
import { isEmpty } from '../utils/isEmpty'
import { ItemEditor } from '..'
import { getRangeTextData } from '../utils/slate/helper'
import { App, NewAddonParams } from '../engine/App'
import { calcWeight, calcPos, shouldReOrder, extractItemProps, replaceSlateNode } from './helper'
import { shouldReIndex } from './calcOrder'
import { recur } from '../utils/recur'
import { unstable_GlobalApp } from '@/main'
import { DIRTY_ITEMS_WEAKMAP } from '../addons/Refresh/Refresh'

export const ItemTransforms = {
  reorderSubitems(editor: ItemEditor, itemPath: Path) {
    const w = 10000
    try {
      const subPath = editor.itemPathSubitems(itemPath)
      for (const [, path] of Node.children(editor, subPath)) {
        const pos = path[path.length - 1] + 1
        const weight = w + pos * w
        ItemTransforms.setItems(editor, {
          at: path,
          props: {
            weight,
          },
        })
      }
    } catch (e) {
      console.error(e)
    }
  },

  mergeItems(
    editor: ItemEditor,
    options: {
      at: Path
      to: Path
    }
  ) {
    editor.itemInsertLeaves(options.to, editor.itemLeaves(options.at))
    if (editor.itemCountSubitems(options.at) > 0) {
      const receiverRef = Editor.pathRef(editor, editor.itemPath(options.to))
      const senderRefs = Array.from(
        Node.children(editor, editor.itemPathSubitems(options.at)),
        ([, path]) => Editor.pathRef(editor, path)
      )
      for (const pathRef of senderRefs.reverse()) {
        ItemTransforms.moveItems(editor, {
          at: pathRef.unref() as Path,
          to: receiverRef.current as Path,
          pos: 0,
        })
      }
      receiverRef.unref()
    }
  },

  /**
   * Remove the Items at a specific location in the document.
   */
  removeItems(
    editor: ItemEditor,
    options: {
      at: Path
      recursive?: boolean
    }
  ): void {
    Editor.withoutNormalizing(editor, () => {
      ItemTransforms.setItems(editor, {
        at: options.at,
        props: {
          status: -1,
        },
      })
      const { at, recursive = true } = options
      const subPath = editor.itemPathSubitems(at)

      if (recursive && Node.has(editor, subPath)) {
        for (const [subitem, subitemPath] of Node.children(editor, subPath, {
          reverse: true,
        })) {
          if (Item.isItemNode(subitem)) {
            ItemTransforms.removeItems(editor, { at: subitemPath })
          }
        }
      }
      Transforms.removeNodes(editor, {
        at: editor.itemPath(at),
      })
    })
  },

  /**
   * Insert subitems at a specific location
   * @param editor
   * @param options
   */
  insertItems(
    editor: ItemEditor,
    options: {
      items?: ItemNode | ItemNode[]
      at: Path // The path of the new item's parent
      pos?: number
      focus?: boolean
    }
  ) {
    Editor.withoutNormalizing(editor, () => {
      const [parentItem, parentPath] = editor.itemEntry(options.at)
      let {
        items = editor.itemCreate({ ori: '', pky: parentItem.ky }),
        at, // path of parent item
        pos = 0, // position of new item within the parent item
        focus = false,
      } = options

      if (!Array.isArray(items)) {
        items = [items as ItemNode]
      }

      // 处理排序权重
      const [startWeight, endWeight] = calcWeight(editor, parentPath, pos)
      const weightStep = (endWeight - startWeight) / (items.length + 1)

      items = items.map((item, i) => ({
        ...item,
        weight: startWeight + weightStep * (i + 1),
        pky: parentItem.ky,
      }))

      const subPath = editor.itemPathSubitems(at)

      ItemTransforms.insertBodyElementForItems(editor, {
        at,
        $isTop: !!parentItem.$isTop,
      })
      const calculatedPosition = calcPos(editor, parentPath, pos)
      items.forEach((newItem, i) => {
        const myPath = [...subPath, calculatedPosition + i]
        Transforms.insertNodes(editor, newItem, {
          at: myPath,
        })
        if (focus) {
          editor.itemFocusEnd(myPath)
        }
      })

      setTimeout(() => {
        try {
          const subEl: Element = Node.get(editor, subPath) as any
          if (shouldReIndex(subEl.children as any)) {
            ItemTransforms.reorderSubitems(editor, at)
          }
        } catch (e) {
          // void
        }
      }, 100)

      // 重新对所有的子节点分配排序权重
      if (isEmpty(weightStep)) {
        ItemTransforms.reorderSubitems(editor, parentPath)
      }

      // 检查是否有「未保存」的节点，并保存之
      editor.checkSave(at)
    })
  },

  /**
   * Insert a new item before a specific location
   * @param editor
   * @param options
   */
  insertPrevItems(
    editor: ItemEditor,
    options: {
      items?: ItemNode | ItemNode[]
      at: Path
      focus?: boolean
    }
  ) {
    const [item] = editor.itemEntry(options.at)
    const {
      at,
      items = Item.make({ ori: '', pky: item.pky }, { editor } as any),
      focus = false,
    } = options

    const pathRef = Editor.pathRef(editor, at)

    ItemTransforms.insertItems(editor, {
      items: items as ItemNode,
      at: editor.itemPathParent(at),
      pos: editor.itemIndex(at),
    })
    const prevPath = editor.itemPathPrev(pathRef.unref()!)
    if (focus && prevPath) {
      editor.itemFocus(prevPath)
    }
  },

  /**
   * Insert a new item after a specific location
   * @param editor
   * @param options
   */
  insertNextItems(
    editor: ItemEditor,
    options: {
      items?: ItemNode | ItemNode[]
      at: Path
      focus?: boolean
      focusEnd?: boolean
    }
  ) {
    const [item] = editor.itemEntry(options.at)
    const {
      at,
      focus = false,
      focusEnd = false,
      items = editor.itemCreate({ ori: '', pky: item.pky }),
    } = options
    ItemTransforms.insertItems(editor, {
      items: items as ItemNode,
      at: editor.itemPathParent(at),
      pos: editor.itemIndex(at) + 1,
    })
    const nextPath = editor.itemPathNext(at)
    if (focus && nextPath) {
      editor.itemFocus(nextPath)
    }
    if (focusEnd && nextPath) {
      editor.itemFocusEnd(nextPath)
    }
  },

  /**
   * Insert a subitem as the last one in a specific location
   * @param editor
   * @param options
   */
  insertLastItems(
    editor: ItemEditor,
    options: { items?: ItemNode | ItemNode[]; at: Path }
  ) {
    ItemTransforms.insertItems(editor, { ...options, pos: -1 })
    editor.itemFocus(editor.itemPathLastSubitem(options.at))
  },

  /**
   * Move an existing item to the end of a specific location
   * @param editor
   * @param options
   */
  appendItems(
    editor: ItemEditor,
    options: {
      at: Path
      to: Path
    }
  ) {
    let { at, to } = options

    ItemTransforms.moveItems(editor, {
      at,
      to,
      pos: -1,
    })
  },

  indentItems(
    editor: ItemEditor,
    options: {
      at: Path | Path[]
    }
  ) {
    let { at } = options
    if (Path.isPath(at)) {
      at = [at as Path]
    }

    at.forEach((slPath) => {
      const prevPath = editor.itemPathPrev(slPath)
      if (!prevPath) {
        return
      }
      if (editor.itemIsFoldup(prevPath)) {
        ItemTransforms.foldupItems(editor, {
          at: prevPath,
          foldup: false,
        })
      }
      ItemTransforms.appendItems(editor, {
        at: slPath,
        to: prevPath,
      })
    })
  },

  outdentItems(
    editor: ItemEditor,
    options: {
      at: Path | Path[]
    }
  ) {
    let { at } = options
    if (Path.isPath(at)) {
      at = [at as Path]
    }

    at.reverse().forEach((slPath) => {
      // An item can only outdent when its depth is greater than 1.
      if (editor.itemDepth(slPath) < 2) {
        return
      }
      const inside = editor.itemPathParent(slPath)
      const outside = editor.itemPathParent(inside)
      if (editor.itemHas(inside) && editor.itemHas(outside)) {
        let pos = inside.pop() as number
        pos += 1
        ItemTransforms.moveItems(editor, {
          at: slPath,
          to: outside,
          pos,
        })
      }
    })
  },

  /**
   * Outdent all subitems of a specific item
   * @param editor
   * @param options
   */
  outdentSubItems(
    editor: ItemEditor,
    options: {
      at: Path
    }
  ) {
    const { at } = options
    const subPath = editor.itemPathSubitems(at)
    Array.from(Node.children(editor, subPath))
      .reverse()
      .forEach(([, slPath]) => {
        ItemTransforms.outdentItems(editor, { at: slPath })
      })
  },

  moveUpItems(
    editor: ItemEditor,
    options: {
      at: Path
    }
  ): void {
    const { at } = options
    if (editor.itemHasPrev(at)) {
      const index = editor.itemIndex(at)
      ItemTransforms.moveItems(editor, {
        ...options,
        pos: index - 1,
        to: editor.itemPathParent(at),
      })
    } else {
      console.log('moveDownItems: no previous item')
    }
  },

  moveDownItems(
    editor: ItemEditor,
    options: {
      at: Path
    }
  ): void {
    const { at } = options
    if (editor.itemHasNext(at)) {
      const index = editor.itemIndex(at)
      ItemTransforms.moveItems(editor, {
        ...options,
        pos: index + 1,
        to: editor.itemPathParent(at),
      })
    } else {
      console.log('moveDownItems: no next item')
    }
  },

  moveBeforeItems(editor: ItemEditor, options: { at: Path; before: Path }) {
    Editor.withoutNormalizing(editor, () => {
      const { at, before } = options
      const pos = editor.itemIndex(before)
      ItemTransforms.moveItems(editor, {
        at,
        to: editor.itemPathParent(before),
        pos,
      })
    })
  },

  moveAfterItems(editor: ItemEditor, options: { at: Path; after: Path }) {
    Editor.withoutNormalizing(editor, () => {
      const { at, after } = options
      const pos = editor.itemIndex(after) + 1
      ItemTransforms.moveItems(editor, {
        at,
        to: editor.itemPathParent(after),
        pos,
      })
    })
  },

  moveBeforeItemsForDrag(editor: ItemEditor, options: { at: Path; before: Path }) {
    Editor.withoutNormalizing(editor, () => {
      const { at, before } = options
      const pos = editor.itemIndex(before)
      ItemTransforms.moveItemsForDrag(editor, {
        at,
        to: editor.itemPathParent(before),
        pos,
      })
    })
  },

  moveAfterItemsForDrag(editor: ItemEditor, options: { at: Path; after: Path }) {
    Editor.withoutNormalizing(editor, () => {
      const { at, after } = options
      const pos = editor.itemIndex(after) + 1
      ItemTransforms.moveItemsForDrag(editor, {
        at,
        to: editor.itemPathParent(after),
        pos,
      })
    })
  },

  moveItemsForDrag(
    editor: ItemEditor,
    options: {
      at: Path | Path[]
      to: Path // the parent item's path
      pos?: number
    }
  ): void {
    Editor.withoutNormalizing(editor, () => {
      let { at, to, pos } = options

      if (Path.isPath(at)) {
        at = [at]
      }

      const toKy = editor.item(to).ky
      ItemTransforms.insertBodyElementForItems(editor, {
        at: to,
        $isTop: !!editor.item(at[0]).$isTop,
      })

      const toPath = editor.itemPath(toKy)
      const toSubPath = editor.itemPathSubitems(toPath)

      // Calculate the item's sort weight using ORIGINAL position
      const [startWeight, endWeight] = calcWeight(editor, toPath, pos)
      const weightStep = (endWeight - startWeight) / (at.length + 1)

      const atRefs = at.map((p) => Editor.pathRef(editor, p))
      const toSubRef = Editor.pathRef(editor, toSubPath)

      // pos 修正：当移动的项与目标父项是同级，且在目标位置之前时，
      // 由于先 remove 后 insert，目标索引会发生偏移，需要减去这部分偏移量。
      let adjustedPos = pos
      if (typeof pos === 'number' && pos !== -1) {
        let shiftCorrection = 0
        const currentToSubPath = toSubRef.current
        if (currentToSubPath) {
          for (const ref of atRefs) {
            const p = ref.current
            if (
              p &&
              Path.equals(Path.parent(p), currentToSubPath) &&
              p[p.length - 1] < pos
            ) {
              shiftCorrection++
            }
          }
        }
        adjustedPos = pos - shiftCorrection
      }

      const calculatedPosition = calcPos(editor, toPath, adjustedPos)
      const newParentItem = editor.item(toPath)

      const nodesToMove: ItemNode[] = []
      for (let i = 0; i < atRefs.length; i++) {
        const pathRef = atRefs[i]
        const slPath = pathRef.current
        if (!slPath || !Node.has(editor, slPath)) continue
        const [movedItem, movedPath] = editor.itemEntry(slPath)
        const newParentItemPath =
          newParentItem?.path ??
          unstable_GlobalApp.addons.dbMemory.getItem(newParentItem.ky)?.path

        // An item's parent can neither be itself nor its child.
        if (
          movedItem.ky === newParentItem.ky ||
          newParentItemPath?.includes(movedItem.ky)
        ) {
          console.error(`An item's parent can neither be itself nor its child.`)
          continue
        }

        // Update the parent id
        ItemTransforms.setItems(editor, {
          at: movedPath,
          props: {
            pky: newParentItem.ky,
            weight: startWeight + weightStep * (i + 1),
          },
        })

        nodesToMove.push(Node.get(editor, movedPath) as ItemNode)
      }

      // Remove nodes in reverse order to maintain path validity
      for (const pathRef of [...atRefs].reverse()) {
        const slPath = pathRef.current
        if (slPath && Node.has(editor, slPath)) {
          Transforms.removeNodes(editor, { at: slPath })
        }
      }

      // Insert nodes in forward order at the calculated position
      for (let i = 0; i < nodesToMove.length; i++) {
        const insertPath = [...toSubRef.current!, calculatedPosition + i]
        Transforms.insertNodes(editor, nodesToMove[i], { at: insertPath })
      }

      atRefs.forEach((r) => r.unref())
      toSubRef.unref()

      const currentToPath = editor.itemPath(toKy)
      if (shouldReOrder(editor, currentToPath)) {
        ItemTransforms.reorderSubitems(editor, currentToPath)
      }
    })
  },

  moveItems(
    editor: ItemEditor,
    options: {
      at: Path | Path[]
      to: Path // the parent item's path
      pos?: number
    }
  ): void {
    Editor.withoutNormalizing(editor, () => {
      let { at, to, pos } = options

      if (Path.isPath(at)) {
        at = [at]
      }

      const toPath = editor.itemPath(to)
      ItemTransforms.insertBodyElementForItems(editor, {
        at: to,
        $isTop: !!editor.item(at[0]).$isTop,
      })

      const calculatedPosition = calcPos(editor, toPath, pos)
      const newParentItem = editor.item(toPath)

      // Calculate the item's sort weight
      const [startWeight, endWeight] = calcWeight(editor, toPath, pos)
      const weightStep = (endWeight - startWeight) / (at.length + 1)

      at.forEach((slPath, i) => {
        const [movedItem, movedPath] = editor.itemEntry(slPath)

        // An item's parent can neither be itself nor its child.
        if (
          movedItem.ky === newParentItem.ky &&
          newParentItem.path.includes(movedItem.ky)
        ) {
          console.error(`An item's parent can neither be itself nor its child.`)
          return
        }

        // Update the parent id
        ItemTransforms.setItems(editor, {
          at: slPath,
          props: {
            pky: newParentItem.ky,
            weight: startWeight + weightStep * (i + 1),
          },
        })

        Transforms.moveNodes(editor, {
          at: movedPath,
          to: [...editor.itemPathSubitems(toPath), calculatedPosition],
        })
      })

      if (shouldReOrder(editor, to)) {
        ItemTransforms.reorderSubitems(editor, to)
      }
    })
  },

  insertHeadElementFormItems(
    editor: ItemEditor,
    options: {
      at: Path
      $isTop?: boolean
    }
  ) {
    Transforms.insertNodes(
      editor,
      makeItemHead({ ori: '', $isTop: options.$isTop } as any),
      { at: editor.itemPathHead(options.at) }
    )
  },

  insertBodyElementForItems(
    editor: ItemEditor,
    options: {
      at: Path
      $isTop?: boolean
      subitems?: Partial<UnitPersist>[]
    }
  ) {
    Editor.withoutNormalizing(editor, () => {
      const { at, $isTop, subitems = [] } = options
      const bodyPath = editor.itemPathBody(at)
      if (!Node.has(editor, bodyPath)) {
        Transforms.insertNodes(
          editor,
          makeItemBody({ subitems, $isTop } as any, editor),
          { at: bodyPath }
        )
      }
    })
  },

  splitItems(
    editor: ItemEditor,
    options: {
      at: Range
    }
  ) {
    Editor.withoutNormalizing(editor, () => {
      const { at } = options
      if (Range.isRange(at)) {
        editor.deleteRange(at)
      }
      const leftRange = {
        anchor: {
          path: editor.itemPathText(at).concat(0),
          offset: 0,
        } as Point,
        focus: at.anchor,
      }

      const fragment = getRangeTextData(editor, leftRange)
      const pathRef = Editor.pathRef(editor, at.focus.path)
      editor.deleteRange(leftRange, { hanging: true })
      ItemTransforms.insertPrevItems(editor, {
        at: pathRef.unref() as Path,
        items: [
          Item.make(
            {
              ...extractItemProps(editor.item(at)),
              leaves: fragment,
            },
            { editor }
          ) as any,
        ],
      })
    })
  },

  foldupItems(
    editor: ItemEditor,
    options: {
      at: Path
      foldup?: boolean
    }
  ) {
    const { foldup = true, at } = options
    const item = editor.item(at)
    if (!isEmpty(item.topic) && (isEmpty(item.pky) || item.pky.length < 2)) {
      // If the item is a topic and has no parent, it can't be folded up.
      return
    }
    ItemTransforms.setItems(editor, {
      at,
      props: {
        foldup,
      },
    })
    if (!foldup && DIRTY_ITEMS_WEAKMAP.has(item)) {
      DIRTY_ITEMS_WEAKMAP.delete(item);
      const itemdata = unstable_GlobalApp.addons.dbMemory.getItem(item.ky, {isRecur: true})
      itemdata.foldup = foldup;
      editor.withoutSaving(()=>{
        HistoryEditor.withoutSaving(editor, ()=>{
          replaceSlateNode(editor, Item.make(itemdata, {editor}), at)
        })
      })
    }
  },

  /**
   * Foldup each sub item
   * @param editor
   * @param options
   */
  foldupSubItems(
    editor: ItemEditor,
    options: {
      at: Path
      foldup?: boolean
    }
  ) {
    const { at, foldup = true } = options
    const subPath = editor.itemPathSubitems(at)

    for (const [, path] of Node.children(editor, subPath)) {
      if (foldup && !editor.itemHasSubitems(path)) {
        continue
      }
      ItemTransforms.foldupItems(editor, {
        at: path,
        foldup,
      })
    }
  },

  setItems(
    editor: ItemEditor,
    options: {
      props: Partial<ItemNode>
      at: Path
    }
  ) {
    Transforms.setNodes(editor, options.props as any, {
      at: editor.itemPath(options.at),
    })
  },

  wrapItems(
    editor: ItemEditor,
    options: {
      at: Location
      props: Partial<UnitPersist>
    }
  ) {
    const { at, props } = options
    let ref: any
    if (Range.isRange(at)) {
      ref = Editor.rangeRef(editor, at)
    } else if (Point.isPoint(at)) {
      ref = Editor.pointRef(editor, at)
    } else if (Path.isPath(at)) {
      ref = Editor.pathRef(editor, at)
    } else {
      throw new Error('Invalid location')
    }
    const pos = editor.itemIndex(at)
    const parentPath = editor.itemPathParent(at)
    const newItem = Item.make(props, { editor })
    ItemTransforms.insertItems(editor, {
      at: parentPath,
      items: newItem,
      pos,
    })
    const loc = ref.unref()
    if (loc) {
      editor.itemIndent(loc)
    }
  },

  unwrapItems(editor: ItemEditor, options: { at: Path }) {
    const { at } = options
    const atRef = Editor.pathRef(editor, at)
    const subPath = editor.itemPathSubitems(at)
    const subCount = editor.itemCountSubitems(at)
    const range: Range = {
      anchor: {
        path: [...subPath, 0],
        offset: 0,
      },
      focus: {
        path: [...subPath, subCount - 1],
        offset: 1,
      },
    }
    editor.itemOutdent(range)
    ItemTransforms.removeItems(editor, { at: atRef.unref() as Path })
  },

  replaceText(
    editor: ItemEditor,
    options: { at: Path; text: string | Node[] }
  ) {
    const { at, text } = options
    const path = editor.itemPathText(at)
    if (editor.itemTextPlain(at).length > 0) {
      Transforms.select(editor, path)
      Transforms.delete(editor)
    }
    // Transforms.insertText(editor, text, { at: path })
    const frags = Node.isNodeList(text) ? text : ([{ text }] as Node[])
    Transforms.insertFragment(editor, frags, { at: path })
  },

  app: {} as App,
  config: {},

  addonRun() {},
}

export function createItemTransformsAddon({ app, $ }: NewAddonParams) {
  return ItemTransforms
}
