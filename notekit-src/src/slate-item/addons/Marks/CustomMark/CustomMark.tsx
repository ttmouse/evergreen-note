import { icons } from '../../../../components/SvgIcon'
import { $t } from '../../../../i18n'
import { NewAddonParams, IAddon, App } from '../../../engine/App'
import { Node, Editor, Path, Transforms, ReactEditor } from '../../../slate.inc'
import { atLater } from '../../../utils/atLater'
import { isEmpty } from '../../../utils/isEmpty'
import { pub } from '../../../utils/pub'
import { trim } from '../../../utils/string/trim'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { StrmapParams } from '../../Strmap/Strmap'
import { customMarkStyles } from './customMarkStyles'
import { generateAllStyles } from './helper'
import { ItemDOM } from '../../../components/ItemView'
import React from 'react'
import { CustomFormatForm } from './CustomMarkMoreForm'
import { escapeRegExp } from '../../../utils/regexp'
import { DialogProps } from '../../../utils/msg/showDialog'
import { caretMoveToEnd } from '../../../utils/caret'

export type CustomMarkType = keyof typeof customMarkStyles

/**
 * 浮动条色板用的圆点（颜色与 customMarkStyles 的文字色一致）
 */
function TextColorLabel(props: { color: string }) {
  return (
    <span
      style={{
        backgroundColor: `var(--cl-${props.color}-700)`,
        minWidth: 14,
        minHeight: 14,
        display: 'inline-block',
        borderRadius: '100%',
      }}
    />
  )
}

export type CustomMarkInfo = {
  format: CustomMarkType
  note: string
}

export type CustomFormatStyle = {
  name: string
  style: string
  trigger: string
}

declare global {
  interface AppConf {
    customMarkFormatStyles?: CustomFormatStyle[]
  }
}

