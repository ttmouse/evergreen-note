import { InlineElement } from '../../Inlines/Inlines'
import { App, IAddon, NewAddonParams } from '../../../engine/App'
import { cover } from '../../../engine/helper'
import React from 'react'
import { MemoWhiteboardCanvas } from './WhiteboardCanvas'
import { Graph, Node } from '@antv/x6'
import { $t } from '../../../../i18n'
import { Path, Transforms } from '../../../slate.inc'
import { Item, ItemEntry, ItemNode } from '../../../interfaces/item'
import { ItemTransforms } from '../../../transforms/item'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { pub } from '../../../utils/pub'
import { edgeWrapItem, fixSize } from './helper'
import { DialogProps } from '../../../utils/msg/showDialog'
import { isEmpty } from 'lodash'
import {
  CustomItem,
  SearchDialogComp,
} from '../../Search/SearchDialog/SearchDialogComp'
import { LogicString } from '../../Traits/Logic'
import { KyString } from '../../../interfaces/unit'
import { mkid, nanoid } from '../../../utils/string/mkid'
import { observer } from 'mobx-react'
import { makeAutoObservable } from 'mobx'

export type ItemWithWhiteboardNode = ItemNode & {
  whiteboard: {
    node?: {
      position: { x: number; y: number }
      size: { width: number; height: number }
      zIndex: number
      fixedHeight?: number
    }

    edge?: {
      source: {
        cell: string
      }
      target: {
        cell: string
      }
    }

    edgeParent: boolean
  }
}

export type WhiteboardElement = InlineElement & {
  inline: boolean
  blockType: 'whiteboard'
  children: Node[]
  url: string
}

