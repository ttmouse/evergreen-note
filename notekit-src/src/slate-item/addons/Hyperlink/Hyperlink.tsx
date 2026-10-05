import { Node, Element, Editor, Transforms } from '../../slate.inc'
import { App, NewAddonParams } from '../../engine/App'
import { StrmapParams } from '../Strmap/Strmap'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { InlineElement } from '../Inlines/Inlines'
import { browser } from '../../utils/browser'
import { HyperlinkComp } from './HyperlinkComp'
import { $t } from '../../../i18n'
import { FORM_EL } from '../Form/Form'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { ItemEditor } from '../..'
import { mkid } from '@/slate-item/utils/string/mkid'

export type HyperlinkElement = InlineElement & {
  inline: boolean
  blockType: 'hyperlink'
  children: Node[]
  title: string
  url: string
}

/**
 * 超链接插件
 */

export function createHyperlinkAddon({ app, $ }: NewAddonParams) {
  class Hyperlink implements IAddonElement<HyperlinkElement> {
    app!: App
    config = {}

    blockType = 'hyperlink'
    valueKey = 'url' // HyperlinkElement['url']

    fieldset() {
      return {
        url: {
          type: FORM_EL.text,
          title: $t`hyperlink.url`,
        },
        title: {
          type: FORM_EL.text,
          title: $t`hyperlink.text`,
        },
      }
    }

    isVoid = (val: any) => $.hyperlink.verify(val)

    fromMarkdown(markdown: string) {
      const match = /\[(.+?)\]\((.+)\)/.exec(markdown)
      if (match) {
        return this.createElement({
          url: match[2],
          title: match[1],
        })
      }
    }

    exportString(el: HyperlinkElement, options: { rich?: boolean } = {}) {
      if (options.rich) return `[${el.title}](${el.url})`;
      return el.title;
    }

    verify(val: any): val is HyperlinkElement {
      return (
        Element.isElement(val) &&
        (val as any).blockType === $.hyperlink.blockType
      )
    }

    createElement(props: { url: string; title: string }): HyperlinkElement {
      const { url, title } = props
      return $.inlines.createElement('hyperlink', title, {
        url,
        title,
      }) as HyperlinkElement
    }

    // 添加超链接的字符串映射规则, 以支持 Markdown 的超链接语法
    strmap() {
      const { hyperlink } = this.app.addons
      return {
        strmapRule: browser.legacySafari ? new RegExp('\\[(.+?)\\]\\((.+?)\\)$') : new RegExp('(?<!\\/)\\[(.+?)\\]\\((.+?)\\)$'),
        handle({ match }: StrmapParams) {
          return hyperlink.createElement({ url: match[2], title: match[1] })
        },
      }
    }

    showForm(params: { editor: ItemEditor }) {
      const { editor } = params
      const title = window.getSelection()?.toString() ?? ''
      $.form.popup({
        initialValues: {
          url: '',
        },
        subitems: {
          url: {
            type: FORM_EL.text,
            title: $t`hyperlink.url`,
          },
        },
        buttons: {
          [$t`common.done`]: (values) => {
            $.inlines.toggle(
              editor,
              $.hyperlink.createElement({
                url: values.url,
                title,
              })
            )
          },
        },
      })
    }

    slashMenu(): SlashMenuItems {
      // const { slashMenu, hyperlink } = this.app.addons;
      return {}
    }

    createComponent() {
      return HyperlinkComp
    }

    addonCommands(): HotkeyMaps {
      return {
        hyperlink: {
          title: $t`hyperlink.title`,
          hotkey: 'mod+k',
          handle({ editor }) {
            $.hyperlink.showForm({ editor })
          },
        },
      }
    }

    addonRun() {
      $.floatBar?.addItems({
        hyperlink: {
          title: $t`hyperlink.title`,
          icon: 'svg_link',
          hotkey: 'mod+k',
          order: 900,
          onClick: () => {
            $.hyperlink.showForm($.floatBar.getContext())
          },
        },
      })

      $.inlinesBar.addItems({
        hyperlinkToText: {
          title: `${$t`inlinesBar.turn_into`} Text`,
          icon: 'svg_text',
          cond() {
            return $.inlinesBar.getContext().is('hyperlink')
          },
          onClick() {
            const ctx = $.inlinesBar.getContext<HyperlinkElement>()
            const path = $.inlinesBar.getPath()
            const newEl = {
              text: ctx.element.title,
            }
            const pathRef = Editor.pathRef(ctx.editor, path)
            Transforms.insertNodes(ctx.editor, newEl, {
              at: pathRef.current!,
            })
            Transforms.removeNodes(ctx.editor, {
              at: pathRef.unref()!,
            })
          },
        },
      })
    }
  }

  return new Hyperlink()
}
