import { Item, ItemEditor, ItemNode, ItemTransforms } from '../..'
import { checkCaret } from './checkCaret'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { Path, Range, Node, ReactEditor, Transforms } from '../../slate.inc'
import { omit } from '../../utils/object/omit'
import { ItemDOM } from '../../components/ItemView'
import { pub } from '../../utils/pub'
import { triggerEvent } from '../../utils/dom/triggerEvent'

export type EvtType =
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onKeyPress'
  | 'onPaste'
  | 'onMouseDown'
  | 'onMouseUp'
  | 'onMouseMove'
  | 'onMouseLeave'
  | 'onFocus'
  | 'onBlur'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragOver'
  | 'onDragLeave'
  | 'onDrop'
  | 'onCompositionStart'
  | 'onCompositionEnd'
  | 'onCompositionUpdate'
  | 'onCopy'
  | 'onCut'
  | 'onInput'
  | 'onFocus'
  | 'onFocusIn'
  | 'onFocusOut'
  | 'onReset'
  | 'onSubmit'
  | 'onTouchStart'
  | 'onTouchMove'
  | 'onTouchEnd'
  | 'onTouchCancel'
  | 'onScroll'
  | 'onWheel'
  | 'onContextMenu'
  | 'onSelect'
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerOver'
  | 'onPointerOut'
  | 'onGotPointerCapture'
  | 'onLostPointerCapture'
  | 'onTransitionEnd'
  | 'onAnimationStart'
  | 'onAnimationIteration'
  | 'onAnimationEnd'
  | 'onLoad'
  | 'onError'

export const PREVENT_DEFAULT = false
export const ALLOW_DEFAULT = true

/**
 * 把浏览器里的光标交给 Slate（slate-react 自己在 selectionchange 里就是这么做的，
 * 但本仓「点进笔记」这一次它没跑到）。
 *
 * 只在「可编辑的编辑器」里补：只读视图（搜索结果、回收站、星标）不动，免得把只读内容改掉。
 */
function syncSelectionFromDom(editor: ItemEditor, { focus = false } = {}): Range | null {
  try {
    const domNode = ReactEditor.toDOMNode(editor as any, editor as any) as HTMLElement
    if (!domNode?.isContentEditable) return null
    const domSelection = window.getSelection()
    if (!domSelection?.rangeCount) return null
    const range = ReactEditor.toSlateRange(editor as any, domSelection as any, {
      exactMatch: false,
      suppressThrow: true,
    })
    if (!range) return null
    if (focus) ReactEditor.focus(editor as any)
    Transforms.select(editor as any, range)
    return (editor.selection as Range) ?? null
  } catch (error) {
    return null
  }
}

export type EvtHandlerParams = {
  editor: ItemEditor
  isCaret: unknown
  app: App
}

type Handler = (e: any, params: EvtHandlerParams) => any

export type EvtHandlers = {
  [evtName: string]: Handler[]
}

export type EnterIndentRuleParams = {
  editor: ItemEditor
  item: ItemNode
  path: Path
  itemDom: ItemDOM
}
export type EnterIndentRule = (params: EnterIndentRuleParams) => boolean

export type DoubleHanlderParams = {
  editor: ItemEditor
  item: ItemNode
  path: Path
}

export type DoubleEnterHandlers = {
  [k: string]: (params: DoubleHanlderParams) => boolean
}

class EventHandler implements IAddon {
  app!: App
  config = {}
  handlers: EvtHandlers = {} as any

  doubleEnterHandlers: DoubleEnterHandlers = {
    backquote: ({ item }) => {
      return item.blockType === 'blockquote'
    },
  }

  /**
   * Double Enter 模式，
   * 允许用户按 Enter 软换行，
   * 按两次 Enter 硬换行
   * @param handlers
   */
  doubleEnterAdd(handlers: DoubleEnterHandlers) {
    Object.assign(this.doubleEnterHandlers, handlers)
  }

  doubleEnterCheck(params: DoubleHanlderParams) {
    for (const handler of Object.values(this.doubleEnterHandlers)) {
      if (handler(params)) {
        return true
      }
    }
    return false
  }