export function createWhiteboardAddon({ app, $ }: NewAddonParams) {
  /**
   * Whiteboard Addon
   */
  class Whiteboard implements IAddon {
    app!: App
    config = {}

    constructor() {
      makeAutoObservable(this)
    }

    /**
     * Add an item to slash menu to create whiteboard element
     */
    addSlashMenu() {
      $.slashMenu.addItems({
        slashWhiteboard: {
          icon: 'svg_whiteboard',
          title: $t`whiteboard.title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'white board' },
            cn: { v: '白板' },
            pinyin: { v: '' },
            py: { v: '' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, '')
            editor.itemSetProps({ layout: 'whiteboard' })
          },
        },
      })
    }

    insertSubitemsIfNeeded(editor: ItemEditor, itemPath: Path) {
      if (editor.itemCountSubitems(itemPath) < 1) {
        if (editor.itemTextPlain().length < 1) {
          editor.itemFocus(itemPath)
          editor.insertText('Untitled whiteboard')
          Transforms.select(editor, editor.itemPathText())
        }
        ItemTransforms.insertItems(editor, {
          at: itemPath,
          items: Item.make(
            {
              ...edgeWrapItem(editor.item(itemPath).ky),
              diagram: {
                node: {
                  position: { x: -110, y: 60 },
                  size: { width: 220, height: 60 },
                },
              },
            } as any,
            { editor }
          ),
        })
      }
    }

    addonInfo() {
      return {
        title: $t`whiteboard.title`,
        quote: $t`whiteboard.quote`,
        updated: 2023_04_23,
        defaultValue: 'on',
        // type: 'fieldset',
        // subitems: {
        //   whiteboard_dblClickBlank: {

        //   }
        // }
      }
    }

    searchKeyword = ''
    setKeyword(kw: string) {
      $.whiteboard.searchKeyword = kw
    }

    dialogId = 'whiteboard-search'
    showDialog<T>(
      options: Partial<DialogProps<T>> & {
        keyword: LogicString
        pky: KyString
        graph: Graph
        x: number
        y: number
        createNode: (
          x6meta: Node.Metadata,
          itemProps?: Partial<UnitPersist>
        ) => Node.Metadata
        saveNode: (ndoe: Node) => void
      } = {} as any
    ) {
      const {
        keyword = '',
        SnapProps: snap,
        pky,
        graph,
        createNode,
        saveNode,
        x,
        y,
      } = options

      $.whiteboard.setKeyword(keyword)

      const fetchList = (kw: string) => {
        const result =
          isEmpty(kw) || kw.trim() === '-is:topic' ? [] : $.search.findAll(kw)
        result.sort((a, b) => {
          if (!isEmpty(b.topic)) {
            return 1
          }
          return -1
        })

        if (isEmpty(result) && isEmpty(kw)) {
          result.unshift({
            ky: 'search-topic-only',
            headString: (
              <CustomItem
                keyword={kw}
                caption={$t`whiteboard.search_topic_only`}
              />
            ),
            onChoose() {
              $.whiteboard.setKeyword(`is:topic ${kw}`)
            },
          } as any)

          result.unshift({
            ky: 'search-item-only',
            headString: (
              <CustomItem
                keyword={kw}
                caption={$t`whiteboard.search_item_only`}
              />
            ),
            onChoose() {
              $.whiteboard.setKeyword(`-is:topic ${kw}`)
            },
          } as any)
        }

        if (
          !isEmpty(kw) &&
          /[:(]/.test(kw) === false && // kw is not a search command like "tag:xxx"
          !$.topic.isExist(kw)
        ) {
          // 当没有找到对应的 topic 时，提供创建 topic 的选项
          result.unshift({
            ky: 'create-topic',
            headString: (
              <CustomItem
                keyword={kw}
                caption={$t`searchDialog.create_topic`}
              />
            ),
            onChoose() {
              const ky = mkid()
              const newNode = graph.addNode(
                createNode(
                  {
                    shape: 'custom-react-node',
                    x,
                    y,
                  },
                  {
                    ky,
                    pky,
                    topic: kw,
                    isTopic: true,
                    ori: kw,
                    subitems: [Item.newItem({ ori: '', pky: ky })],
                  }
                )
              )
              graph.select(newNode)
              saveNode?.(newNode)

              $.whiteboard.closeDialog()
            },
          } as any)
        }

        if (/[:(]/.test(kw) === false) {
          // 提供 create block 选项
          result.unshift({
            ky: 'create-item',
            headString: (
              <CustomItem keyword={kw} caption={$t`whiteboard.create_block`} />
            ),
            onChoose() {
              $.whiteboard.closeDialog()
              const newNode = graph.addNode(
                createNode(
                  {
                    shape: 'custom-react-node',
                    x,
                    y,
                  },
                  {
                    pky,
                    ori: kw,
                  }
                )
              )
              graph.select(newNode)
              saveNode?.(newNode)
            },
          } as any)
        }

        return result
      }

      const onChoose = ({ item }: any) => {
        const newNode = graph.addNode(
          createNode(
            {
              shape: 'custom-react-node',
              x,
              y,
            },
            {
              leaves: [
                $.embed.createElement({ky: item.ky})
              ],
            } as any
          )
        )
        graph.select(newNode)
        saveNode?.(newNode)
        $.whiteboard.closeDialog()
      }

      const SearchBox = observer(() => {
        return (
          <SearchDialogComp
            keyword={$.whiteboard.searchKeyword}
            fetchList={fetchList}
            onChoose={onChoose}
            placeholder="Search or create"
            allowEmptyKeyword
          />
        )
      })

      $.whiteboard.dialogId = $.dialog.show({
        width: 400,
        dialogId: nanoid(),
        body: <SearchBox />,
        SnapProps: {
          targetBox: {
            left: 0,
            top: 60,
            width: window.innerWidth,
            height: window.innerHeight - 40,
          },
          place: ['center', 'top-in'],
          ...snap,
        },
      })
    }

    closeDialog() {
      $.dialog.close($.whiteboard.dialogId)
    }

    addonBeforeRun() {
      $.layoutFactory?.registerLayouts({
        whiteboard: {
          title: $t`whiteboard.title`,
          icon: 'svg_whiteboard',
        },
      })
    }

    /**
     * Initialize Whiteboard addon
     */
    addonRun() {
      const { renderElement } = $.editorView

      cover(renderElement, (props) => {
        const { element } = props
        if (element.type === 'node-subitems') {
          return <MemoWhiteboardCanvas {...props} />
        }

        return renderElement(props)
      })

      pub.on(
        pub.evt.editorNormalized,
        (editor: ItemEditor, entry: ItemEntry) => {
          const [item, path] = entry
          if (item.layout === 'whiteboard') {
            $.whiteboard.insertSubitemsIfNeeded(editor, path)
            return
          }
          return true
        }
      )

      $.whiteboard.addSlashMenu()
    }
  }

  return { whiteboard: new Whiteboard() }
}
