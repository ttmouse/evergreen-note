import { App, NewAddonParams, IAddon } from '../../engine/App'
import { cover } from '../../engine/helper'
import { Item, ItemNode } from '../../interfaces/item'
import {
  Editor,
  Range,
  Node,
  Transforms,
  Text,
  Path,
  Operation,
} from '../../slate.inc'
import { HistoryEditor } from 'slate-history'
import { ItemTransforms } from '../../transforms/item'
import { isEmpty } from '../../utils/isEmpty'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { escapeRegExp } from '../../utils/regexp'
import { browser } from '../../utils/browser'
import { checkCaret } from '../EventHandler/checkCaret'
import { StrmapSettings } from './StrmapSettings'
import { compileCustomRules, DEFAULT_STRMAP_CONTENT } from './customRules'

declare global {
  interface AppConf {
    strmapContent: string
  }
}

export type StrmapParams = {
  item: ItemNode
  editor: ItemEditor
  path: Path
  match: RegExpExecArray
  textBeforeCaret: string
}

/**
 * 映射规则的数据模型
 */
export type StrmapRuleInfo = {
  strmapRule: RegExp
  title?: string
  handle: (params: StrmapParams) => string | Node | Text | void
}

export type StrmapRuleInfoSimple = {
  [fromStr: string]: string
}

/**
 * 光标边界字符
 *
 * 正常情况下在页面中是不可见的
 * 比如输入 **加粗** 渲染格式后，跳出加粗的文字
 * 原本是用 \b 字符，但它在 windows 下会显示成一个方框
 * 所以改用 \u200b 字符
 *
 * 小知识：
 * 零宽空格（zero-width space, ZWSP）是一种不可打印的Unicode字符，
 * 在Unicode中，该字符为U+200B 零宽空格 ，HTML：&#8203;
 */
export const ZERO_WIDTH_SPACE = '\u200b' // '\b'

/**
 * 字符串映射插件
 */
class Strmap implements IAddon {
  app!: App
  config = {}

  rules = {} as { [key: string]: StrmapRuleInfo }
  customRules: Record<string, StrmapRuleInfo> = {}
  private isProcessing = false
  private isUndoing = false

  addonInfo() {
    return {
      title: '字符串映射',
      type: 'fieldset',
      defaultValue: 'on',
      subitems: {
        strmapEditor: { type: 'text', render: StrmapSettings },
      },
    }
  }

  async saveCustomRules(content: string) {
    const rules = compileCustomRules(content)
    await this.app.addons.prefer.setValue('strmapContent', content)
    this.customRules = rules
  }

  /**
   * 添加字符串映射规则
   * @param newRules
   */
  addRules(newRules: { [key: string]: StrmapRuleInfo | string }) {
    // Object.assign(this.rules, newRules);
    Object.entries(newRules).forEach(([k, v]) => {
      if (typeof v === 'string') {
        this.rules[k] = {
          strmapRule: new RegExp(escapeRegExp(k)),
          handle: () => v,
        }
      } else {
        this.rules[k] = v
      }
    })
  }

  addSimple(rules: StrmapRuleInfoSimple) {
    for (const [fromRule, to] of Object.entries(rules)) {
      this.addRules({
        [fromRule.toString()]: {
          strmapRule: new RegExp(fromRule),
          handle: () => to,
        },
      })
    }
  }

  checkCaretContext(editor: ItemEditor): Node | null {
    const { selection } = editor
    if (!selection) {
      return null
    }
    const { anchor } = selection
    return Node.get(editor, anchor.path)
  }

  disabledQuote = true

