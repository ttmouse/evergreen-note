import { ItemDOM } from '../../../components/ItemView'
import { App, NewAddonParams, CommandParams } from '../../../engine/App'
import { Path } from '../../../slate.inc'
import { ItemTransforms } from '../../../transforms/item'
import { isCaretAtFirstLine, isCaretAtLastLine } from '../../../utils/caret'
import { findDOMBelow } from '../../../utils/dom/findDOMByRect'
import { $$ } from '../../../utils/lang'
import { showSnack } from '../../../utils/msg/showSnack'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { checkCaret } from '../../EventHandler/checkCaret'
import { getLayout, getDepth } from '../helper'
import {
  isCaretAtCell,
  getTableEntry,
  getColIndexVirtual,
  getRowIndex,
  getRowEntry,
} from './helper'

export function tableHotkey(app: App) {
  const { tableSimple, hotkey, counter } = app.addons

  hotkey?.register(
    {
      tableNewCol: {
        title: $$`Table: insert column`,
        hotkey: 'alt+enter',
        modified: true,
        handle: ({ editor }) => {
          if (isCaretAtCell(editor)) {
            const sel = editor.itemSelection()
            const headDom = sel?.anchor.itemDom.querySelector(
              ':scope > .node-head'
            ) as HTMLElement

            tableSimple.insertColumn(editor, {
              at: getTableEntry(headDom!)[1],
              pos: getColIndexVirtual(headDom),
            })
            setTimeout(() => {
              tableSimple.moveCaret(headDom as any, 'right', 'start')
            }, 0)
            return false
          }
          return true
        },
      },

      tableNewRow: {
        title: $$`Table: insert row`,
        hotkey: 'enter',
        modified: true,
        handle(params) {
          const { editor } = params
          const sel = editor.itemSelection()
          const { itemDom } = sel.anchor
          if (isCaretAtCell(editor)) {
            const headDom = sel?.anchor.itemDom.querySelector(
              ':scope > .node-head'
            ) as HTMLElement
            const rowIndex = getRowIndex(headDom)
            tableSimple.insertRow(editor, {
              at: getTableEntry(headDom!)[1],
              pos: rowIndex + 1,
            })
            setTimeout(() => {
              tableSimple.moveCaret(headDom as any, 'below', 'end')
            }, 0)
            return false
          }
          if (sel.anchor.item.layout === 'tablesimple') {
            tableSimple.insertRow(editor, {
              at: editor.itemPath(),
              pos: 0,
            })
            editor.itemFocus(editor.itemPathFirstSubitem())
            return false
          }

          if (
            // getLayout(editor) === 'tablesimple' &&
            // getDepth(editor) === 3 &&
            itemDom.matches(
              '.node-layout-tablesimple-2 > .node-body > .node-subitems > .node'
            ) &&
            editor.itemTextPlain().length < 1
          ) {
            // 回缩两次，让节点变成 row item
            editor.itemOutdent()
            editor.itemOutdent()
            return false
          }
          return true
        },
      },

      tableCaretUp: {
        title: $$`Table: move caret up`,
        hotkey: 'up',
        modified: true,
        handle({ editor }) {
          const sel = window.getSelection()
          const ele = sel?.anchorNode?.parentElement as HTMLElement
          if (
            isCaretAtCell(editor) &&
            isCaretAtFirstLine(ele) &&
            // 如果“自动完成”组件正在使用，则不应该移动光标
            !document.body.querySelector(':scope > [id^=auto-complete]')
          ) {
            const itemDom: ItemDOM = ele.closest('.node') as any
            tableSimple.moveCaret(itemDom, 'above', 'end')
            return false
          }
          return true
        },
      },

      tableCaretDown: {
        title: $$`Table: move caret down`,
        hotkey: 'down',
        modified: true,
        handle({ editor }) {
          const sel = window.getSelection()
          const ele = sel?.anchorNode?.parentElement as HTMLElement

          const moveCaretDown = () => {
            const rowEntry = getRowEntry(ele)
            const nextPath = editor.itemPathNext(rowEntry)
            nextPath && editor.itemFocusEnd(nextPath)
          }

          if (
            getLayout(editor) === 'tablesimple' &&
            getDepth(editor) > 2 &&
            !findDOMBelow(
              ele,
              '.node-head',
              ele.closest('.node-layout-tablesimple-2')! as HTMLElement
            )
          ) {
            // 单元格里的子节点，在单元格内的下方没有节点，则让光标移动到下一行的单元格
            const itemDom: ItemDOM = ele.closest(
              '.node-layout-tablesimple-2'
            ) as any
            if (!tableSimple.moveCaret(itemDom, 'below', 'end')) {
              moveCaretDown()
            }
            return false
          }

          if (
            isCaretAtCell(editor) &&
            isCaretAtLastLine(ele) &&
            // 如果“自动完成”组件正在使用，则不应该移动光标
            !document.body.querySelector(':scope > [id^=auto-complete]')
          ) {
            if (getDepth(editor) === 2 && editor.itemCountSubitems() > 0) {
              return true
            }
            const itemDom: ItemDOM = ele.closest('.node') as any
            if (!tableSimple.moveCaret(itemDom, 'below', 'end')) {
              moveCaretDown()
            }
            return false
          }
          return true
        },
      },

      forceRemoveRow: {
        title: $$`Table: remove row`,
        hotkey: 'mod+backspace',
        modified: true,
        handle({ editor }) {
          if (isCaretAtCell(editor)) {
            const dom = editor.itemSelection().anchor.itemDom
            const [, rowPath] = getRowEntry(dom)
            if (rowPath) {
              tableSimple.moveCaret(dom, 'above', 'end')
              tableSimple.removeRow(editor, { at: rowPath })
              return false
            }
          }
          return true
        },
      },

      forceRemoveColumn: {
        title: 'Table: remove column',
        hotkey: 'mod+alt+backspace',
        modified: true,
        handle({ editor }) {
          if (isCaretAtCell(editor)) {
            const sel = tableSimple.getSelection(editor)
            if (sel && sel.colIndexVirtual > 0) {
              tableSimple.removeColumn(
                editor,
                sel.tablePath,
                sel.colIndexVirtual
              )
              return false
            }
          }
          return true
        },
      },

      tableMoveUpRow: {
        title: $$`Table: move row up`,
        hotkey: 'mod+up',
        modified: true,
        handle({ editor }) {
          if (isCaretAtCell(editor)) {
            const dom = editor.itemSelection().anchor.itemDom
            const [, rowPath] = getRowEntry(dom)
            if (rowPath) {
              ItemTransforms.moveUpItems(editor, { at: rowPath })
              return false
            }
          }
          return true
        },
      },

      tableMoveDownRow: {
        title: $$`Table: move row down`,
        hotkey: 'mod+down',
        modified: true,
        handle({ editor }) {
          if (isCaretAtCell(editor)) {
            const dom = editor.itemSelection().anchor.itemDom
            const [, rowPath] = getRowEntry(dom)
            if (rowPath) {
              ItemTransforms.moveDownItems(editor, { at: rowPath })
              return false
            }
          }
          return true
        },
      },

      tableMoveLeftColumn: {
        title: $$`Table: move column left`,
        hotkey: 'mod+left',
        modified: true,
        handle({ editor }) {
          const sel = tableSimple.getSelection(editor)
          if (sel) {
            tableSimple.moveColumn(editor, {
              tablePath: sel.tablePath,
              colIndex: sel.colIndexVirtual,
              direction: 'left',
            })
            return false
          }
          return true
        },
      },

      tableMoveRightColumn: {
        title: $$`Table: move column right`,
        hotkey: 'mod+right',
        modified: true,
        handle({ editor }) {
          const sel = tableSimple.getSelection(editor)
          if (sel) {
            tableSimple.moveColumn(editor, {
              tablePath: sel.tablePath,
              colIndex: sel.colIndexVirtual,
              direction: 'right',
            })
            return false
          }
          return true
        },
      },
    },
    'tableSimple'
  )

  const isEmptyRowText = (editor: ItemEditor, rowPath: Path) => {
    const item = editor.item(rowPath)
    return counter.countWordsOfTree(item, true).count < 1
  }

  const stopDelete = ({ editor }: CommandParams) => {
    const isCaret = checkCaret(editor)
    if (
      (isCaret.atTextBegin() || editor.itemTextPlain().length < 1) &&
      isCaretAtCell(editor)
    ) {
      const dom = editor.itemSelection().anchor.itemDom
      const [, rowPath] = getRowEntry(dom)
      if (isEmptyRowText(editor, rowPath)) {
        tableSimple.moveCaret(dom, 'above', 'end')
        tableSimple.removeRow(editor, { at: rowPath })
      } else if (!tableSimple.moveCaret(dom, 'left', 'end')) {
        // TODO:
        const content =
          'Can not delete a non-empty row, try cmd+basckspace/ctrl+backspace instead.'
        showSnack({ content, severity: 'info' })
      }
      return false
    }
    return true
  }
  ;['backspace', 'delete', 'alt+delete', 'alt+backspace'].forEach((k) => {
    hotkey?.modify(k, stopDelete)
  })

  // 阻止缩进
  hotkey?.modify('tab', ({ editor }: CommandParams) => {
    const sel = window.getSelection()
    if (
      sel?.anchorNode?.parentElement?.matches(
        '.node-layout-tablesimple-1 > .node-head *'
      )
    ) {
      tableSimple.moveCaret(
        sel?.anchorNode?.parentElement as any,
        'right',
        'end'
      )
      return false
    }
    if (isCaretAtCell(editor)) {
      const dom = editor.itemSelection().anchor.itemDom as any
      // is dom the last child of its parent?
      if (dom.parentElement?.lastElementChild === dom) {
        if (
          !tableSimple.moveCaret(
            dom.parentElement.closest('.node').querySelector('.node-head'),
            'below',
            'end'
          )
        ) {
          tableSimple.insertRow(editor, {
            at: getTableEntry(dom)[1],
            pos: -1,
            focus: true,
          })
        }
        return false
      }
      tableSimple.moveCaret(dom, 'right', 'end')
      return false
    }
    return true
  })

  hotkey?.modify('shift+tab', ({ editor }: CommandParams) => {
    if (isCaretAtCell(editor)) {
      const dom = editor.itemSelection().anchor.itemDom as any
      tableSimple.moveCaret(dom, 'left', 'end')
      return false
    }
    if (
      isCaretAtCell(editor) ||
      (getLayout(editor) === 'tablesimple' && getDepth(editor) < 4)
    ) {
      return false
    }
    return true
  })

  hotkey?.modify('mod+enter', ({ editor }) => {
    if (isCaretAtCell(editor) && getDepth(editor) === 1) {
      return false
    }
    return true
  })
}