  addListener(listeners: { [evtName: string]: Handler }) {
    for (const [evtName, handler] of Object.entries(listeners)) {
      this.handlers[evtName] = this.handlers[evtName] || []
      this.handlers[evtName].push(handler)
    }
  }

  invokeListeners(evtName: EvtType, e: Event, params: EvtHandlerParams) {
    const handlers = this.handlers[evtName]
    if (!handlers) return
    for (const handler of handlers) {
      handler(e, params)
    }
  }

  enterIndentRules: EnterIndentRule[] = []

  /**
   * 添加一些规则，用于告诉事件处理器：当光标位于句尾时，是应该创建子节点还是同级节点
   * @param editor
   */
  addEnterIndentRule(rule: EnterIndentRule) {
    this.enterIndentRules.push(rule)
  }

  checkEnterIndentRules(params: EnterIndentRuleParams) {
    return this.enterIndentRules.some((rule) => rule(params))
  }

  /**
   * 处理新建节点的跟随情况
   * @param param0
   * @returns
   */
  handleFollow({ editor, item, path }: EnterIndentRuleParams) {
    const follower = {
      checkbox: {
        value: false,
      },
      // pomo: {},
      // '!': '! ',
    } as { [key: string]: string | object }
    for (const [type, params] of Object.entries(follower)) {
      // 以某种字符串开头
      const headString = Item.headString(item)
      if (
        typeof params === 'string' &&
        headString.startsWith(params)
      ) {
        if (headString.endsWith(params)) {
          editor.deleteBackward('line')
          return PREVENT_DEFAULT
        }
        ItemTransforms.insertNextItems(editor, {
          at: path,
          focusEnd: true,
          items: Item.make({ ori: params }, { editor }),
        })
        return PREVENT_DEFAULT
      }

      if (Item.startsWithElement(item, type)) {
        if (Item.trimLeaves(item.leaves).length === 1) {
          editor.deleteBackward('block')
          return PREVENT_DEFAULT
        }

        const newEl = this.app.addons.elementRegistry.addons[type].createElement(params)
        ItemTransforms.insertNextItems(editor, {
          at: path,
          focusEnd: true,
          items: Item.make(
            {
              leaves: [{ text: '' }, newEl as any, { text: '' }],
            },
            { editor }
          ),
        })
        return PREVENT_DEFAULT
      }
    }
    return ALLOW_DEFAULT
  }