  /**
   * Process text changes detected via editor.apply.
   * Called when an insert_text or remove_text operation is applied,
   * replacing the old keyup-driven approach with an operation-driven one.
   */
  processTextChange(editor: ItemEditor) {
    const range = editor.selection as Range
    if (!range) {
      return
    }

    if (this.disabledQuote && checkCaret(editor).atQuote()) {
      return
    }

    const textBeforeCaret = editor.itemTextBeforeCaret()
    const [textNode, textPath] = Editor.node(editor, range.anchor)
    if (Text.isText(textNode) && (textNode as any).code) {
      // If the caret is in an inline-code text, we do not need to do anything.
      return
    }
    const beforeText = Node.string(textNode).slice(0, range.anchor.offset)
    for (const ruleInfo of [...Object.values(this.customRules), ...Object.values(this.rules)]) {
      const match = ruleInfo.strmapRule.exec(beforeText)
      if (match) {
        const idx = match.index
        if (idx !== 0 && beforeText[idx - 1] === '`') {
          continue
        }

        const m = match
        if (m) {
          const delRange = {
            anchor: {
              path: textPath,
              offset: m.index,
            },
            focus: {
              path: textPath,
              offset: m[0].length + m.index,
            },
          }

          HistoryEditor.withNewBatch(editor as any, () => {
            let result: ReturnType<StrmapRuleInfo['handle']>
            try {
              result = ruleInfo.handle({
                editor,
                match,
                path: editor.itemPath(),
                item: editor.item(),
                textBeforeCaret,
              })
            } catch (error) {
              console.error('字符串映射规则执行失败', error)
              return
            }

            if (typeof result !== 'undefined') {
              editor.deleteRange(delRange)

              if (typeof result === 'string' && !isEmpty(result)) {
                let isEnterKey = false
                let newResult = result
                if (newResult.includes('{%enter}')) {
                  isEnterKey = true
                  newResult = newResult.replace('{%enter}', '')
                }

                let newFocusOffset = -1
                newResult = newResult.replace(/\{%caret\}/, (re, offset) => {
                  newFocusOffset = m.index + offset
                  return ''
                })

                editor.insertText(newResult)

                if (isEnterKey) {
                  ItemTransforms.insertNextItems(editor, {
                    at: editor.itemPath(),
                  })
                  editor.itemFocus(editor.itemPathNext() as Path)
                } else if (newFocusOffset > -1) {
                  Transforms.select(editor, {
                    path: range.anchor.path,
                    offset: newFocusOffset,
                  })
                }
              } else if (Text.isText(result) || Node.isNode(result)) {
                if ('tag' in result) {
                  editor.insertFragment([result as Node])
                } else {
                  editor.insertFragment([
                    result as Node,
                    { text: ZERO_WIDTH_SPACE },
                  ])
                }
              } else if (Node.isNodeList(result)) {
                editor.insertFragment([...result, { text: ZERO_WIDTH_SPACE }])
              }
            }
          })
          // A custom replacement must not cascade into another rule in this operation.
          if (Object.values(this.customRules).includes(ruleInfo)) return
        }
      }
    }
  }

  clearSlashB(item: ItemNode) {
    item.ori = (Item.headString(item) ?? '').replaceAll(ZERO_WIDTH_SPACE, '')
    if (Text.isTextList(item.leaves)) {
      item.leaves = item.leaves.map((leaf: Node) => {
        if (Text.isText(leaf)) {
          return {
            ...leaf,
            text: leaf.text.replaceAll(ZERO_WIDTH_SPACE, ''),
          }
        }
        return { ...leaf }
      })
    }
    return item
  }

