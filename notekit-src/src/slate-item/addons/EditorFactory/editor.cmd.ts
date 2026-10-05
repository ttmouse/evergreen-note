import {
  Path,
  Editor,
  Range,
  Point,
  Node,
  Element,
  Transforms,
  ReactEditor,
} from '../../slate.inc'
import { keyState } from '../KeyClick/helper'
import { CommandParams } from '../../engine/App'
import { ItemTransforms } from '../../transforms/item'
import { checkCaret } from '../EventHandler/checkCaret'
import { pub } from '../../utils/pub'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { showSnack } from '../../utils/msg/showSnack'
import { $t } from '../../../i18n'
import { isEmpty } from '../../utils/isEmpty'
import { PREVENT_DEFAULT, ALLOW_DEFAULT } from '../EventHandler/EventHandler'
import { Item, makeItemQuote } from '../../interfaces/item'
import { ZERO_WIDTH_SPACE } from '../Strmap/Strmap'
import { browser } from '@/slate-item/utils/browser'
import { atLater } from '@/slate-item/utils/atLater'

/**
 * 光标是否落在一个 inline 元素（双链、引用、嵌入块等）之内或之上。
 * 引用是镜像渲染，光标可能深入镜像内部，因此沿祖先链逐级检查：
 * 1. focus.path 直接指向 inline 元素（塌缩在节点上）
 * 2. focus.path 的任意祖先是 inline 元素（光标在节点/镜像内部）
 */