  /**
   * Create event handlers, they listen to the event of item Components
   * @param editor
   * @returns
   */
  create(editor: ItemEditor) {
    const { eventHandler } = this.app.addons
    const isCaret = checkCaret(editor)
    const { hotkey } = this.app.addons
    const { app } = this

    const params = { editor, isCaret, app }

    return {
      onKeyDown(e: React.KeyboardEvent) {
        // 点进笔记（还没打字）时 Slate 的 selection 还是 null —— 浏览器里光标明明在，
        // 只是 slate-react 的 selectionchange 同步没跑到。此时若直接 return，编辑器类
        // 快捷键（加粗、超链接、上下左右移动……）整条链路都不响应。
        const selection = (editor.selection ?? syncSelectionFromDom(editor)) as Range
        if (!selection) return

        // A block reference can render with a different indentation from the
        // following item. Native ArrowDown preserves the screen x coordinate,
        // which can place the caret in the middle of that next item's text even
        // when the current caret is at the start of the reference line. In this
        // case, move to the start of the next rendered item instead.
        if (
          e.key === 'ArrowDown' &&
          Range.isCollapsed(selection) &&
          editor.itemTextBeforeCaret() === '' &&
          editor.itemLeaves().some((leaf) => (leaf as any).blockType === 'refer')
        ) {
          const item = editor.item()
          const itemDom = item?.$id ? document.getElementById(item.$id) as ItemDOM | null : null
          const editorDom = ReactEditor.toDOMNode(editor as any, editor as any) as HTMLElement
          const currentHeadTop = itemDom?.querySelector(':scope > .node-head')?.getBoundingClientRect().top
          if (currentHeadTop !== undefined) {
            const nextDom = Array.from(editorDom.querySelectorAll('.node'))
              .map((dom) => dom as ItemDOM)
              .filter((dom) => dom !== itemDom && dom.$editor === editor && dom.$item?.ky)
              .map((dom) => ({
                dom,
                top: dom.querySelector(':scope > .node-head')?.getBoundingClientRect().top,
              }))
              .filter((entry): entry is { dom: ItemDOM; top: number } =>
                entry.top !== undefined && entry.top > currentHeadTop + 1,
              )
              .sort((a, b) => a.top - b.top)[0]?.dom

            if (nextDom?.$item?.ky) {
              e.preventDefault()
              editor.itemFocus(nextDom.$item.ky)
              return
            }
          }
        }

        const textBeforeCaret = editor.itemTextBeforeCaret()

        hotkey.listen({
          app,
          event: e as any,
          isCaret,
          editor,
          selection,
          textBeforeCaret,
        })

        eventHandler.invokeListeners('onKeyDown', e as any, params)

        if (e.key === '】' && editor.itemTextBeforeCaret().endsWith('】')) {
          editor.deleteBackward('character')
          editor.insertText(']]')
          e.preventDefault()
        } else if (
          e.key === '）' &&
          editor.itemTextBeforeCaret().endsWith('）')
        ) {
          editor.deleteBackward('character')
          editor.insertText('))')
          e.preventDefault()
        }

        triggerEvent(e.target as HTMLElement, 'editorKeydown', params)
      },

      onKeyUp(e: React.KeyboardEvent) {
        const el = window
          .getSelection()
          ?.anchorNode?.parentElement?.closest('.node')
        if (el) {
          if (/^[a-z]$/i.test(e.key)) {
            el.classList.remove('node-empty-text')
          }
        }
      },

      onDrop(e: React.MouseEvent) {
        const { $item } = (e.target as HTMLElement).closest('.node') as ItemDOM
        if ((e.target as HTMLElement).innerHTML.length < 1) {
          e.preventDefault()
        }
      },

      onMouseUp(e: React.MouseEvent) {
        // 还原时漏了「点进笔记就把光标交给编辑器」这一步（原 onClick 只是空占位）。
        // 缺了它，点一下笔记之后 Slate 既没有 selection 也没有 focus：
        // 编辑器类快捷键即使派发了也没有效果（⌘B 不加粗、Shift+→ 不扩选），
        // 一直要等到用户打第一个字，Slate 才从输入事件里把选区和焦点补上。
        syncSelectionFromDom(editor, { focus: true })
      },

      onClick(e: React.MouseEvent) {
        // Just as a placeholder
        // console.log(editor.item());
      },

      onBlur(e: React.FocusEvent) {
        e.target.closest('.editor-view')!.classList.remove('editor-active')
        const sel = window.getSelection()
        const itemDom = (
          sel?.anchorNode?.parentElement as HTMLElement
        )?.closest('.node') as ItemDOM
        if (itemDom) {
          itemDom.classList.remove('node-active')
          const { $editor, $item } = itemDom
          pub.emit(pub.evt.itemBlur, { editor: $editor, item: $item, itemDom })

          const quoteDom = (
            sel?.anchorNode?.parentElement as HTMLElement
          )?.closest('.node-quote')
          if (quoteDom) {
            itemDom.classList.remove('node-quote-active')
            pub.emit(pub.evt.itemQuoteBlur, {
              editor: $editor,
              item: $item,
              itemDom: quoteDom as any,
            })
          }
        }
        triggerEvent(e.target as HTMLElement, 'editorBlur', params)
      },

      onFocus(e: React.FocusEvent) {
        e.target.closest('.editor-view')!.classList.add('editor-active')
        // console.log('focus', Date.now());
        triggerEvent(e.target as HTMLElement, 'editorFocus', params)
      },

      onMouseEnter(e: React.MouseEvent) {
        // Just as a placeholder
      },

      onBeforeInput(e: React.FormEvent) {
        // Just as a placeholder
      },

      onDoubleClick(e: React.MouseEvent) {
        // const { anchor } = editor.itemSelection()
        // console.log(editor.itemLeaves())
        // console.warn(
        //   omit(anchor.item, (k, item) => typeof item === 'function'),
        //   anchor.path
        // )
      },
    }
  }

  addonRun() {}
}

export function createEventHanlderAddon(params: NewAddonParams) {
  return new EventHandler()
}
