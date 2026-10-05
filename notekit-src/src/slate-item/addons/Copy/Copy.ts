import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { IS_CLIENT } from '../../constants'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after } from '../../engine/helper'
import { Item, ItemNode } from '../../interfaces/item'
import { ItemTransforms } from '../../transforms/item'
import { UnitPersist } from '../../interfaces/unit'
import { copy } from '../../utils/clipboard'
import { $$ } from '../../utils/lang'
import { composeId } from '../DbDisk/helper'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { getRangeTextData } from '../EditorView/helper'
import { ExportFormat } from '../Exports/Exports'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { ROUTE_KEY } from '../Router/Router'
import { normalizeItem } from '../DbMemory/helper'

export const COPY_CUT_PREFIX = '##NotekitCutItems## '

export function createCopyAddon({ app, $ }: NewAddonParams) {
  class Copy implements IAddon {
    app!: App
    config = {}

    string(source: string) {
      navigator.clipboard.writeText(source)
    }

    markdown(item: UnitPersist) {
      // $.copy.string(Item.blockString(item, { parseRefer: true }))
      const treeItem = $.dbMemory.getItem(item.ky, { isRecur: true })
      const str = $.exports.getString('markdown', {
        data: treeItem,
        item: treeItem as any,
      })
      return $.copy.string(str)
    }

    plain(item: UnitPersist) {
      // $.copy.string(Item.blockString(item, { parseRefer: true }))
      const treeItem = $.dbMemory.getItem(item.ky, { isRecur: true })
      const str = $.exports.getString('plain', {
        data: treeItem,
        item: treeItem as any,
      })
      return $.copy.string(str)
    }

    ref(item: UnitPersist) {
      $.copy.string(`((${item.ky}))`)
    }

    embed(item: UnitPersist) {
      $.copy.string(`{{Embed src="${item.ky}"}}`)
    }

    block(item: ItemNode) {
      const cloneItem = Item.clone(
        $.dbMemory.getItem(item.ky, { isRecur: true })
      )
      $.copy.string($.exports.getString('fulljson', { data: cloneItem, item }))
    }

    webUrl(item: UnitPersist) {
      const dbid = item.$dbid ?? $.libAdmin.current.ky
      $.copy.string(
        // eslint-disable-next-line prettier/prettier
        `${window.location.origin}/${ROUTE_KEY}/${item.ky}?lib=${composeId(dbid)}`
      )
    }

    handleEvent(event: React.ClipboardEvent, editor: ItemEditor) {
      $.copy.exec(editor, (type, content) => {
        event.clipboardData.setData(`text/${type}`, content)
      })
    }

    exec(editor: ItemEditor, handler: (type: string, content: any) => void) {
      const { dbMemory, exports } = this.app.addons
      const copyData: { [k in ExportFormat]?: string[] } = {
        plain: [] as string[],
        markdown: [] as string[],
        fulljson: [] as string[],
      }
      editor.itemsBatch((_: unknown, { at }) => {
        const item = editor.item(at)
        const tree = dbMemory.getItem(item.ky, { isRecur: true })
        for (const [type] of Object.entries(copyData)) {
          const params = {
            data: tree,
            item,
            indentLevel: 0,
          }
          const exportedData = exports.getString(type as ExportFormat, params) // temp solution
          ;(copyData as any)[type].push(exportedData)
        }
      }, editor)

      for (const [type, list] of Object.entries(copyData)) {
        let content: string
        if (type === 'fulljson') {
          content = `[${list.join(',')}]`
        } else {
          content = list.join('')
        }
        handler(type, content)
      }
      handler('plain', copyData.markdown?.join(''))
    }

    cut(
      editor: ItemEditor,
      item?: ItemNode,
      setData?: (mime: string, content: string) => void
    ) {
      const { dbMemory, exports } = this.app.addons
      const getCutItem = (ky: string | UnitPersist): UnitPersist => {
        const one = typeof ky === 'string' ? dbMemory.getItem(ky) : ky
        const niceItem = normalizeItem(one)
        const subitems = dbMemory.getSubitems(niceItem.ky)
        niceItem.subitems = [] as UnitPersist[]
        for (const sub of subitems) {
          niceItem.subitems.push(getCutItem(sub))
        }
        return niceItem
      }
      let kys: string[]
      if (item) {
        kys = [item.ky]
      } else {
        kys = []
        editor.itemsBatch((_: unknown, { at }) => {
          kys.push(editor.item(at).ky)
        }, editor)
      }
      if (kys.length === 0) return
      const cutItems = kys.map(getCutItem)
      const markdownParts: string[] = []
      for (const cutItem of cutItems) {
        const tree = dbMemory.getItem(cutItem.ky, { isRecur: true })
        markdownParts.push(
          exports.getString('markdown', {
            data: tree,
            item: tree as ItemNode,
            indentLevel: 0,
            app,
          })
        )
      }
      const md = markdownParts.join('')
      if (setData) {
        setData('text/cut', JSON.stringify(cutItems))
        setData('text/markdown', md)
        setData('text/plain', md)
      } else {
        copy(COPY_CUT_PREFIX + JSON.stringify(cutItems))
      }
      if (item) {
        editor.itemRemove(item.GetSlPath())
      } else {
        editor.itemsBatch((_: unknown, { at }) => {
          ItemTransforms.removeItems(editor, { at })
        }, editor)
      }
    }

    floatMenuItems() {
      return {
        copy: {
          title: $t`common.copy`,
          icon: icons.svg_copy,
          order: 1000,
          subitems: {
            copyRefID: {
              title: $$`((Block ID))`,
              icon: icons.svg_copy,
              order: 100,
              hotkey: 'alt+f1',
              onClick() {
                $.copy.ref($.floatMenu.getContext().item)
              },
            },
            copyEmbed: {
              title: $t`copy.embed`,
              icon: icons.svg_copy,
              order: 200,
              hotkey: 'alt+f2',
              onClick: () => {
                $.copy.embed($.floatMenu.getContext().item)
              },
            },
            copyPlainText: {
              title: $t`copy.plain_text`,
              icon: icons.svg_copy,
              hotkey: 'alt+f3',
              order: 300,
              onClick: () => {
                $.copy.plain($.floatMenu.getContext().item)
              },
            },
            copyItem: {
              title: $t`copy.block`,
              icon: icons.svg_copy,
              hotkey: 'alt+f4',
              order: 400,
              onClick: () => {
                $.copy.block($.floatMenu.getContext().item)
              },
            },
            copyUrl: {
              title: $t`copy.web_url`,
              icon: icons.svg_copy,
              hotkey: 'alt+f5',
              order: 500,
              onClick: () => {
                $.copy.webUrl($.floatMenu.getContext().item)
              },
            },
            copyMarkdown: {
              title: 'Markdown',
              icon: icons.svg_copy,
              hotkey: 'alt+f6',
              order: 700,
              onClick: () => {
                $.copy.markdown($.floatMenu.getContext().item)
              }
            }
          },
        },

        cut: {
          title: $t`common.cut`,
          icon: icons.svg_cut,
          order: 1100,
          hotkey: 'mod+x',
          onClick() {
            const { item, editor } = $.floatMenu.getContext()
            $.copy.cut(editor, item)
          },
        },
      }
    }

    addonCommands(): HotkeyMaps {
      let data = {
        copyRefID: {
          title: $t`common.copy` + $$`((ID))`,
          hotkey: ['alt+f1', 'mod+shift+c'],
          handle({ editor }: { editor: ItemEditor }) {
            $.copy.ref(editor.item())
          },
        },
        copyEmbed: {
          title: $t`common.copy` + $t`copy.embed`,
          hotkey: ['alt+f2', 'mod+shift+e'],
          handle: ({ editor }: { editor: ItemEditor }) => {
            $.copy.embed(editor.item())
          },
        },
        copyPlainText: {
          title: $t`common.copy` + $t`copy.plain_text`,
          icon: icons.svg_copy,
          hotkey: 'alt+f3',
          handle: ({ editor }: { editor: ItemEditor }) => {
            $.copy.plain(editor.item())
          },
        },
        copyItem: {
          title: $t`common.copy` + $t`copy.block`,
          hotkey: 'alt+f4',
          handle: ({ editor }: { editor: ItemEditor }) => {
            $.copy.block(editor.item())
          },
        },
        copyUrl: {
          title: $t`common.copy` + $t`copy.web_url`,
          hotkey: 'alt+f5',
          handle: ({ editor }: { editor: ItemEditor }) => {
            $.copy.webUrl(editor.item())
          },
        },
        copyMarkdown: {
          title: $t`common.copy` + ' Markdown',
          hotkey: 'alt+f6',
          handle: ({ editor }: { editor: ItemEditor }) => {
            $.copy.markdown(editor.item())
          }
        }
      }
      if (IS_CLIENT) {
        data = Object.assign(data, {
        })
      }
      return data
    }

    addonBeforeRun() {
      $.floatMenu?.addItems($.copy.floatMenuItems())
      after($.eventHandler.create, (result, editor) => {
        return {
          ...result,
          onCut: (event: React.ClipboardEvent) => {
            if ((event.target as HTMLDivElement)?.closest('.CodeMirror')) return;
            if (editor.itemSelection().isMulti) {
              event.preventDefault()
              const setData = (mime: string, content: string) => {
                event.clipboardData.setData(mime, content)
              }
              $.copy.cut(editor, undefined, setData)
            } else {
              const fragment = getRangeTextData(editor, editor.selection!)
              event.clipboardData.setData(
                'text/fragment',
                JSON.stringify(fragment)
              )
              const txt = $.markdown.leavesToMarkdown(fragment)
              event.clipboardData.setData('text/plain', txt || '')
            }
          },
          onCopy: (event: React.ClipboardEvent) => {
            if ((event.target as HTMLDivElement)?.closest('.CodeMirror')) return;
            if (editor.itemSelection().isMulti) {
              $.copy.handleEvent(event, editor)
            } else {
              // 行内选中文本的复制
              const fragment = getRangeTextData(editor, editor.selection!)
              event.clipboardData.setData(
                `text/fragment`,
                JSON.stringify(fragment)
              )
              const txt = $.markdown.leavesToMarkdown(fragment)
              event.clipboardData.setData('text/plain', txt || '')
            }
            event.preventDefault()
          },
        }
      })
    }

    addonRun() {
      // Initialization for this Copy
      $.editorView.addDropdown({
        copy: {
          title: $t`common.copy`,
          icon: icons.svg_copy,
          order: 1000,
          subitems: {
            copyRefID: {
              title: $$`((Block ID))`,
              icon: icons.svg_copy,
              order: 100,
              hotkey: 'alt+f1',
              onClick(_: Event, { item }: { item: UnitPersist }) {
                $.copy.ref(item)
              },
            },
            copyEmbed: {
              title: $t`copy.embed`,
              icon: icons.svg_copy,
              order: 200,
              hotkey: 'alt+f2',
              onClick: (_: Event, { item }: { item: UnitPersist }) => {
                $.copy.embed(item)
              },
            },
            copyPlainText: {
              title: $t`copy.plain_text`,
              icon: icons.svg_copy,
              hotkey: 'alt+f3',
              order: 300,
              onClick: (_: Event, { item }: { item: UnitPersist }) => {
                $.copy.plain(item)
              },
            },
            copyItem: {
              title: $t`copy.block`,
              icon: icons.svg_copy,
              hotkey: 'alt+f4',
              order: 400,
              onClick: (_: Event, { item }: { item: UnitPersist }) => {
                $.copy.block(item)
              },
            },
            copyUrl: {
              title: $t`copy.web_url`,
              icon: icons.svg_copy,
              hotkey: 'alt+f5',
              order: 500,
              onClick: (_: Event, { item }: { item: UnitPersist }) => {
                $.copy.webUrl(item)
              },
            },
            copyMarkdown: {
              title: 'Markdown',
              icon: icons.svg_copy,
              hotkey: 'alt+f6',
              order: 700,
              onClick: (_: Event, { item }: { item: UnitPersist }) => {
                $.copy.markdown(item)
              }
            }
          },
        },
      })
    }
  }

  return { copy: new Copy() }
}
