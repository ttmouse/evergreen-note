import { App, NewAddonParams, IAddon } from '../../engine/App'
import { cover } from '../../engine/helper'
import { ItemNode } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import {
  Editor,
  Element,
  Transforms,
  Range,
  Path,
  Node,
  ReactEditor,
  Location,
} from '../../slate.inc'
import { mkid } from '../../utils/string/mkid'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { createInlinesBarAddon } from './InlinesBar/InlinesBar'
import { omit } from '../../utils/object/omit'

export type InlineElement = Element & {
  inline: boolean
  isVoid?: boolean
  blockType: string
  /**
   * The id of the inline element
   */
  iky: KyString
  value?: any
}

export function createInlinesAddon(params: NewAddonParams) {
  const { app, $ } = params
  class Inlines implements IAddon {
    app!: App
    config = {}

    selectedElementKy: KyString = ''

    rememberSelectedElement(iky: KyString) {
      this.selectedElementKy = iky
    }

    createElement<T extends InlineElement>(
      type: string,
      text?: string,
      extra?: { [k: string]: any }
    ): T {
      extra = extra || {}
      if ('text' in extra) {
        throw new Error(`extra.text is deprecated`)
      }
      return {
        inline: true,
        blockType: type,
        iky: mkid(),
        children: text ? [{ text }] : [{ text: '' }],
        ...extra,
      } as T
    }

    /**
     * Set the props of the inline element
     * @param editor
     * @param at
     * @param props
     */
    setProps<T extends InlineElement>(
      editor: ItemEditor,
      at: Path | T,
      props: Partial<T> & { iky: KyString }
    ) {
      if (!Path.isPath(at)) {
        at = ReactEditor.findPath(editor as any, at)
      }
      const path = editor.itemPathText(at)
      const { iky } = props
      for (const [n, p] of Node.children(editor, path)) {
        if ((n as T).iky === iky) {
          $.inlines.setNodes(
            editor,
            { ...n, ...omit(props, ['text'] as any) },
            { at: p }
          )
          break
        }
      }
    }

    setNodes(...args: Parameters<typeof Transforms.setNodes>) {
      Transforms.setNodes(...args)
    }

    /**
     * Set the text of the inline element
     * @param editor
     * @param elPath
     * @param text
     */
    setText(editor: ItemEditor, at: Path, text: string) {
      try {
        Transforms.delete(editor, {
          at: {
            anchor: {
              path: at.concat(0),
              offset: 0,
            },
            focus: {
              path: at.concat(0),
              offset: Node.string(Node.get(editor, at)).length,
            },
          },
        })
        Transforms.insertText(editor, text, { at })
      } catch (error) {
        console.error(error)
      }
    }

    dbSetProps<T extends InlineElement>(
      ky: KyString,
      props: Partial<T> & { iky: KyString }
    ) {
      const { dbMemory } = this.app.addons
      const item = dbMemory.getItem(ky)
      const { iky } = props
      if (Array.isArray(item.leaves)) {
        const leaves = item.leaves.map((leaf) =>
          (leaf as T).iky === iky ? { ...leaf, ...props } : leaf
        )
        dbMemory.updateItem(item.ky, { leaves })
      }
    }

    getProps<T extends InlineElement>(
      editor: ItemEditor,
      at: Path,
      iky: KyString
    ): T | null {
      const path = editor.itemPathText(at)
      for (const [n, p] of Node.children(editor, path)) {
        if ((n as T).iky === iky) {
          return n as any
        }
      }
      return null
    }

    isActive(editor: ItemEditor, blockType: string) {
      const [el] = Editor.nodes(editor, {
        match: (n) =>
          !Editor.isEditor(n) &&
          Element.isElement(n) &&
          (n as ItemNode).blockType === blockType,
      })
      return !!el
    }

    toggle(editor: ItemEditor, inlineElement: InlineElement) {
      this.isActive(editor, inlineElement.blockType)
        ? this.unwrap(editor, inlineElement.blockType)
        : this.wrap(editor, inlineElement)
    }

    wrap(editor: ItemEditor, inlineElement: InlineElement) {
      const { selection } = editor
      const isCollapsed = selection && Range.isCollapsed(selection)

      if (isCollapsed) {
        Transforms.insertNodes(editor, inlineElement)
      } else {
        Transforms.wrapNodes(editor, inlineElement, { split: true })
        Transforms.collapse(editor, { edge: 'end' })
      }
    }

    unwrap(editor: ItemEditor, blockType: string, at?: Location) {
      Transforms.unwrapNodes(editor, {
        at: at as any,
        match: (n) =>
          !Editor.isEditor(n) &&
          Element.isElement(n) &&
          (n as ItemNode).blockType === blockType,
      })
    }

    findEntry(editor: ItemEditor, iky: KyString) {
      for (const entry of Editor.nodes(editor, {
        match: (n) => (n as InlineElement).iky === iky,
      })) {
        return entry
      }
      return null
    }

    extractIkys(leaves: InlineElement[]): KyString[] {
      const ikys: KyString[] = []
      for (const leaf of leaves) {
        if ('iky' in leaf) {
          ikys.push(leaf.iky)
        }
      }
      return ikys
    }

    assertTextChildren(leaves: InlineElement[]) {
      for (const leaf of leaves) {
        if (leaf.children && (leaf as any).text) {
          throw new Error(`A leaf can't have both text and children`)
        }
      }
    }

    addonRun() {
      const { dbMemory, inlines } = this.app.addons
      const { saveItem } = dbMemory
      cover(saveItem, (item, ...args) => {
        if (Array.isArray(item.leaves)) {
          inlines.assertTextChildren(item.leaves as any)
          const newItem = {
            ...item,
            ikys: inlines.extractIkys(item.leaves as any),
          }
          return saveItem.call(dbMemory, newItem, ...args)
        }
        return saveItem.call(dbMemory, item, ...args)
      })
    }
  }

  return {
    inlines: new Inlines(),
    ...createInlinesBarAddon(params),
  }
}