const isCaretInsideInlineNode = (editor: any, point?: { path: number[] }): boolean => {
  const selection = editor.selection
  if (!selection || !Range.isCollapsed(selection)) return false
  try {
    const path = point ? point.path : selection.focus.path
    for (let depth = 1; depth <= path.length; depth++) {
      const node = Node.get(editor, path.slice(0, depth))
      if (Element.isElement(node) && node.inline) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 若光标落在某个 inline 元素内部（含引用镜像深处），把光标提升为
 * 「塌缩在该 inline 元素上」（整节点选中态），而不是停在节点文字里。
 * 引用块由此获得 Roam 式的整块选中表现，↑/↓ 下一次按即可越过。
 */
const parkCaretOnTopmostInline = (editor: any) => {
  try {
    const path = editor.selection?.focus?.path
    if (!path) return
    for (let depth = 1; depth <= path.length; depth++) {
      const node = Node.get(editor, path.slice(0, depth))
      if (Element.isElement(node) && node.inline) {
        Transforms.select(editor, {
          anchor: { path: path.slice(0, depth), offset: 0 },
          focus: { path: path.slice(0, depth), offset: 0 },
        })
        return
      }
    }
  } catch {
    // 选区已在常态位置，无需处理
  }
}

/**
 * 当前 item 的正文是否包含 inline 元素（引用块 `(())`、双链块等）。
 * 这类块的正文是镜像渲染，↑/↓ 应把整个 item 当原子单元跳过。
 */
const itemHeadHasInline = (editor: any): boolean => {
  try {
    return editor.itemLeaves().some((l: any) => Element.isElement(l) && l.inline)
  } catch {
    return false
  }
}

/**
 * 在 Slate 树中按 $id 找 item 的路径。
 */
const findItemPathById = (editor: any, id: string): number[] | null => {
  const walk = (node: any, path: number[]): number[] | null => {
    if (node.$id === id) return path
    if (!node.children) return null
    for (let i = 0; i < node.children.length; i++) {
      const found = walk(node.children[i], [...path, i])
      if (found) return found
    }
    return null
  }
  return walk(editor.children, [])
}

/**
 * 按 DOM 可见顺序取当前块的上/下一个可视块。
 * 引用镜像会让 itemPathNext/Prev 失真（镜像子块是临时节点：
 * prev 返回 null、next 落到父级容器），因此以用户实际看到的
 * 块顺序为准，排除镜像内部（.inline-content）与隐藏（折叠）的块。
 */
const adjacentVisibleItemPath = (
  editor: any,
  dir: 'up' | 'down'
): number[] | null => {
  try {
    const item = editor.item()
    const currentEl =
      document.getElementById(item.$id) ||
      (document.querySelector('.node-active') as HTMLElement | null)
    if (!currentEl) return null
    // 光标若在镜像内部，先归位到引用所在的可见块
    const inMirror = currentEl.closest('.inline-content')
    const anchorEl = (inMirror?.closest('.node') as HTMLElement) || currentEl
    const nodes = Array.from(
      document.querySelectorAll('.node')
    ).filter(
      (el: Element) =>
        !el.closest('.inline-content') &&
        (el as HTMLElement).offsetParent !== null
    ) as HTMLElement[]
    const idx = nodes.indexOf(
      (anchorEl.closest('.node') as HTMLElement) || anchorEl
    )
    if (idx < 0) return null
    const target = nodes[idx + (dir === 'down' ? 1 : -1)]
    if (!target || !target.id) return null
    return findItemPathById(editor, target.id)
  } catch {
    return null
  }
}

/**
 * ↑/↓ 是块间移动：把 inline 节点（双链、引用、嵌入块等）当整体跳过，
 * 光标不应停留或进入节点内部。编辑引用文本用 ←/→ 或鼠标（水平方向不受限）。
 * 两种触发：光标已在 inline 节点内/上，或当前 item 正文含 inline 元素
 * （引用镜像的光标在镜像内部时，keydown 不会进入主编辑器，只能靠
 * 「含 inline 的 item 一律原子跳过」在进入前拦下）。
 */
const caretJumpPastInline = (editor: any, dir: 'up' | 'down'): boolean => {
  if (!isCaretInsideInlineNode(editor) && !itemHeadHasInline(editor)) return false
  const item = editor.item()
  if (dir === 'down') {
    // 引用/镜像块旁 itemPath* 会失真，优先按 DOM 可见顺序找目标
    const domPath = adjacentVisibleItemPath(editor, 'down')
    const nextPath = domPath
      ? domPath
      : editor.itemHasSubitems() && !item.foldup
        ? editor.itemPathFirstSubitem()
        : editor.itemPathNext()
    if (nextPath) {
      editor.itemFocus(nextPath)
      parkCaretOnTopmostInline(editor)
      return true
    }
  } else {
    const domPath = adjacentVisibleItemPath(editor, 'up')
    const prevPath = domPath || editor.itemPathPrev()
    if (prevPath) {
      editor.itemFocusEnd(prevPath)
      parkCaretOnTopmostInline(editor)
      return true
    }
  }
  return false
}

/**
 * 方向键「卡死看门狗」：↑/↓ 先放行给默认行为，随后检查光标是否真的移动了。
 * 未移动且存在相邻 item 时显式移动到相邻 item。卡死可能发生在
 * inline 节点上/内部，也可能在节点旁的零宽文本边界，故不限定 inline 条件。
 * （caretJumpPastInline 已在按键时拦截块间跳过，这里兜底其余失效场景。）
 */
const armCaretWatchdog = (
  editor: any,
  dir: 'up' | 'down'
) => {
  const before = editor.selection?.focus
  if (!before) return
  atLater(
    () => {
      const after = editor.selection?.focus
      if (!after) return
      const unmoved =
        Path.equals(before.path as any, after.path as any) &&
        before.offset === after.offset
      if (!unmoved) return
      if (dir === 'down') {
        const item = editor.item()
        const nextPath =
          adjacentVisibleItemPath(editor, 'down') ||
          (editor.itemHasSubitems() && !item.foldup
            ? editor.itemPathFirstSubitem()
            : editor.itemPathNext())
        if (nextPath) {
          editor.itemFocus(nextPath)
          parkCaretOnTopmostInline(editor)
        }
      } else {
        const prevPath =
          adjacentVisibleItemPath(editor, 'up') || editor.itemPathPrev()
        if (prevPath) {
          editor.itemFocusEnd(prevPath)
          parkCaretOnTopmostInline(editor)
        }
      }
    },
    `caret-watchdog-${dir}`,
    0
  )
}

export const editorCommands = (): HotkeyMaps => ({
  caretUp: {
    hotkey: 'up',
    title: $t`hotkey.up`,
    handle: ({ editor }) => {
      if (caretJumpPastInline(editor, 'up')) return PREVENT_DEFAULT
      armCaretWatchdog(editor, 'up')
      return ALLOW_DEFAULT
    },
  },

  caretDown: {
    hotkey: 'down',
    title: $t`hotkey.down`,
    handle: ({ editor }) => {
      if (caretJumpPastInline(editor, 'down')) return PREVENT_DEFAULT
      armCaretWatchdog(editor, 'down')
      return ALLOW_DEFAULT
    },
  },

  caretLeft: {
    hotkey: 'left',
    title: $t`hotkey.left`,
    handle: ({ editor }) => {
      const isCaret = checkCaret(editor)
      if (isCaret.atTextBegin() || isCaret.atEmptyText()) {
        const prevPath = editor.itemPathPrev()
        if (!prevPath && editor.itemParent().$isTop) {
          return PREVENT_DEFAULT
        }
        if (prevPath && editor.item(prevPath).foldup) {
          editor.itemFocusEnd(prevPath)
          return PREVENT_DEFAULT
        }
      }
      return ALLOW_DEFAULT
    },
  },

  caretRight: {
    hotkey: 'right',
    title: $t`hotkey.right`,
    handle: ({ editor }) => {
      const isCaret = checkCaret(editor)
      if (isCaret.atTextEnd() && editor.item().foldup) {
        const pathNext = editor.itemPathNext()
        if (pathNext) {
          editor.itemFocus(pathNext)
          return PREVENT_DEFAULT
        }
      }
      return ALLOW_DEFAULT
    },
  },

  moveDown: {
    hotkey: 'mod+shift+down',
    title: $t`hotkey.move_item_down`,
    handle: ({ editor }) => {
      ItemTransforms.moveDownItems(editor, { at: editor.itemPath() })
      return PREVENT_DEFAULT
    },
  },

  moveUp: {
    hotkey: 'mod+shift+up',
    title: $t`hotkey.move_item_up`,
    handle: ({ editor }) => {
      ItemTransforms.moveUpItems(editor, { at: editor.itemPath() })
      return PREVENT_DEFAULT
    },
  },

  collapseChildren: {
    hotkey: 'mod+up',
    title: $t`hotkey.collapse_children`,
    handle: ({ editor }) => {
      editor.itemFoldup(true, editor.itemPath())
      return PREVENT_DEFAULT
    },
  },

  expandChildren: {
    hotkey: 'mod+down',
    title: $t`hotkey.expand_children`,
    handle: ({ editor }) => {
      editor.itemFoldup(false, editor.itemPath())
      return PREVENT_DEFAULT
    },
  },

  // moveRight: {
  //   hotkey: 'mod+right',
  //   title: $t`hotkey.move_item_right`,
  //   handle: ({ editor }) => {
  //     ItemTransforms.moveDownItems(editor, { at: editor.itemPath() });
  //     return PREVENT_DEFAULT;
  //   },
  // },

  // moveUp2: {
  //   hotkey: 'mod+left',
  //   title: $t`hotkey.move_item_left`,
  //   handle: ({ editor }) => {
  //     ItemTransforms.outdentSubItems(editor, { at: editor.itemPath() });
  //     // ItemTransforms.moveUpItems(editor, { at: editor.itemPath() });
  //     return PREVENT_DEFAULT;
  //   },
  // },

  indent: {
    hotkey: 'tab',
    title: $t`hotkey.indent`,
    versions: {
      py: { v: 'suo jin' },
      pys: { v: 'sj' },
      cn: { v: '缩进' },
    },
    handle: ({ editor }: CommandParams) => {
      if (!editor.itemParent().$isTmp) {
        editor.itemIndent()
      }
    },
  },

  fixedOutdent: {
    hotkey: 'alt+shift+tab',
    title: $t`hotkey.fixed_outdent`,
    handle: ({ editor }) => {
      const { parentIsTmp, grandParentIsTmp } = Item.editorIsParentTmp(editor)
      if (parentIsTmp || grandParentIsTmp) return PREVENT_DEFAULT
      const atRef = Editor.pathRef(editor, editor.itemPath())
      if (atRef.current && editor.itemDepth(atRef.current) > 1) {
        const pos = atRef.current[atRef.current.length - 1]
        for (let i = 0; i < 1000; i++) {
          const next = atRef.current.slice(0, -1).concat(pos + 1)
          if (Editor.hasPath(editor, next)) {
            ItemTransforms.moveItems(editor, {
              at: next,
              to: atRef.current,
              pos: Infinity,
            })
          } else {
            break
          }
        }
        editor.itemOutdent(atRef.unref()!)
      }
    },
  },

  outdent: {
    hotkey: 'shift+tab',
    title: $t`hotkey.outdent`,
    handle: ({ editor }: CommandParams) => {
      const { parentIsTmp, grandParentIsTmp } = Item.editorIsParentTmp(editor)
      if (!parentIsTmp && !grandParentIsTmp) {
        editor.itemOutdent()
      }
    },
  },

  zoomIn: {
    hotkey: 'mod+i',
    title: $t`hotkey.zoom_in`,
    handle: ({ editor, app }) => {
      const item = editor.item()
      keyState.pressed.ctrl = 0;
      keyState.pressed.meta = 0;
      app.addons.router.to(item);
    },
  },

  addQuote: {
    hotkey: 'alt+enter',
    title: 'Add quote',
    handle: ({ editor }) => {
      const item = editor.item();
      if (item.ky.endsWith('moment')) return PREVENT_DEFAULT;
      if (checkCaret(editor).atQuote()) {
        editor.itemFocusEnd()
        return ALLOW_DEFAULT
      }

      if (!Editor.hasPath(editor, editor.itemPathQuote())) {
        Transforms.insertNodes(editor, makeItemQuote({ quote: '' }), {
          at: editor.itemPathQuote(),
        })
      }
      Transforms.select(editor, [...editor.itemPathQuote(), 0])
      Transforms.collapse(editor, { edge: 'end' })
      Transforms.insertText(editor, ZERO_WIDTH_SPACE)
    },
  },

  insertItem: {
    hotkey: 'enter',
    title: $t`hotkey.insert_item`,
    handle: ({ editor, app, event }: CommandParams) => {
      if (!editor.selection) {
        return ALLOW_DEFAULT
      }
      const $ = app.addons

      if ($.editorView.autoCompleteStatus) {
        return PREVENT_DEFAULT
      }

      const evt = (event as React.KeyboardEvent).nativeEvent;

      if (evt.isComposing || evt.keyCode === 229) {
        return ALLOW_DEFAULT;
      }

      const { anchor } = editor.itemSelection()
      const isCaret = checkCaret(editor)

      // 处理行内元素
      const path = editor.selection?.anchor.path

      if (
        $.eventHandler.doubleEnterCheck({ editor, item: anchor.item, path })
      ) {
        if (/\n{1,}$/.test(editor.itemTextPlain(path)) === false) {
          editor.insertText('\n')
          return PREVENT_DEFAULT
        }
        editor.deleteBackward('character')
      }

      // FIXED: 当光标处于行内元素末尾与\b之间时, 换行会复制这行内元素
      // if (Node.string(Node.get(editor, path)).startsWith(ZERO_WIDTH_SPACE)) {
      //   Transforms.move(editor, {
      //     distance: 1,
      //     unit: 'character',
      //   });
      // }

      // console.log(editor.itemTextAfterCaret())

      // if (
      //   !isEmpty(anchor.item.blockType) &&
      //   isCaret.atEmptyText() &&
      //   editor.itemHasNothing(path)
      // ) {
      //   ItemTransforms.setItems(editor, {
      //     at: path,
      //     props: {
      //       blockType: undefined,
      //     },
      //   });
      //   return PREVENT_DEFAULT;
      // }

      if (
        path &&
        editor.isInline(Node.parent(editor, path)) &&
        !isCaret.atTextEnd()
      ) {
        // 行内元素不允许拆行
        pub.emit(pub.evt.editorEnterInline, {
          editor,
          inlineElement: Node.parent(editor, path),
        })
        return PREVENT_DEFAULT
      }
      const { parentIsTmp, grandParentIsTmp } = Item.editorIsParentTmp(editor);
      if (parentIsTmp) {
        editorCommands().insertSubitem.handle({ editor, app, event });
        return PREVENT_DEFAULT;
      }

      if (
        isCaret.atTitle() ||
        (editor.itemHasSubitems() && isCaret.atTextEnd())
      ) {
        // 光标在标题区域, 或者光标所在的节点有子节点、且光标在句末
        if (editor.itemDepth() > 0 && editor.itemIsFoldup()) {
          // 光标所在的节点折叠状态, 则在该节点之后创建新的同级节点
          ItemTransforms.insertNextItems(editor, { at: anchor.path })
          editor.itemFocus(editor.itemPathNext() as Path)
        } else {
          // 光标所在的节点非折叠状态, 则在该节点之内创建新的子节点
          ItemTransforms.insertItems(editor, { at: anchor.path })

          const range = editor.selection as Range
          if (!Range.isCollapsed(range)) {
            editor.deleteRange(range)
          }
          editor.itemFocus(editor.itemPathFirstSubitem())
        }
        return PREVENT_DEFAULT
      }

      if (
        isCaret.atEmptyText() &&
        editor.itemDepth() > 1 &&
        !editor.itemHasNext()
      ) {
        if (!isEmpty(anchor.item.placeholder)) {
          ItemTransforms.insertNextItems(editor, {
            at: anchor.path,
            focus: true,
          })
          return PREVENT_DEFAULT
        }
        // 光标所在的节点文本内容为空,
        // 且光标所在的节点的父节点不是根节点,
        // 且光标所在的节点没有下一个节点,
        // 则回缩
        if (grandParentIsTmp) return PREVENT_DEFAULT
        editor.itemOutdent()
        return PREVENT_DEFAULT
      }

      if (isCaret.atTextBegin()) {
        // 光标在文本内容开头, 则在该节点之前创建新的同级节点
        const pathRef = Editor.pathRef(
          editor as any,
          editor.selection?.anchor.path as Path,
          {
            affinity: 'backward',
          }
        )
        ItemTransforms.insertPrevItems(editor, {
          at: anchor.path,
          focus: ALLOW_DEFAULT,
        })
        // editor.itemFocus(pathRef.current as any);
        pathRef.unref()
        return PREVENT_DEFAULT
      }
      if (isCaret.atTextEnd()) {
        // 光标在文本内容末尾, 则在该节点之后创建新的同级节点

        const params = {
          editor,
          item: anchor.item,
          path: anchor.path,
          itemDom: anchor.itemDom,
        }

        if ($.eventHandler.handleFollow(params) === PREVENT_DEFAULT) {
          return PREVENT_DEFAULT
        }

        if (app.addons.eventHandler.checkEnterIndentRules(params)) {
          ItemTransforms.insertItems(editor, {
            at: anchor.path,
            focus: ALLOW_DEFAULT,
          })
        } else {
          ItemTransforms.insertNextItems(editor, {
            at: anchor.path,
            focus: ALLOW_DEFAULT,
          })
        }

        return PREVENT_DEFAULT
      }

      if (isCaret.atQuote()) {
        ReactEditor.focus(editor as any)
        ItemTransforms.insertNextItems(editor, {
          at: path,
          focus: true,
        })
        return PREVENT_DEFAULT
      }

      // 光标在文本中间，拆分当前节点
      const currentPathRef = Editor.pathRef(editor as any, editor.itemPath())
      ItemTransforms.splitItems(editor, { at: editor.selection as Range })
      const currentPath = currentPathRef.unref()!
      editor.itemFocus(currentPath)
      return PREVENT_DEFAULT
    },
  },

  softBreak: {
    hotkey: 'shift+enter',
    title: $t`hotkey.soft_break`,
    handle({ editor }) {
      editor.insertFragment([{ text: '\n' }])
    },
  },

  insertSubitem: {
    hotkey: 'mod+enter',
    title: $t`hotkey.insert_subitem`,
    handle({ editor }: CommandParams) {
      if (editor.itemIsFoldup()) {
        ItemTransforms.foldupItems(editor, {
          at: editor.itemPath(),
          foldup: PREVENT_DEFAULT,
        })
      }
      ItemTransforms.insertItems(editor, {
        at: editor.itemPath(),
        pos: 0,
      })
      editor.itemFocus(editor.itemPathFirstSubitem())
    },
  },

  deleteBackward: {
    hotkey: 'backspace',
    title: $t`hotkey.delete_backward`,
    handle: ({ editor, app, event }: CommandParams) => {
      if (!editor.selection) {
        return ALLOW_DEFAULT
      }

      const evt = (event as React.KeyboardEvent).nativeEvent;

      if (evt.isComposing || evt.keyCode === 229) {
        return ALLOW_DEFAULT;
      }

      const isCaret = checkCaret(editor)
      const selection = editor.selection as Range

      const [item, path] = editor.itemEntry()
      if (
        !isEmpty(item.blockType) &&
        isCaret.atEmptyText() &&
        editor.itemHasNothing(path)
      ) {
        ItemTransforms.setItems(editor, {
          at: path,
          props: {
            blockType: undefined,
          },
        })
        return PREVENT_DEFAULT
      }

      try {
        if (
          isCaret.atDocFirstItem() &&
          editor.itemHasNothing() &&
          Range.isCollapsed(editor.selection)
        ) {
          if (Array.from(editor.itemNextAll()).length > 0) {
            editor.itemRemove(path)
          }
          return PREVENT_DEFAULT
        }

        if (editor.itemSelection().isMulti) {
          const sel = editor.selection
          const [, abovePath] = editor.itemEntryAbove(Editor.start(editor, sel))
          // itemFocusEnd() 要先于 removeItems() 执行,
          // 否则会触发 Slate 对所有叶子节点的遍历, 非常慢
          editor.itemFocusEnd(abovePath)
          editor.itemsBatch(ItemTransforms.removeItems, {
            at: sel,
          })
          return PREVENT_DEFAULT
        }
        if (Range.isCollapsed(selection) && isCaret.atTextBegin()) {
          const prevPath = editor.itemPathPrev()
          if (prevPath) {
            if (editor.itemHasNothing(prevPath)) {
              editor.itemRemove(prevPath)
            } else {
              // Merge current item with previous item
              const [, lastPath] = Editor.last(editor as Editor, prevPath)
              const lastItemPath = editor.itemPath(lastPath)
              const pathRef = Editor.pathRef(editor as Editor, path)
              const pathRef2 = Editor.pathRef(editor as Editor, lastItemPath)

              // before merging items,
              // we need know if there are any references to the active item
              // if there are, we should treat the active item as a receiver
              const { refer } = app.addons
              if (refer && refer.getCount(item.ky) > 0) {
                editor.itemMerge(path, lastItemPath)
                ItemTransforms.removeItems(editor, {
                  at: pathRef2.current as Path,
                })
              } else {
                editor.itemMerge(lastItemPath, path)
                ItemTransforms.removeItems(editor, {
                  at: pathRef.current as Path,
                })
              }
              pathRef.unref()
              pathRef2.unref()
            }
          } else if (editor.itemDepth() > 1) {
            const pathRef = Editor.pathRef(editor as Editor, editor.itemPath())
            editor.itemMerge(editor.itemPathParent(), editor.itemPath())
            ItemTransforms.removeItems(editor, {
              at: pathRef.unref() as Path,
            })
          }
          return PREVENT_DEFAULT
        }
        if (editor.itemHasNothing()) {
          const prevPath = editor.itemPathPrev()
          if (
            prevPath &&
            editor.itemHasNothing(prevPath) &&
            isEmpty(editor.item(prevPath)?.placeholder)
          ) {
            editor.itemRemove(prevPath)
            return PREVENT_DEFAULT
          }
          const pathRef = Editor.pathRef(editor, editor.itemPath())
          const [, abovePath] = editor.itemEntryAbove(editor.itemPath())
          editor.itemFocusEnd(abovePath)
          editor.itemRemove(pathRef.unref() as Path)
          return PREVENT_DEFAULT
        }

        const prevPath = editor.itemPathPrev()
        if (
          prevPath &&
          isCaret.atTextBegin() &&
          !editor.itemHasNothing() &&
          editor.itemHasNothing(prevPath)
        ) {
          editor.itemRemove(prevPath)
          return PREVENT_DEFAULT
        }

        if (editor.selection.anchor.offset < 1) {
          try {
            // 对于行内元素, 当鼠标在其末尾时, 则直接删除该元素
            const inlinePrev = Path.previous(editor.selection.anchor.path)
            const elePrev = Node.get(editor, inlinePrev)
            if (Element.isElement(elePrev)) {
              Transforms.removeNodes(editor, { at: inlinePrev })
              return PREVENT_DEFAULT
            }
          } catch (e) {
            // do nothing
          }
        }
      } catch (err) {
        console.error(err)
      }

      if (
        isCaret.atEmptyText() &&
        editor.itemCountSubitems() > 0 &&
        Range.isCollapsed(editor.selection)
      ) {
        // 当前节点还存在下级节点，不能删除，需要先删除下级节点，或者使用 alt + backspace
        showSnack({
          severity: 'info',
          content:
            'Can not remove a non-empty item, please delete its subitems first, or try alt+backspace',
        })
        return PREVENT_DEFAULT
      }

      return ALLOW_DEFAULT
    },
  },

  altDeleteBackward: {
    hotkey: 'alt+backspace',
    title: $t`hotkey.delete_word_backward`,
    handle: ({ editor }: CommandParams) => {
      if (
        Editor.isStart(
          editor,
          editor.selection?.anchor as Point,
          editor.itemPathText()
        )
      ) {
        const path = editor.itemPath()
        const [, abovePath] = editor.itemEntryAbove(path)
        editor.itemFocusEnd(abovePath)
        editor.itemRemove(path)
        return PREVENT_DEFAULT
      }
      return ALLOW_DEFAULT
    },
  },

  altDeleteForward: {
    hotkey: 'alt+delete',
    title: $t`hotkey.delete_word_forward`,
    handle: ({ editor }: CommandParams) => {
      if (
        Editor.isStart(
          editor,
          editor.selection?.anchor as Point,
          editor.itemPathText()
        )
      ) {
        const path = editor.itemPath()
        const [, abovePath] = editor.itemEntryAbove(path)
        editor.itemFocusEnd(abovePath)
        editor.itemRemove(path)
        return PREVENT_DEFAULT
      }
      return ALLOW_DEFAULT
    },
  },

  deleteForward: {
    hotkey: 'delete',
    title: $t`hotkey.delete_forward`,
    handle: ({ editor }: CommandParams) => {
      try {
        const selection = editor.selection as Range
        if (Range.isCollapsed(selection)) {
          if (editor.itemHasNothing()) {
            ItemTransforms.removeItems(editor, {
              at: editor.itemSelection().anchor.path,
            })
            return PREVENT_DEFAULT
          }
        } else {
          editor.itemsBatch(ItemTransforms.removeItems)
          return PREVENT_DEFAULT
        }
      } catch (err) {
        // void
      }
      return ALLOW_DEFAULT
    },
  },

  deleteItem: {
    hotkey: 'mod+backspace',
    title: $t`hotkey.delete_item`,
    handle: ({ editor }: CommandParams) => {
      try {
        if (editor.itemTextPlain().length < 1) {
          editor.itemRemove()
          return PREVENT_DEFAULT
        }
        // editor.itemSelect(editor.itemPathText())
        // Transforms.delete(editor)
        // return PREVENT_DEFAULT
      } catch (e) {
        // void
      }
      return ALLOW_DEFAULT
    },
  },

  deleteItem2: {
    hotkey: ['shift+backspace', 'mod+shift+backspace'],
    title: $t`hotkey.delete_item_directly`,
    handle: ({ editor }: CommandParams) => {
      if (browser.isMobile) return ALLOW_DEFAULT
      const dom = document.querySelector(
        `article[editor-id="${editor.editorId}"]`
      )
      if (
        dom &&
        (dom.parentNode as HTMLElement)?.classList.contains('inline-content')
      )
        return ALLOW_DEFAULT
      editor.itemRemove()
      return PREVENT_DEFAULT
    },
  },

  selectAll: {
    hotkey: 'mod+a',
    title: $t`hotkey.select_all`,
    handle: ({ editor }: CommandParams) => {
      const selection = editor.selection as Range
      const isCaret = checkCaret(editor)
      const { anchor } = editor.itemSelection()

      if (isCaret.atQuote()) {
        if (Range.isCollapsed(selection)) {
          Transforms.select(editor, editor.itemPathQuote())
          return PREVENT_DEFAULT
        }
        Transforms.select(editor, editor.itemPathHead())
        return PREVENT_DEFAULT
      }
      if (Range.isCollapsed(selection) && !isCaret.atEmptyText()) {
        if (anchor.item.foldup) {
          // FIX: 当折叠的时候，由于子节点有可能未渲染，全选节点会导致报错
          ItemTransforms.foldupItems(editor, {
            at: anchor.path,
            foldup: PREVENT_DEFAULT,
          })
        }
        editor.itemSelect(editor.itemPathText())
        return PREVENT_DEFAULT
      }

      const parentPath = editor.itemPathParent(anchor.path)
      if (parentPath.length > 1) {
        editor.itemSelect(parentPath)
      } else {
        // 对于顶级节点, 全选只选中全部的子节点, 而不包括顶级节点本身
        editor.itemSelect(editor.itemPathSubitems(parentPath))
      }
    },
  },

  foldupSibilings: {
    hotkey: 'mod+e',
    title: $t`hotkey.expand_collapse_siblings`,
    icon: 'svg_fold_sibilings',
    handle: ({ editor, app }: CommandParams) => {
      const item = editor.item()
      const persist = app.addons.dbMemory.getItem(item.ky)
      const willFoldup = !persist.foldup
      editor.itemFoldupSiblings(willFoldup)
    },
  },

  openRightSide: {
    hotkey: 'mod+.',
    title: '打开右侧',
    icon: 'svg_fold_sibilings',
    handle: ({ editor, app }: CommandParams) => {
      const { extArea } = app.addons

      if (app.getState('extAreaFoldup')) {
        extArea.foldup()
      } else {
        extArea.add({
          key: editor.item().ky,
          type: 'item',
        })
      }
    },
  },
})
