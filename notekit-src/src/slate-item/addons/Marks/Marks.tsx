import { icons } from '../../../components/SvgIcon'
import { App, NewAddonParams, CommandParams, IAddon } from '../../engine/App'
import {
  Editor,
  Range,
  Transforms,
  Text,
  Node,
  Location,
  ReactEditor,
} from '../../slate.inc'
import { upperCaseFirst } from '../../utils/string'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { HotkeyInfo } from '../Hotkey/Hotkey'
import './marks.less'
import { createCustomMarkAddon } from './CustomMark/CustomMark'
import { isEmpty } from '../../utils/isEmpty'
import { $t } from '../../../i18n'

export type MarkType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'highlight'
  | 'above'
  | 'tag'
  | 'bilink'

/**
 * 「清除格式」会去掉的行内标记。
 * 不含 tag/bilink 等由其他机制管理的属性。
 */
const CLEARABLE_MARKS = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'highlight',
  'format',
  'note',
] as const

/**
 * Inline text marks
 */
export function createMarksAddon(params: NewAddonParams) {
  const { app, $ } = params

  class Marks implements IAddon {
    app!: App
    config = {}

    /**
     * Check if a text node has some mark
     * @param textNode
     * @returns
     */
    hasMark(textNode: Node, theMarks: MarkType[] = []) {
      return (
        Text.isText(textNode) &&
        Object.keys(textNode).some(
          (key) => key !== 'text' && !isEmpty((textNode as any)[key])
        )
      )
    }

    /**
     * Get all marks applied to the text node
     * @param textNode
     * @returns
     */
    getActiveMarks(editor: ItemEditor) {
      const active = {} as any
      const [match] = Editor.nodes(editor, {
        match: (slNode: any) => $.marks.hasMark(slNode),
        mode: 'all',
      })
      if (match) {
        const [textNode] = match
        for (const [key, val] of Object.entries(textNode)) {
          if (key !== 'text' && !isEmpty(textNode)) {
            active[key] = val
          }
        }
      }
      return active
    }

    /**
     * Check if a text node has a given mark
     * @param editor
     * @param mark
     * @returns
     */
    isActive(editor: ItemEditor, mark: MarkType) {
      const [match] = Editor.nodes(editor, {
        match: (slNode: any) => slNode[mark] === true,
        mode: 'all',
      })
      return !!match
    }

    toggle(editor: ItemEditor, mark: MarkType, willCollapse = false) {
      try {
        if (editor.itemSelection().isMulti) {
          return
        }
      } catch {}

      const { selection } = editor
      if (!selection) {
        return
      }

      // 折叠光标下切换标记：作用于「接下来输入的文字」（Typora 行为）。
      // 直接维护 editor.marks（ItemEditor.insertText 会把它应用到新输入的文本节点）。
      // 不走 Editor.addMark/removeMark：它们在折叠分支会强制 onChange，
      // 产生一次「无内容变化」的 itemChanged，下游刷新逻辑在这种 payload 上会抛错。
      if (Range.isCollapsed(selection)) {
        const pending = { ...(Editor.marks(editor) || {}) }
        if (pending[mark]) {
          delete pending[mark]
        } else {
          pending[mark] = true
        }
        editor.marks = pending
        ReactEditor.focus(editor as any)
        return
      }

      const rangeRef = Editor.rangeRef(editor, selection, {
        affinity: 'inward',
      })
      Transforms.setNodes(
        editor,
        { [mark]: this.isActive(editor, mark) ? null : true },
        { match: Text.isText, split: true }
      )
      if (willCollapse) {
        Transforms.collapse(editor, { edge: 'end' })
      } else {
        ReactEditor.focus(editor as any)
        Transforms.select(editor, rangeRef.unref()!)
      }
    }

    /**
     * 清除选区文字的全部行内样式；
     * 折叠光标下则清除「接下来输入文字」的预设样式。
     */
    clearFormat(editor: ItemEditor) {
      const { selection } = editor
      if (!selection) {
        return
      }
      if (Range.isCollapsed(selection)) {
        const pending = { ...(Editor.marks(editor) || {}) }
        for (const key of CLEARABLE_MARKS) {
          delete pending[key]
        }
        editor.marks = pending
        ReactEditor.focus(editor as any)
        return
      }
      const rangeRef = Editor.rangeRef(editor, selection, {
        affinity: 'inward',
      })
      Transforms.unsetNodes(editor, [...CLEARABLE_MARKS], {
        match: Text.isText,
        split: true,
      })
      // 与 toggle 一致：把选区恢复到清除前的范围，用户能看到清除后的文字
      ReactEditor.focus(editor as any)
      Transforms.select(editor, rangeRef.unref()!)
    }

    assign(
      editor: ItemEditor,
      markInfo: { [mark: string]: unknown },
      at: Location
    ) {
      // 折叠选区：把标记设为「接下来输入的文字」所用（Typora 行为）。
      // 与 toggle 同理，直接维护 editor.marks，不触发无内容变化的 onChange。
      if (Range.isRange(at) && Range.isCollapsed(at)) {
        const pending = { ...(Editor.marks(editor) || {}) }
        for (const [key, val] of Object.entries(markInfo)) {
          if (isEmpty(val)) {
            delete pending[key]
          } else {
            pending[key] = val
          }
        }
        editor.marks = pending
        return
      }
      Transforms.setNodes(editor, markInfo, {
        match: Text.isText,
        split: true,
        at,
      })
      // Transforms.setNodes(editor, markInfo, { at });
    }

    addonCommands(): { [fmtType in MarkType]?: HotkeyInfo } {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const marks = this
      return {
        bold: {
          title: $t`hotkey.bold`,
          hotkey: 'mod+b',
          icon: icons.svg_bold,
          handle: ({ editor }: CommandParams) => {
            marks.toggle(editor, 'bold')
          },
        },

        underline: {
          title: $t`hotkey.underline`,
          hotkey: 'mod+u',
          icon: icons.svg_underline,
          handle: ({ editor }: CommandParams) => {
            marks.toggle(editor, 'underline')
          },
        },

        strikethrough: {
          title: $t`hotkey.strikethrough`,
          hotkey: 'mod+y',
          icon: icons.svg_strikethrough,
          handle: ({ editor }: CommandParams) => {
            marks.toggle(editor, 'strikethrough')
          },
        },

        code: {
          title: $t`hotkey.code`,
          hotkey: 'mod+g',
          icon: icons.svg_code,
          handle: ({ editor }: CommandParams) => {
            marks.toggle(editor, 'code')
          },
        },

        highlight: {
          title: $t`hotkey.highlight`,
          hotkey: 'mod+shift+b',
          icon: icons.svg_highlight,
          handle: ({ editor }: CommandParams) => {
            marks.toggle(editor, 'highlight')
          },
        },
      }
    }

    addFloatBarItems() {
      const m = (mark: MarkType, hotkey?: string) => ({
        [mark]: {
          title: $t(`markdown.${mark}`),
          icon: (icons as any)[`svg_${mark}`],
          hotkey,
          onClick: () => {
            const { editor } = $.floatBar.getContext()
            $.marks.toggle(editor, mark)
          },
        },
      })

      $.floatBar?.addItems({
        ...m('bold', 'mod+b'),
        ...m('underline', 'mod+u'),
        ...m('strikethrough'),
        ...m('italic', 'mod+i'),
        ...m('highlight', 'mod+shift+b'),
        ...m('code', 'mod+g'),
        clearFormat: {
          title: $t`markdown.clear_format`,
          icon: icons.svg_clear_format,
          onClick: () => {
            const { editor } = $.floatBar.getContext()
            $.marks.clearFormat(editor)
          },
        },
      })
    }

    addonRun() {
      $.hotkey?.register({
        italic: {
          title: $t`hotkey.italic`,
          hotkey: 'mod+i',
          icon: icons.svg_italic,
          modified: true,
          handle: ({ editor }: CommandParams) => {
            /*
             mod + i
             1. 在选中文本时，会触发浏览器的斜体样式
             2. 在未选中文本时，则触发 item 的 zoom in 操作
            */
            if (!editor.itemSelection().isCollapsed) {
              $.marks.toggle(editor, 'italic')
              return false
            }
            return true
          },
        },
      })

      $.marks.addFloatBarItems()
    }
  }

  return { marks: new Marks(), ...createCustomMarkAddon(params) }
}
