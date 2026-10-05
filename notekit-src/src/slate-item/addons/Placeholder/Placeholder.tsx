import { App, NewAddonParams } from '../../engine/App'
import { Element, ReactEditor, Transforms } from '../../slate.inc'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import {
  StrmapRuleInfo,
  StrmapParams,
  ZERO_WIDTH_SPACE,
} from '../Strmap/Strmap'
import { PlaceholderElementComp } from './PlaceholderElementComp'
import { FORM_EL } from '../Form/Form'
import { ItemTransforms } from '../../transforms/item'
import { getSelectionRect } from '../../utils/dom/getSelectionRect'
import { $t } from '../../../i18n'
import { nodeString } from '../../utils/string/nodeString'

export type PlaceholderProps = {
  target: string
  placeholder: string
}
export type PlaceholderElement = InlineElement & PlaceholderProps

/**
 * Placeholder Addon
 */
export function createPlaceholderAddon({ app, $ }: NewAddonParams) {
  class Placeholder implements IAddonElement<PlaceholderElement> {
    app!: App
    config = {}

    fieldset() {
      return {
        // target: {
        //   type: FORM_EL.select,
        //   title: 'Target',
        // },

        placeholder: {
          type: FORM_EL.text,
          title: $t`placeholder.title`,
          autoFocus: true,
        },
      }
    }

    /**
     * If placeholder element is a void element ?
     */
    isVoid(val: any) {
      return $.placeholder.verify(val) && nodeString(val).length < 1
    }

    exportString(el: PlaceholderElement): string {
      return `{{placeholder ${el.placeholder}}}`
    }
  
    /**
     * Check if a value matches the data structure of placeholder element
     */
    verify(val: any): val is PlaceholderElement {
      return Element.isElement(val) && (val as any).blockType === 'placeholder'
    }

    /**
     * Create placeholder element
     */
    createElement(
      props: PlaceholderProps & { content?: string }
    ): PlaceholderElement {
      const { content, ...rest } = props
      return this.app.addons.inlines.createElement(
        'placeholder',
        content ?? '',
        rest
      ) as PlaceholderElement
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{placeholder(\s+|\})/,
        handle: ({ match }: StrmapParams) => {
          return this.createElement({
            target: 'text',
            placeholder: $t`placeholder.title`,
          })
        },
      }
    }

    /**
     * Add an item to slash menu to create placeholder element
     */
    slashMenu(): SlashMenuItems {
      return {
        slashPlaceholder: {
          icon: 'svg_placeholder',
          title: $t`placeholder.title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'placeholder' },
            cn: { v: '占位符' },
            pinyin: { v: 'zhan wei fu' },
            py: { v: 'zwf' },
          },
          handle({ editor }) {
            const selRect = getSelectionRect()
            const item = editor.item()
            // 节点级别的placeholder
            const textBeforeCaret = editor.itemTextBeforeCaret()
            if (textBeforeCaret.startsWith('/') && item.leaves.length < 2) {
              const formHandler = $.form.popup<PlaceholderProps>({
                SnapProps: {
                  targetBox: selRect as any,
                  place: ['left-in', 'bottom-out'],
                },
                initialValues: {
                  placeholder: item.placeholder ?? '',
                } as any,
                subitems: $.placeholder.fieldset() as any,
                onChange(values) {
                  ItemTransforms.setItems(editor, {
                    at: editor.itemPath(),
                    props: {
                      placeholder: values.placeholder,
                    },
                  })
                },
                onSubmit() {
                  formHandler.close()
                },
              })
              $.slashMenu.insertText(editor, '')
              return
            }

            // 行内元素级别的placeholder
            const el = $.placeholder.createElement({
              target: 'text',
              placeholder: $t`placeholder.title`,
            })
            $.slashMenu.insertText(editor, [el, { text: '' }])
            setTimeout(() => {
              const elPath = ReactEditor.findPath(editor as any, el)
              $.form.popup<PlaceholderProps>({
                subitems: $.placeholder.fieldset() as any,
                SnapProps: {
                  targetBox: selRect as any,
                  place: ['center', 'bottom-out'],
                },
                onChange(values) {
                  Transforms.setNodes(editor, values as any, { at: elPath })
                },
              })
            }, 100)
          },
        },
      }
    }

    createComponent() {
      return PlaceholderElementComp
    }

    addonInfo() {
      return {
        title: $t`placeholder.title`,
        quote: $t`placeholder.quote`,
        defaultValue: 'on',
        updated: 20221204,
      }
    }

    addonRun() {
      $.floatBar.addItems({
        placeholder: {
          icon: 'svg_placeholder',
          title: $t`placeholder.title`,
          onClick() {
            const { editor, selectedText } = $.floatBar.getContext()
            editor.deleteRange(editor.selection!)
            editor.insertFragment([
              $.placeholder.createElement({
                target: 'text',
                content: '',
                placeholder: selectedText ?? '',
              }),
              { text: ZERO_WIDTH_SPACE },
            ])
          },
        },
      })
    }
  }

  return { placeholder: new Placeholder() }
}
