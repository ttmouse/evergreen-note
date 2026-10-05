import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Path } from '../../slate.inc'
import { $$ } from '../../utils/lang'
import { ItemEditor } from '../EditorFactory/ItemEditor'

export function createQuoteAddon({ app, $ }: NewAddonParams) {
  class Quote implements IAddon {
    app!: App
    config = {}

    toggleQuote(editor: ItemEditor, path: Path) {
      const item = editor.item(path)
      const itemDom = document.getElementById(item.$id)
      itemDom?.classList.add('node-quote-active')
    }

    addonRun() {
      // $.hotkey?.register({
      //   quote: {
      //     title: $$`Add a quote`,
      //     hotkey: 'alt+enter',
      //     handle({ editor }) {
      //       $.quote.toggleQuote(editor, editor.itemPath());
      //     },
      //   },
      // });
    }
  }

  return { quote: new Quote() }
}
