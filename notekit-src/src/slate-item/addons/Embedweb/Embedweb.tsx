import { InlineElement } from '../Inlines/Inlines'
import { App, NewAddonParams } from '../../engine/App'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { StrmapRuleInfo, StrmapParams } from '../Strmap/Strmap'
import { Element } from '../../slate.inc'
import { $t } from '../../../i18n'
import { EmbedwebElementComp } from './EmbedwebElementComp'
import { FORM_EL } from '../Form/Form'
import { notEmpty } from '../../utils/isEmpty'

export type SrcProps = {
  value: string
  height?: number // default 500
  width?: number | string // 100%
}

export type SrcElement = InlineElement & SrcProps

/**
 * Src Addon
 */
export function createSrcAddon({ app, $ }: NewAddonParams) {
  class Src implements IAddonElement<SrcElement> {
    app!: App
    config = {}

    blockType = 'embedweb'

    fieldset() {
      return {
        value: {
          type: FORM_EL.text,
          title: $t`common.url`,
        },
        height: {
          type: FORM_EL.number,
          title: $t`common.height`,
          when: ({ value }: any) => notEmpty(value),
        },
      }
    }

    /**
     * If embedweb element is a void element ?
     */
    isVoid(val: InlineElement) {
      return this.verify(val)
    }

    exportString(el: SrcElement) {
      return `[Embedded Webpage](${el.value})`
    }

    /**
     * Check if a value matches the data structure of embedweb element
     */
    verify(val: any): val is SrcElement {
      return Element.isElement(val) && (val as any).blockType === 'embedweb'
    }

    /**
     * Create embedweb element
     */
    createElement(props: Pick<SrcElement, 'value'>): SrcElement {
      if (/<iframe[\s\S]*?>/.test(props.value)) {
        const match = props.value.match(/<iframe[\s\S]*?src=['"](.+?)['"][\s\S]*?>/)
        if (match) {
          return this.app.addons.inlines.createElement(
            'embedweb',
            '{{embedweb}}',
            {
              ...props,
              value: match[1],
            }
          ) as SrcElement
        }
      }
      return this.app.addons.inlines.createElement(
        'embedweb',
        '{{embedweb}}',
        props
      ) as SrcElement
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{embedweb\s(.+?)\}\}/,
        handle: ({ match }: StrmapParams) => {
          return this.createElement({ value: match[1] })
        },
      }
    }

    /**
     * Add an item to slash menu to create embedweb element
     */
    slashMenu(): SlashMenuItems {
      return {
        slashSrc: {
          icon: 'svg_embedweb',
          title: $t`embedweb.slash_menu_title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'embedweb' },
            cn: { v: '嵌入网页' },
            pinyin: { v: '' },
            py: { v: '' },
          },
          handle({ editor }) {
            const sel = window.getSelection()
            const itemDom = sel?.anchorNode?.parentElement?.closest(
              '.node-head'
            ) as HTMLElement
            $.form.popup({
              width: 500,
              subitems: {
                value: {
                  type: 'text',
                  title: $t`common.url`,
                  autoFocus: true,
                },
              },
              SnapProps: {
                place: ['center', 'bottom-out'],
                targetBox: itemDom,
              },
              buttons: {
                [$t`common.done`]: ({ value }) => {
                  $.slashMenu.insertText(editor, [
                    $.embedweb.createElement({ value }),
                    { text: '' },
                  ])
                },
              },
            })
            $.slashMenu.insertText(editor, '')
          },
        },
      }
    }

    /**
     * Add a React component to render embedweb element
     */
    createComponent() {
      return EmbedwebElementComp
    }

    /**
     * Initialize Src addon
     */
    addonRun() {
      $.inlinesBar?.addItems({
        hyperlinkToEmbed: {
          title: $t`embedweb.turn_into_embed`,
          icon: 'svg_embedweb',
          cond() {
            return $.inlinesBar.getContext().is('hyperlink')
          },
          onClick() {
            $.inlinesBar.turnInto('embedweb', {
              value: 'url',
            })
          },
        },

        embedwebToHyperlink: {
          title: `${$t`inlinesBar.turn_into`} ${$t`hyperlink.title`}`,
          icon: 'svg_link',
          cond() {
            return $.inlinesBar.getContext().is('embedweb')
          },
          onClick() {
            try {
              $.inlinesBar.turnInto('hyperlink', {
                url: 'value',
                title: 'value',
              })
            } catch (e) {
              console.error(e)
            }
          },
        },
      })

      // COMPAT: for old data
      $.editorView.addElementViews({
        src: $.embedweb.createComponent(),
      })
    }
  }

  return { embedweb: new Src() }
}
