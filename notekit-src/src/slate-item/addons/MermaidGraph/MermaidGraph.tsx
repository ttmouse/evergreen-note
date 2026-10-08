import { $t } from '../../../i18n'
import { App, NewAddonParams } from '../../engine/App'
import React from 'react'
import { Element, Editor, ReactEditor } from '../../slate.inc'
import { mkid } from '../../utils/string/mkid'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import {
  InlinesBarInterface,
  InlinesFormParams,
} from '../Inlines/InlinesBar/InlinesBar'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { StrmapRuleInfo, StrmapParams } from '../Strmap/Strmap'
import { MermaidGraphElementComp } from './MermaidGraphElementComp'
import { MermaidGraphModal } from './MermaidGraphModal'

export type MermaidGraphElement = InlineElement & {
  inline: boolean
  blockType: 'mermaidGraph'
  children: Node[]
  value: string
}

/**
 * Mermaid Addon
 */
export function createMermaidGraphAddon({ app, $ }: NewAddonParams) {
  class MermaidGraph
    implements
      IAddonElement<MermaidGraphElement>,
      InlinesBarInterface<MermaidGraphElement>
  {
    app!: App
    config = {}

    /**
     * If mermaid element is a void element ?
     */
    isVoid(val: any) {
      return this.verify(val)
    }

    fromMarkdown(markdown: string) {
      return {} as any
    }

    exportString(el: MermaidGraphElement) {
      return '\n```mermaid\n' + el.value + '\n```\n'
    }

    /**
     * Check if a value matches the data structure of mermaid element
     */
    verify(val: any): val is MermaidGraphElement {
      return Element.isElement(val) && (val as any).blockType === 'mermaidGraph'
    }

    /**
     * Create mermaid element
     */
    createElement(props: Partial<MermaidGraphElement>): MermaidGraphElement {
      return this.app.addons.inlines.createElement(
        'mermaidGraph',
        '',
        props
      ) as MermaidGraphElement
    }

    /**
     * Add a rule for string map
     */
    strmap(): StrmapRuleInfo {
      return {
        strmapRule: /\{\{mermaid/,
        handle: ({ match }: StrmapParams) => {
          return this.createElement({ value: match[2] })
        },
      }
    }

    /**
     * Add an item to slash menu to create mermaid element
     */
    slashMenu(): SlashMenuItems {
      return {
        slashMermaid: {
          icon: 'svg_mermaid',
          title: $t`mermaidGraph.slash_menu_title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'mermaid graph' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, [
              $.mermaidGraph.createElement({
                value: 'graph LR;\nA(Use the Edit Button)--To-->B(Edit);',
              }),
              { text: '' },
            ])
          },
        },
      }
    }

    /**
     * Add a React component to render mermaid element
     */
    createComponent() {
      return MermaidGraphElementComp as any
    }

    setSource(element: MermaidGraphElement, editor: InlinesFormParams<MermaidGraphElement>['editor'], value: string) {
      // Resolve the live element: Slate replaces objects while editing.
      const entry = Array.from(Editor.nodes(editor as any, {
        at: [], match: node => this.verify(node) && node.iky === element.iky,
      }))[0]
      if (entry && (entry[0] as MermaidGraphElement).value !== value) {
        $.inlines.setProps(editor, entry[1], { value, iky: element.iky })
      }
    }

    inlinesBarForm(
      params: Pick<InlinesFormParams<MermaidGraphElement>, 'element' | 'editor'>,
      editing = true
    ): void {
      const { element, editor } = params
      if (editing) {
        const host = ReactEditor.toDOMNode(editor as any, element).querySelector('[data-mermaid-block]')
        if (host) {
          host.dispatchEvent(new Event('mermaid-edit'))
          return
        }
      }
      const id = `mermaid-dialog-${mkid()}`
      $.dialog.add({
        id,
        comp: () => <MermaidGraphModal open value={element.value} editing={editing}
          onClose={() => $.dialog.close(id)}
          onSave={value => this.setSource(element, editor, value)} />,
      })
    }

    inlinesBarAddItems(): void {}

    addonInfo() {
      return {
        title: $t`mermaidGraph.title`,
        type: 'fieldset',
        quote: $t`mermaidGraph.quote`,
        defaultValue: 'on',
      }
    }

    addonRun() {
      $.inlinesBar.addItems({
        mermaidGraph: {
          cond: () =>
            $.inlinesBar.getContext<MermaidGraphElement>().is('mermaidGraph'),
          title: 'Edit Mermaid Graph',
          icon: 'svg_edit',
          onClick() {
            const ctx = $.inlinesBar.getContext<MermaidGraphElement>()
            $.mermaidGraph.inlinesBarForm({
              ...ctx,
            })
          },
        },
      })
    }
  }

  return { mermaidGraph: new MermaidGraph() }
}
