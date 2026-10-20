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
import { urlHitAtPoint } from '../../utils/plainUrl'
import { openInSystemBrowser } from '../../utils/openExternal'

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
      // 正文里的裸 URL（手打或 AI 直接写进来的纯文本）单击就交系统浏览器。
      //
      // 2026-10-20 用户报障「笔记正文里面，链接不能点击」：编辑器里只有超链接元素可点，
      // 纯文本 URL 点下去只会落光标。这里按「点到的字符是否落在一段 URL 里」判定，
      // 命中才接管；其余点击一概不碰，光标定位与选区照旧。
      // 用 mousedown 而不是 click：preventDefault 才能不让编辑器先把光标挪进 URL，
      // 也避免拉选时误开浏览器。
      document.addEventListener(
        'mousedown',
        (e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
          const hit = urlHitAtPoint(e.clientX, e.clientY)
          if (!hit) return
          e.preventDefault()
          e.stopPropagation()
          openInSystemBrowser(hit.url)
        },
        true
      )

      // 悬停命中时换成 pointer 光标：可点的暗示只加在 URL 这段文字上，离开即还原。
      let hoverEl: HTMLElement | null = null
      let hoverFrame = 0
      const clearHover = () => {
        if (hoverFrame) cancelAnimationFrame(hoverFrame)
        hoverFrame = 0
        if (hoverEl) hoverEl.style.cursor = ''
        hoverEl = null
      }
      document.addEventListener(
        'mousemove',
        (e) => {
          if (hoverFrame) return
          hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0
            const hit = urlHitAtPoint(e.clientX, e.clientY)
            const el = hit?.node.parentElement ?? null
            if (el === hoverEl) return
            if (hoverEl) hoverEl.style.cursor = ''
            hoverEl = el
            if (hoverEl) hoverEl.style.cursor = 'pointer'
          })
        },
        true
      )
      document.addEventListener('mouseleave', clearHover, true)
    }
  }

  return new Hyperlink()
}