export function createCustomMarkAddon({ app, $ }: NewAddonParams) {
  class CustomMark implements IAddon {
    app!: App
    config = {
      customMarkMore: [],
    }

    showForm(params: {
      editor: ItemEditor
      initialValues?: CustomMarkInfo
      DialogProps?: Partial<DialogProps<any>>
    }) {
      const { editor, initialValues, DialogProps: dialogProps } = params
      const rangeRef = Editor.rangeRef(editor, editor.selection!)
      const options = {} as any
      Object.entries($.customMark.getStyles()).forEach(([key, info]) => {
        options[key] = (info as any).title
      })
      $.form.popup<CustomMarkInfo>({
        initialValues,
        subitems: {
          format: {
            type: 'select',
            title: $t`customMark.custom_mark`,
            options,
          },
          note: {
            type: 'text',
            title: $t`customMark.note`,
            multiple: true,
            rows: 2,
          },
        },
        onChange(values: any) {
          atLater(
            () => {
              $.marks.assign(editor, values, rangeRef.current!)
            },
            'custom-mark',
            10
          )
        },
        beforeClose() {
          rangeRef.unref()
        },
        DialogProps: dialogProps,
      })
    }

    getCustomStyls() {
      const maps = {} as any
      const customMarkFormatStyles = app.cfg.customMarkFormatStyles ?? []
      customMarkFormatStyles.forEach((item) => {
        maps[item.name] = {
          title: item.name,
          value: item.style,
          trigger: item.trigger,
        }
      })
      return maps
    }

    getStyles() {
      return {
        ...customMarkStyles,
        ...$.customMark.getCustomStyls(),
      }
    }

    registerStyles(container: HTMLElement) {
      container?.classList.add(...generateAllStyles($.customMark.getStyles()))
    }

    showManageForm() {
      const dialogId = $.dialog.show({
        title: $t`customMark.management`,
        maxWidth: 'sm',
        width: 500,
        body: (
          <CustomFormatForm
            onSubmit={(values) => {
              if (!isEmpty(values.customMarkFormatStyles)) {
                app.cfg.customMarkFormatStyles = values.customMarkFormatStyles
              }
              $.dialog.remove(dialogId)
            }}
            initialValues={{
              customMarkFormatStyles: app.cfg.customMarkFormatStyles ?? [
                { name: '', style: '', trigger: '' },
              ],
            }}
          />
        ),
      })
    }

    focus() {
      setTimeout(() => {
        const el = document.querySelector('textarea[name="note"]') as any
        if (el) {
          caretMoveToEnd(el)
        }
      }, 100)
    }

    addonInfo() {
      return {
        title: $t`customMark.title`,
        quote: $t`customMark.quote`,
        type: 'fieldset',
        defaultValue: 'on',
        subitems: {
          customMarkManage: {
            type: 'button',
            title: $t`customMark.management`,
            onClick() {
              $.customMark.showManageForm()
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
        },
      }
    }

    addonRun() {
      pub.on(pub.evt.uiMounted, ({ container }) => {
        $.customMark.registerStyles(container)
      })

      const colorOptions = () => {
        const options = {} as any
        for (const c of ['red', 'green', 'blue', 'yellow']) {
          options[c] = <TextColorLabel color={c} />
        }
        return options
      }

      $.floatBar?.addItems({
        textColor: {
          title: $t`customMark.text_color`,
          icon: icons.svg_theme,
          onClick: (e) => {
            const { editor } = $.floatBar.getContext()
            if (!editor.selection) {
              return
            }
            const rangeRef = Editor.rangeRef(editor, editor.selection, {
              affinity: 'inward',
            })
            const activeFormat = ($.marks.getActiveMarks(editor) as any)?.format
            const handler = $.form.popup({
              width: 150,
              SnapProps: {
                place: ['center', 'bottom-out'],
                targetBox: window.getSelection() ?? (e.target as HTMLElement),
              },
              initialValues: {
                color: ['red', 'green', 'blue', 'yellow'].includes(
                  activeFormat
                )
                  ? activeFormat
                  : undefined,
              },
              subitems: {
                color: {
                  type: 'toggleButton',
                  shape: 'round',
                  border: false,
                  size: 'small',
                  options: colorOptions(),
                },
              },
              onChange(values: any) {
                // 点已选中的色点会传回 null，语义是清除颜色
                $.marks.assign(
                  editor,
                  { format: values.color ?? null },
                  rangeRef.current!
                )
              },
              beforeClose() {
                rangeRef.unref()
              },
            })
            $.floatBar.close()
          },
        },
        customMark: {
          title: $t`customMark.custom_mark`,
          icon: icons.svg_info,
          onClick: (e) => {
            const params = $.floatBar.getContext()
            const active = $.marks.getActiveMarks(params.editor)
            $.customMark.showForm({
              ...params,
              initialValues: {
                format: active?.format ?? 'normal',
                note: active?.note ?? '',
              },
              DialogProps: {
                SnapProps: {
                  targetBox: window.getSelection() ?? (e.target as HTMLElement),
                  place: ['center', 'bottom-out'],
                },
              },
            })
            $.floatBar.close()
            $.customMark.focus()
          },
        },
      })

      $.strmap?.addRules({
        customMark: {
          title: 'Custom Mark',
          strmapRule: /\{([=\w]+|[=\w]+:.+?|:.+?)\}/,
          handle: ({ editor, match }: StrmapParams) => {
            /*
            用户可以输入以下语法：
            {red}
            {red:note text}
            {:note text}
            {color=red:note text}
            {color=red}
            */

            const [formatInfo, note] = match[1].split(':')
            const [fmtType, formatValue] = formatInfo.split('=')
            const props: CustomMarkInfo = {} as any

            const maps = { r: 'red', g: 'green', b: 'blue', y: 'yellow' }
            const formatType =
              fmtType in maps ? (maps as any)[fmtType] : fmtType

            if (formatValue) {
              ;(props as any)[formatType] = formatValue
            } else {
              props.format = formatType
            }
            if (note) {
              props.note = note
            }

            const pathRef = Editor.pathRef(editor, editor.itemPath())

            // 若光标位于标记文本节点之末，则将备注保存到该节点上
            const { path, offset } = editor.selection!.anchor
            const [node] = Editor.node(editor, path)
            if (
              isEmpty((node as any).code) &&
              $.marks.hasMark(node) &&
              Node.string(node).length === offset
            ) {
              $.marks.assign(editor, props, path)
              setTimeout(() => editor.itemSave(pathRef.unref()!), 0)
              return ''
            }

            try {
              // 若光标位于某个带着 mark 的节点之后，
              // 那么在它后面输入 {red:some text} 这样的文本时，
              // 就将它当成备注内容保存到该文本节点上
              const prevPath = Path.previous(path)
              const [prevNode] = Editor.node(editor, prevPath)
              if (
                $.marks.hasMark(prevNode) &&
                trim(Node.string(node)).startsWith(trim(match[0]))
              ) {
                $.marks.assign(editor, props, prevPath)
                setTimeout(() => editor.itemSave(pathRef.unref()!), 0)
                return ''
              }
            } catch (e) {
              console.warn(e)
            }

            // 普通文本里输入 {red} / {red:文字}：让颜色标记也「输入即生效」。
            // 原版逻辑只处理光标前是已标记节点的情况，普通文本下语法会被原样留下。
            if (props.format && props.format !== 'normal') {
              if (note) {
                // {red:文字}：把整段匹配替换成带颜色的文字
                pathRef.unref()
                return {
                  text: note,
                  format: props.format,
                } as any
              }
              // {red}：吃掉语法，并为接下来输入的文字预设颜色
              $.marks.assign(editor, { format: props.format }, editor.selection)
              setTimeout(() => editor.itemSave(pathRef.unref()!), 0)
              return ''
            }
            if (props.format === 'normal' && isEmpty(note)) {
              // {normal}：清除接下来输入文字的预设格式
              $.marks.assign(editor, { format: null }, editor.selection)
              setTimeout(() => editor.itemSave(pathRef.unref()!), 0)
              return ''
            }

            pathRef.unref()
          },
        },
      })

      for (const [name, info] of Object.entries(this.getCustomStyls())) {
        const { trigger } = info as any
        if (isEmpty(trigger)) {
          continue
        }
        const pattern = escapeRegExp(trigger).replace('%TEXT', '(.+?)')
        $.strmap.addRules({
          [`custom-mark-${name}`]: {
            title: `Custom Mark ${name}`,
            strmapRule: new RegExp(pattern),
            handle: ({ match }: StrmapParams) => {
              return {
                text: match[1],
                format: name,
              }
            },
          },
        })
      }

      $.ui.on('click', (e) => {
        const target = e.target as HTMLElement
        const s = '.mark-note .data-leaf-note, .mark-note .data-leaf-note *'
        if (target.matches(s)) {
          const { $editor } = target.closest('.node') as ItemDOM
          const el = target.closest('.mark-note') as HTMLElement
          const node = ReactEditor.toSlateNode($editor as any, el) as any
          const path = ReactEditor.findPath($editor as any, node)
          Transforms.select($editor as any, path)
          $.customMark.showForm({
            editor: $editor as any,
            initialValues: {
              format: node.format,
              note: node.note,
            },
            DialogProps: {
              SnapProps: {
                targetBox: el,
                place: ['center', 'bottom-out'],
              },
            },
          })
          $.customMark.focus()
        }
      })
    }
  }

  return { customMark: new CustomMark() }
}
