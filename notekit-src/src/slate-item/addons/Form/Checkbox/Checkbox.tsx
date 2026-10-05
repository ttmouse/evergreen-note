import { App, NewAddonParams } from '../../../engine/App'
import { mkid } from '../../../utils/string/mkid'
import { IAddonElement } from '../../ElementRegistry/ElementRegistry'
import { InlineElement } from '../../Inlines/Inlines'
import { CheckboxElementComp } from './CheckboxElementComp'
import { SlashMenuItems } from '../../SlashMenu/SlashMenu'
import { StrmapRuleInfo, StrmapParams } from '../../Strmap/Strmap'
import { FormNeededProps } from '../interfaces'
import { $t } from '../../../../i18n'
import { Editor, Path, Transforms } from '../../../slate.inc'
import { isEmpty } from '../../../utils/isEmpty'
import { HotkeyMaps } from '../../Hotkey/Hotkey'
import { Item } from '../../../interfaces/item'
import { BaseItemEditor } from '../../EditorFactory/ItemEditor'

/**
 * Checkbox 表单元素的接口
 */
export type CheckboxElement = FormNeededProps &
  InlineElement & {
    blockType: string
    value: boolean
  }

export function createCheckboxAddon({ app, $ }: NewAddonParams) {
  class Checkbox implements IAddonElement<CheckboxElement> {
    app!: App
    config = {}

    isVoid(val: CheckboxElement) {
      return this.verify(val)
    }

    createComponent() {
      return CheckboxElementComp
    }

    exportString(el: CheckboxElement, options: { item: UnitPersist; }): string {
      const box = el.value ? 'x' : ' '
      return ` [${box}] `
    }

    fromMarkdown(md: string) {
      return undefined
    }

    verify(val: any): val is CheckboxElement {
      return val?.blockType === 'checkbox'
    }

    setChecked(editor: any, at: Path, value: boolean | 'toggled') {
      const allCheckboxes = Editor.nodes(editor, {
        at,
        match: (n) => $.checkbox.verify(n),
      })
      for (const [node, path] of allCheckboxes) {
        if (value === 'toggled') {
          value = !(node as CheckboxElement).value
        }
        $.inlines.setProps(editor, at, { ...node, value } as any)
      }
    }

    strmap(): StrmapRuleInfo {
      const { checkbox } = this.app.addons
      return {
        title: 'Checkbox',
        strmapRule: /^】$|^\]\s*$|^\[(\s*|x)\]$|\{\{checkbox\}\}$/,
        handle({ match }: StrmapParams) {
          return checkbox.createElement({ value: false })
        },
      } as any
    }

    slashMenu(): SlashMenuItems {
      const { slashMenu, checkbox } = this.app.addons
      return {
        slashCheckbox: {
          icon: 'svg_checkbox',
          title: $t`checkbox.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'checkbox' },
            cn: { v: '复选框' },
            pinyin: { v: 'fu xuan kuang' },
            py: { v: 'fxk' },
            en2: { v: 'todo' },
            cn2: { v: '待办' },
            pinyin2: { v: 'daiban' },
            py2: { v: 'db' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, [
              checkbox.createElement({ value: false }),
              { text: '' },
            ])
          },
        },
      }
    }

    addonInfo() {
      return {
        title: $t`checkbox.title`,
        quote: $t`checkbox.quote`,
        defaultValue: 'on',
      }
    }

    createElement(props: { value: boolean }): CheckboxElement {
      return {
        inline: true,
        isVoid: true,
        iky: mkid(),
        blockType: 'checkbox',
        ...props,
        children: [{ text: `` }],
      } as unknown as CheckboxElement
    }

    insertNow(editor: BaseItemEditor) {
      const leaves = editor.itemLeaves()
      if (leaves.some((leaf) => $.checkbox.verify(leaf))) {
        $.checkbox.setChecked(editor, editor.itemPathText(), 'toggled')
      } else {
        Transforms.insertFragment(
          editor,
          [$.checkbox.createElement({ value: false }), { text: '' }],
          {
            at: editor.itemPathText().concat(0),
          }
        )
        if (Item.headString(editor.item()).length < 1) {
          editor.itemFocusEnd()
        }
      }
    }

    addonCommands() {
      return {
        checkbox: {
          title: `Add checkbox`,
          hotkey: 'mod+shift+d',
          handle: ({ editor }) => {
            $.checkbox.insertNow(editor);
          },
        },
      } as HotkeyMaps
    }

    addonRun() {
      // Initialization for this the addon Checkbox
    }
  }

  return new Checkbox()
}
