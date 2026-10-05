import { App, NewAddonParams } from '../../engine/App'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { InlineElement } from '../Inlines/Inlines'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { LatexElementComp } from './LatexComp'
import { InlinesFormParams } from '../Inlines/InlinesBar/InlinesBar'
import { ReactEditor } from '../../slate.inc'
import { getSelectionRect } from '../../utils/dom/getSelectionRect'
import { $t } from '../../../i18n'
import { isEscape } from '../../utils/string/isEscape'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'

export type LatexNeededProps = {
  content?: string
  value: string // Same as content
}
export type LatexElement = InlineElement & LatexNeededProps

export function createLatexAddon({ app, $ }: NewAddonParams) {
  class Latex implements IAddonElement<LatexElement> {
    app!: App
    config = {}

    isVoid(val: LatexElement) {
      return this.verify(val)
    }

    createComponent() {
      return LatexElementComp
    }

    exportString(el: LatexElement) {
      // we should keep formula in a single line
      return `$$${el.value.replace(/\n/g, ' ')}$$`
    }

    fromMarkdown(md: string) {
      return undefined
    }

    verify(val: any): val is LatexElement {
      return val.blockType === 'latex'
    }

    strmap(): StrmapRuleInfo {
      const { latex } = this.app.addons
      return {
        title: 'Latex',
        strmapRule: /\$\$(.+?)\$\$$/,
        handle({ match, textBeforeCaret }: StrmapParams) {
          if (isEscape(textBeforeCaret, match.index, '`')) {
            return
          }
          return latex.createElement({ value: match[1] })
        },
      } as any
    }

    slashMenu(): SlashMenuItems {
      const { slashMenu } = this.app.addons
      return {
        slashLatex: {
          icon: 'svg_latex',
          title: $t`latex.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'latex' },
            cn: { v: '公式' },
            pingyin: { v: 'gongshi' },
            py: { v: 'gs' },
          },
          handle({ editor }) {
            const rect = getSelectionRect()
            const element = $.latex.createElement({
              value: '',
            })
            slashMenu.insertText(editor, [element])
            const entry = $.inlines.findEntry(editor, element.iky)
            if (entry && rect) {
              $.latex.inlinesBarForm({
                editor,
                element: entry[0] as LatexElement,
                SnapProps: {
                  place: ['center', 'bottom-out'],
                  targetBox: rect,
                },
              })
            }
          },
        },
      }
    }

    createElement(props: LatexNeededProps) {
      const { value, content } = props
      return this.app.addons.inlines.createElement(
        'latex',
        value ?? content,
        props
      )
    }

    inlinesBarForm(
      params: Pick<
        InlinesFormParams<LatexElement>,
        'element' | 'SnapProps' | 'editor'
      >
    ) {
      const { element, SnapProps, editor } = params

      const handleChange = (values: any) => {
        const path = ReactEditor.findPath(editor as any, element)
        const withoutStyleVal = values.content.replace(/^\\displaystyle */, '')
        let newVal = values.displayStyle ? `\\displaystyle ${withoutStyleVal}` : withoutStyleVal
        $.inlines.setProps(editor, path, {
          value: newVal,
          iky: element.iky,
        })
      }

      const val = element?.value ?? ''

      $.form.popup({
        // title: $$`Latex`,
        initialValues: {
          content: val.replace(/^\\displaystyle */, ''),
          displayStyle: val.startsWith('\\displaystyle'),
        },
        subitems: {
          content: {
            type: 'text',
            title: 'Latex',
            multiple: true,
            autoFocus: true,
          },
          displayStyle: {
            type: 'switch',
            title: $t`Display Style`,
          },
        },
        buttons: {
          [$t`common.done`]: handleChange,
        },
        onChange: handleChange,
        SnapProps,
      })
    }

    addonInfo() {
      return {
        title: $t`latex.title`,
        type: 'fieldset',
        quote: $t`latex.quote`,
        defaultValue: 'on',
      }
    }

    addonRun() {
      appendStyle(`
        .katex .mfrac .frac-line {
          border-color: black
        }
        .katex .mtable .vertical-separator {
          border-color: black;
        }
        .katex .hline, .katex .overline .overline-line, .katex .underline .underline-line {
          border-color: black;
        }
      `)
      // Initialization for this the addon Latex
    }
  }

  return new Latex()
}
