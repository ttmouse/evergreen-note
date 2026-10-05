import { createItemEditor, ItemEditor } from './ItemEditor'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import {
  withReact,
  withHistory,
  NodeEntry,
  Node,
  Element,
} from '../../slate.inc'
import { editorCommands } from './editor.cmd'
import { ItemTransforms } from '../../transforms/item'
import { isEmpty } from '../../utils/isEmpty'
import { Item, ItemEntry, ItemNode } from '../../interfaces/item'
import { pub } from '../../utils/pub'
import { shouldReIndex } from '../../transforms/calcOrder'

export type EditorPlugins = { [method: string]: (editor: ItemEditor) => void }
type StrategyFunc = (node: any) => boolean

const ABORT_NORMALIZE = false

/**
 * 为解决整个文档被重复渲染的问题，使用一个全局变量来记录正被修改的节点
 * 使得在渲染时，只需渲染这些被修改了的节点
 */
export const ITEM_CHANGED = {} as any

export function createEditorFactoryAddon({ app, $ }: NewAddonParams) {
  class EditorFactory implements IAddon {
    app!: App
    config = {}

    plugins: EditorPlugins = {
      withHistory,
      withReact,
      withNormalize: (editor: ItemEditor) => {
        const { normalizeNode } = editor
        editor.normalizeNode = (entry) => {
          if ($.editorFactory.normalize(editor, entry)) {
            normalizeNode(entry)
          }
        }
      },
    }

    isVoidMethods: StrategyFunc[] = []
    /**
     * 注册一些函数, 用于判断某个元素是否是 void 元素
     */
    addIsVoidMethod(isVoid: StrategyFunc) {
      this.isVoidMethods.push(isVoid)
    }

    isInlineMethods: StrategyFunc[] = []
    /**
     * 注册一些函数, 用于判断某个元素是否是 inline 元素
     */
    registerIsInlineMethod(isInline: StrategyFunc) {
      this.isInlineMethods.push(isInline)
    }

    addPlugins(plugins: EditorPlugins) {
      Object.assign(this.plugins, plugins)
    }

    itemChangeCache(item: ItemNode) {
      const changedCount = (ITEM_CHANGED[item.$id] || 0) + 1
      ITEM_CHANGED[item.$id] = changedCount
    }

    normalize(editor: ItemEditor, entry: NodeEntry) {
      // ATTENTION: Normalize Logic Changed!!!
      const [node, path] = entry as ItemEntry
      if (Item.isItemNode(node)) {
        $.editorFactory.itemChangeCache(node)
        // console.log(node.ori, changedCount);

        // Ensure each item node to have a `node-head` element
        if (
          !node.children?.some(
            (child) => (child as any).type === Item.partTypes.head
          )
        ) {
          ItemTransforms.insertHeadElementFormItems(editor, {
            at: path,
            $isTop: !!node.$isTop,
          })
          return ABORT_NORMALIZE
        }

        // 确保 topic 顶级节点至少有一个子节点
        // if (
        //   !node.$isRefer &&
        //   (node.$requireChildren || !isEmpty(node.topic)) &&
        //   node.$isTop &&
        //   !editor.itemHasSubitems(path)
        // ) {
        //   ItemTransforms.insertBodyElementForItems(editor, {
        //     at: path,
        //   })
        //   ItemTransforms.insertItems(editor, { at: path, focus: true })
        //   return ABORT_NORMALIZE
        // }

        // 确保每个 item.weight 值都大于它的 prevItem.weight，小于它的 nextItem.weight
        // 我们需要处理一下 如果能找到父节点而且父节点是临时的，就不能更新 weight
        // 这个问题是因为在处理引用时，引用的节点是临时的，所以顺序并不是真正的顺序，那就不更新
        // 否则节点顺序会乱掉
        // const { parentIsTmp } = Item.isParentsTmpByDom(node);
        // if (!parentIsTmp) {
        //   const parentSubPath = path.slice(0, -1)
        //   if (parentSubPath.length > 0) {
        //     const parentSub = Node.get(editor, parentSubPath)
        //     if (shouldReIndex((parentSub as Element).children as any)) {
        //       ItemTransforms.reorderSubitems(editor, parentSubPath)
        //     }
        //   }
        // }

        // if (
        //   $.orderedList?.isOrderedList(node as UnitPersist) &&
        //   $.blockStyle?.hasStyle(node, 'headless')
        // ) {
        //   setTimeout(() => {
        //     if (!editor.itemHasSubitems(path)) {
        //       editor.itemRemove(path)
        //     }
        //   }, 10)
        // }

        if (!pub.emit(pub.evt.editorNormalized, editor, entry as ItemEntry)) {
          return ABORT_NORMALIZE
        }
      }
      return true
    }

    addonCommands() {
      return editorCommands()
    }

    create(editorId?: string | number): ItemEditor {
      const editor = createItemEditor({ app: this.app, editorId })
      for (const [name, withMethod] of Object.entries(this.plugins)) {
        withMethod(editor)
      }

      const { isVoid, isInline } = editor
      editor.isVoid = (node: any) => {
        for (const method of this.isVoidMethods) {
          if (method(node)) {
            return true
          }
        }
        return isVoid.call(editor, node)
      }

      editor.isInline = (node: any) => {
        for (const method of this.isInlineMethods) {
          if (method(node)) {
            return true
          }
        }
        return isInline.call(editor, node)
      }

      return editor
    }

    addonRun() { }
  }

  return { editorFactory: new EditorFactory() }
}