  addonBeforeRun() {
    const { eventHandler, dbMemory, marks } = this.app.addons

    // Clear the character ZERO_WIDTH_SPACE
    const { saveItem } = dbMemory
    cover(saveItem, (item, options) => {
      const newItem = this.clearSlashB(item as any)
      return saveItem.call(dbMemory, newItem, options)
    })

    const { create } = eventHandler
    const strmap = this
    cover(eventHandler.create, (editor: ItemEditor) => {
      const handler = create.call(eventHandler, editor)
      const { onKeyDown }: any = handler

      // When user press right arrow key, and the cursor is at the end of the text,
      // we should move the cursor out of the mark.
      handler.onKeyDown = ((e: KeyboardEvent) => {
        const range = editor.selection as Range
        // 没有选区时（点进笔记还没打字、只读视图）不能直接 Editor.node(editor, null)：
        // 那会抛 TypeError，把 React 这一条 keydown 链掐断，后面的
        // EventHandler.onKeyDown（快捷键派发就在里面）根本轮不到执行。
        if (!range) {
          onKeyDown.call(e.currentTarget, e)
          return
        }
        const node = Editor.node(editor, range)[0]
        if (
          e.key === 'ArrowRight' &&
          marks.hasMark(node) &&
          Editor.isEnd(editor, range.focus, range.focus.path)
        ) {
          Transforms.collapse(editor, { edge: 'end' })
          const nextEntry = Editor.next(editor)
          if (
            !nextEntry ||
            !Node.string(nextEntry[0]).startsWith(ZERO_WIDTH_SPACE)
          ) {
            editor.insertFragment([{ text: ZERO_WIDTH_SPACE }])
            e.preventDefault()
          }
        }
        onKeyDown.call(e.currentTarget, e)
      }) as any

      // Hook into editor.apply to detect text changes and trigger strmap rules.
      // This replaces the old keyup-driven approach with an operation-driven one
      // that works correctly across all platforms including Android.
      //
      // Strategy: only trigger on user-typed insert_text at the current selection.
      // - remove_text is excluded: undo may produce remove_text to restore text,
      //   but we only want to match when the user actively types new characters.
      // - Non-selection-path insert_text is excluded: it comes from paste, undo,
      //   or other programmatic edits, not from direct user input.
      const originalApply = editor.apply.bind(editor)
      editor.apply = (op: Operation) => {
        originalApply(op)

        if (strmap.isProcessing || strmap.isUndoing) {
          return
        }

        if (op.type === 'insert_text') {
          const sel = editor.selection
          if (
            sel &&
            Range.isCollapsed(sel) &&
            Path.equals(op.path, sel.anchor.path) &&
            op.offset + op.text.length === sel.anchor.offset
          ) {
            strmap.isProcessing = true
            try {
              strmap.processTextChange(editor)
            } finally {
              strmap.isProcessing = false
            }
          }
        }
      }

      // Guard undo/redo to prevent re-matching after undo.
      const originalUndo = editor.undo?.bind(editor)
      if (originalUndo) {
        editor.undo = () => {
          strmap.isUndoing = true
          try {
            originalUndo()
          } finally {
            strmap.isUndoing = false
          }
        }
      }

      const originalRedo = editor.redo?.bind(editor)
      if (originalRedo) {
        editor.redo = () => {
          strmap.isUndoing = true
          try {
            originalRedo()
          } finally {
            strmap.isUndoing = false
          }
        }
      }

      return handler
    })
  }

  async addonRun() {
    try {
      this.customRules = compileCustomRules(this.app.cfg.strmapContent ?? DEFAULT_STRMAP_CONTENT)
    } catch (error) {
      console.error('字符串映射配置无效，请在设置中修正', error)
    }
    this.addRules({
      // autoSpace: {
      //   strmapRule: /([\u4e00-\u9fa5])([@#a-z0-9]+)/i,
      //   title: '盘古之白',
      //   handle: (params: StrmapParams) => {
      //     const { match } = params;
      //     return `${match[1]} ${match[2]}`;
      //   },
      // },
      // autoSpace2: {
      //   strmapRule: /([@#a-z0-9])([\u4e00-\u9fa5])/i,
      //   title: '盘古之白',
      //   handle: (params: StrmapParams) => {
      //     const { match } = params;
      //     return `${match[1]} ${match[2]}`;
      //   },
      // },
      '^》': {
        strmapRule: /^》/,
        handle: () => '>',
      },
      '》': {
        strmapRule: browser.legacySafari
          ? /^([^《]*)》/
          : new RegExp('(?<=^[^《]*)》'),
        handle: ({ match }) => (browser.legacySafari ? match[1] + '>' : '>'),
      },
      '【【': {
        strmapRule: /【【/,
        handle: () => {
          // 模拟一下英文括号被按下的事件恢复listener
          document.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }))
          return '[['
        },
      },
      '】】': ']]',
      '（（': {
        strmapRule: /（（/,
        handle: () => {
          // 模拟一下英文括号被按下的事件恢复listener
          document.dispatchEvent(new KeyboardEvent('keydown', { key: '(' }))
          return '(('
        },
      },
      '））': '))',
      // label: {
      //   strmapRule: /^([\u4e00-\u9fa5]{1,8}|[^\u4e00-\u9fa5]{1,20})::$/,
      //   handle({ match }) {
      //     return {
      //       text: match[1],
      //       label: true,
      //     }
      //   },
      // },
    })
  }
}

export function createStrmapAddon(params: NewAddonParams): Strmap {
  return new Strmap()
}
