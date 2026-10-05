import { $t } from '../../../i18n'
import { App, NewAddonParams } from '../../engine/App'
import { Element, Node, ReactEditor } from '../../slate.inc'
import { cls } from '../../styles'
import { atLater } from '../../utils/atLater'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import {
  InlinesBarInterface,
  InlinesFormParams,
} from '../Inlines/InlinesBar/InlinesBar'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { StrmapRuleInfo, StrmapParams } from '../Strmap/Strmap'
import { MDTableElementComp } from './MDTableComp'
import './MDTable.css'

export type MDTableElement = InlineElement & {
  inline: boolean
  blockType: 'mdTable'
  children: Node[]
  value: string
}

/**
 * MDTable Addon
 */
export function createMDTableAddon({ app, $ }: NewAddonParams) {
  class MDTable
    implements
      IAddonElement<MDTableElement>,
      InlinesBarInterface<MDTableElement>
  {
    app!: App
    config = {}

    isVoid(val: any) {
      return this.verify(val)
    }

    fromMarkdown(markdown: string) {
      return {} as any
    }

    exportString(el: MDTableElement) {
      // eslint-disable-next-line prefer-template
      return '\n' + el.value + '\n\n'
    }

    /**
     * Check if a value matches the data structure of mdTable element
     */
    verify(val: any): val is MDTableElement {
      return Element.isElement(val) && (val as any).blockType === 'mdTable'
    }

    /**
     * Create mdtable element
     */
    createElement(props: Partial<MDTableElement>): MDTableElement {
      return this.app.addons.inlines.createElement(
        'mdTable',
        '',
        props
      ) as MDTableElement
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{mdTable/,
        handle: ({ match }: StrmapParams) => {
          return this.createElement({ value: match[2] }) as unknown as Node
        },
      }
    }

    /**
     * Add an item to slash menu to create mdTable element
     */
    slashMenu(): SlashMenuItems {
      return {
        slashMDTable: {
          icon: 'svg_table_simple',
          title: $t`Table (MD)`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'md table' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, [
              $.mdTable.createElement({
                value: 'Header 1 | Header 2\n-------- | --------\nCell 1   | Cell 2',
              }) as unknown as Node,
              { text: '' },
            ])
          },
        },
      }
    }

    /**
     * Add a React component to render mdTable element
     */
    createComponent() {
      return MDTableElementComp as any
    }

    inlinesBarForm(
      params: Pick<InlinesFormParams<MDTableElement>, 'element' | 'editor'>
    ): void {
      const { element, editor } = params
      $.form.popup({
        title: $t`Edit Markdown Table`,
        width: 400,
        initialValues: {
          content: element.value,
        },
        subitems: {
          content: {
            type: 'code',
            mode: 'markdown',
            autoFocus: true,
          } as any,
        },
        onChange(values) {
          atLater(
            () => {
              const path = ReactEditor.findPath(editor as any, element)
              if (path) {
                $.inlines.setProps(editor, path, {
                  value: values.content,
                  iky: element.iky,
                })
              }
            },
            element.iky,
            300
          )
        },
        DialogProps: {
          classList: [
            cls`.MuiPaper-root { max-height: ${
              window.innerHeight - 60
            }px !important; }`,
          ],
        },
      })
    }

    addonInfo() {
      return {
        title: $t`Markdown Table`,
        type: 'fieldset',
        quote: $t`Allow you to create tables in markdown.`,
        defaultValue: 'on',
      }
    }

    addonRun() {
      $.inlinesBar.addItems({
        editMDTable: {
          cond: () => $.inlinesBar.getContext<any>().is('mdTable'),
          title: $t`Edit Table`,
          icon: 'svg_edit',
          onClick() {
            const ctx = $.inlinesBar.getContext<MDTableElement>()
            $.mdTable.inlinesBarForm({
              ...ctx,
              SnapProps: {
                targetBox: ctx.elementDom,
                place: ['center', 'bottom-out'],
              },
            })
          },
        },
      })
    }
  }

  return { mdTable: new MDTable() }
}
