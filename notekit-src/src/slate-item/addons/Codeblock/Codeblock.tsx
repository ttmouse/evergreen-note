import React from 'react'
import { Element, Node } from '../../slate.inc'
import { App, NewAddonParams } from '../../engine/App'
import { CodeMirror5Comp } from './CodeblockElementComp'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { after } from '../../engine/helper'
import { mkid } from '../../utils/string/mkid'
import { loadCss } from '../../utils/dom/loadCss'
import { loadScript } from '../../utils/dom/loadScript'
import { langMaps, LangMode } from './langMaps'
import { InlineElement } from '../Inlines/Inlines'
import { CodeblockProps } from './CodeblockProps'
import { langUnits } from './languages'
import { $t } from '../../../i18n'

export type CodeblockNeededProps = {
  /**
   * Whether the line numbers are shown.
   */
  codeBlockNumbers?: boolean
  /**
   * The code content
   */
  codeBlockText?: string
  codeBlockMode?: LangMode
  codeBlockName?: string

  value: string // same as codeBlockText
  mode: string // same as codeBlockMode
  langName: string // same as codeBlockName
  lineNumbers?: boolean // same as codeBlockNumbers
}

export type CodeblockElement = InlineElement & CodeblockNeededProps

export function createCodeblockAddon({ app, $ }: NewAddonParams) {
  class Codeblock implements IAddonElement<CodeblockElement> {
    app!: App
    config = {}

    isVoid(val: CodeblockElement) {
      return this.verify(val)
    }

    createComponent() {
      return React.memo(CodeMirror5Comp) as any
    }

    fromMarkdown(md: string) {
      return undefined
    }

    exportString(el: CodeblockElement) {
      // eslint-disable-next-line prefer-template
      return '\n```' + el.langName + '\n' + el.value + '\n```\n'
    }

    verify(val: any): val is CodeblockElement {
      return (
        Element.isElement(val) &&
        (val as unknown as CodeblockElement).blockType === 'codeblock'
      )
    }

    searchForLang(s: string): { langName: string; mode: string } {
      s = s.toLowerCase()
      for (const key in langMaps) {
        if (
          langMaps[key].langName.toLowerCase() === s ||
          langMaps[key].mode.toLowerCase() === s ||
          (langMaps[key].ext &&
            langMaps[key].ext.some((e: string) => e.toLowerCase() === s)) ||
          (langMaps[key].alias &&
            langMaps[key].alias.some((e: string) => e.toLowerCase() === s))
        ) {
          return { langName: langMaps[key].langName, mode: langMaps[key].mode }
        }
      }
      return { langName: 'Plain text', mode: 'markdown' }
    }

    autoTimer = 0
    strmap(): StrmapRuleInfo {
      const { codeblock } = this.app.addons
      return {
        title: 'Code block',
        strmapRule: /(···|```)$/,
        handle({ match }: StrmapParams) {
          codeblock.autoTimer = Date.now()
          return codeblock.createElement({ mode: 'javascript' })
        },
      } as any
    }

    slashMenu(): SlashMenuItems {
      const { slashMenu, codeblock } = this.app.addons
      return {
        slashCodeblock: {
          icon: 'svg_codeblock',
          title: $t`codeblock.slash_menu_title`,
          order: slashMenu.order.inline,
          versions: {
            en: { v: 'code block' },
            cn: { v: '代码块' },
            pingyin: { v: 'dai ma kuai' },
            py: { v: 'dmk' },
          },
          handle({ editor }) {
            codeblock.autoTimer = Date.now()
            const ele = codeblock.createElement({
              codeBlockMode: 'javascript',
            }) as Node
            slashMenu.insertText(editor, [ele, { text: '' }])
            // editor.itemSetProps({ blockType: 'codeblock' });
          },
        },
      }
    }

    createElement(props: Partial<CodeblockElement>): CodeblockElement {
      return {
        inline: true,
        isVoid: true,
        blockType: 'codeblock',
        lineNumbers: true,
        value: '',
        mode: '',
        langName: '',
        iky: mkid(),
        children: [{ text: props.value ?? '' }],
        ...props,
      }
    }

    defaultOptions: CodeblockProps = {
      theme: 'mdn-like', // 'monokai',
      indentUnit: 2,
      mode: 'javascript',
      lineWrapping: true,
      tabSize: 4,
      value: '',
    }

    loadTheme(theme: string) {
      return loadCss(`js/codemirror/theme/${theme}.css`)
    }

    getLanguages() {
      return Object.values(langUnits).sort((a, b) => {
        const w1: any = a.weight || 1000
        const w2: any = b.weight || 1000
        return w1 - w2
      })
    }

    whichTheme() {
      let theme = 'mdn-like'
      if ($.nightMode && $.nightMode.isNightMode) {
        theme = 'monokai';
      }
      return theme
    }

    setTheme(codeMirrorEditor: any) {
      const theme = this.whichTheme()
      this.loadTheme(theme)
      codeMirrorEditor.setOption('theme', theme)
    }

    loadMode(mode: string) {
      return loadScript(`js/codemirror/mode/${mode}/${mode}.js`)
    }

    addonInfo() {
      return {
        title: $t`codeblock.title`,
        quote: $t`codeblock.quote`,
        defaultValue: 'on',
        type: 'fieldset',
      }
    }

    addonRun() {
      // Initialization for this the addon ElementCodeMirror
      const { editorView, editorFactory, codeblock, eventHandler } =
        this.app.addons

      const { renderElement } = editorView
      // cover(renderElement, (props: ElementComponentProps) => {
      //   const { element, children } = props;
      //   if (element.type === Item.partTypes.head) {
      //     const newChildren = <CodeMirrorComp>{children}</CodeMirrorComp>;
      //     return renderElement.call(editorView, {
      //       ...props,
      //       children: newChildren,
      //     });
      //   }
      //   return renderElement.call(editorView, props);
      // });

      // editorFactory.addIsVoidMethod((val: any) => {
      //   return codeblock.verify(val);
      // });

      after(eventHandler?.create, (handlers) => {
        const { onBeforeInput, onKeyDown } = handlers
        ;(handlers as any).onBeforeInput = (e: any) => {
          const result = onBeforeInput.call(this, e)
          if (e.target.matches('.plg-codemirror-wrap *')) {
            return true
          }
          return result
        }

        handlers.onKeyDown = (e: React.KeyboardEvent) => {
          const target = e.target as HTMLElement
          if (target.matches('.plg-codemirror-wrap *')) {
            return
          }
          return onKeyDown.call(this, e)
        }
      })
    }
  }

  return new Codeblock()
}
