import { ItemEditor } from '../addons/EditorFactory/ItemEditor'
import { ItemNode } from '../interfaces/item'
import { Text, Path, Node, Editor, Transforms } from '../slate.inc'
import { isInfinity } from '../utils/number/isInfinity'
import { pick } from '../utils/object/pick'
import { deepClone } from '../utils/object/deepClone'

export function calcPos(
  editor: ItemEditor,
  itemPath: Path,
  pos?: number | undefined
) {
  const childElement: any = Node.get(editor, editor.itemPathSubitems(itemPath))
  let i = 0
  childElement.children.forEach((n: any) => {
    if (n.type === 'node') {
      i += 1
    }
  })
  if (typeof pos === 'undefined') {
    pos = 0
  } else if (pos === -1 || pos > i) {
    pos = i
  }
  return pos
}

/**
 * 根据一个 item 的前后节点，计算出它的排序权重值
 * @param editor
 * @param parentPath
 * @param pos 若 pos 等于 -1 或 Infinity，则表示在末尾添加
 * @returns
 */
export function calcWeight(
  editor: ItemEditor,
  parentPath: Path,
  pos = 0
): number[] {
  if (pos < 0 || isInfinity(pos)) {
    pos = editor.itemCountSubitems(parentPath) + pos + 1
  }
  const subPath = editor.itemPathSubitems(parentPath)
  const prevPath = subPath.concat(pos - 1)
  const nextPath = subPath.concat(pos)

  let prevWeight = 0
  let nextWeight = 0
  if (
    prevPath &&
    Node.has(editor, prevPath) &&
    !!editor.item(prevPath).weight
  ) {
    prevWeight = editor.item(prevPath).weight as number
  }
  if (Node.has(editor, nextPath) && !!editor.item(nextPath).weight) {
    nextWeight = editor.item(nextPath).weight as number
  }
  if (!prevWeight && nextWeight) {
    prevWeight = nextWeight / 2
  }
  if (!nextWeight && prevWeight) {
    nextWeight = prevWeight + 1000
  }

  prevWeight ||= 4000
  nextWeight ||= 6000
  return [prevWeight, nextWeight]
}

export function extractItemProps(item: ItemNode): Partial<ItemNode> {
  return pick(item, ['blockType', 'pky'])
}

/**
 * Check whether an item's subitems need re-order
 *
 * If one the subitem's weight is empty or less than one, then re-order is needed.
 * @param editor
 * @param itemPath
 * @returns
 */
export function shouldReOrder(editor: ItemEditor, itemPath: Path): boolean {
  const subPath = editor.itemPathSubitems(itemPath)
  if (!Node.has(editor, subPath)) {
    return false
  }
  let flag = false
  const weights: number[] = []
  for (const [node] of Node.children(editor, subPath)) {
    const item = node as ItemNode
    if (!item.weight || item.weight < 1 || weights.includes(item.weight)) {
      flag = true
    }
    weights.push(item.weight || 0)
  }

  // weights 是否单调递增
  const w = [...weights].sort()
  if (w.join(',') !== weights.join(',')) {
    flag = true
  }

  return flag
}

/**
 * 用一个新的节点替换一个节点
 * @param editor
 * @param newNode
 * @param options
 */
export function replaceSlateNode(editor: ItemEditor, newNode: ItemNode, at: Path) {
  const pathRef = Editor.pathRef(editor, at)
  if (pathRef.current) {
    Transforms.insertNodes(editor, newNode as Node, { at: pathRef.current })
    Transforms.removeNodes(editor, { at: pathRef.unref()! })
  }
}
