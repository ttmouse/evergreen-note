import { IAddon, App, NewAddonParams } from '../../engine/App'
import { pub } from '../../utils/pub'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { ItemNode } from '../../interfaces/item'
import { atLater } from '../../utils/atLater'

import './block-selection.less'

export function createBlockSelectionAddon({ app, $ }: NewAddonParams) {
  class BlockSelection implements IAddon {
    app!: App
    config = {}
    selectedIds: string[] = []
    firstId: string | null = null
    lastId: string | null = null
    editorId: string | null = null

    addonRun() {
      pub.on(pub.evt.selectionChanged, ({ editor }) => {
        atLater(
          () => this.updateSelection(editor),
          'block-selection-update',
          50
        )
      })

      pub.on(pub.evt.editorChanged, ({ editor }) => {
        if (this.selectedIds.length > 0) {
          atLater(
            () => this.updateSelection(editor),
            'block-selection-reapply',
            80
          )
        }
      })
    }

    updateSelection(editor: ItemEditor) {
      this.clearSelection()

      if (!editor.selection) {
        return
      }

      let itemSel
      try {
        itemSel = editor.itemSelection()
      } catch {
        return
      }

      if (itemSel.isCollapsed || !itemSel.isMulti) {
        return
      }

      const entries = editor.itemsFromSelection()
      if (!entries || entries.length === 0) {
        return
      }

      this.editorId = editor.editorId
      this.firstId = (entries[0]?.[0] as ItemNode)?.$id ?? null
      this.lastId = (entries[entries.length - 1]?.[0] as ItemNode)?.$id ?? null

      const editorViewDom = document.querySelector(
        `[data-editor-id="${this.editorId}"]`
      )
      if (editorViewDom) {
        editorViewDom.classList.add('editor-block-selection')
      }

      this.selectedIds = []
      for (const [node] of entries) {
        const item = node as ItemNode
        this.selectedIds.push(item.$id)
        const dom = document.getElementById(item.$id) as HTMLElement | null
        if (dom) {
          dom.classList.add('node-block-selected')
          if (item.$id === this.firstId) {
            dom.classList.add('node-block-selection-start')
          }
          if (item.$id === this.lastId) {
            dom.classList.add('node-block-selection-end')
          }
        }
      }
    }

    clearSelection() {
      for (const id of this.selectedIds) {
        const dom = document.getElementById(id) as HTMLElement | null
        if (dom) {
          dom.classList.remove(
            'node-block-selected',
            'node-block-selection-start',
            'node-block-selection-end'
          )
        }
      }
      this.selectedIds = []
      this.firstId = null
      this.lastId = null
      if (this.editorId) {
        const editorViewDom = document.querySelector(
          `[data-editor-id="${this.editorId}"]`
        )
        editorViewDom?.classList.remove('editor-block-selection')
        this.editorId = null
      }
    }
  }

  return { blockSelection: new BlockSelection() }
}
