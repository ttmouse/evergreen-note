import { IAddon, App, NewAddonParams } from '../../engine/App'
import { ItemTransforms } from '../../transforms/item'
import { Item, ItemNode, oriKy } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { pub } from '../../utils/pub'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { Editor, node, Path, Transforms } from '../../slate.inc'
import { pick } from '../../utils/object/pick'
import { isDate } from '../../utils/regexp'
import { SnippetConditionBtn } from './SnippetConditionBtn'
import { after, before } from '../../engine/helper'
import { omit } from '../../utils/object/omit'
import { SnapProps } from '../../utils/msg/showDialog'
import { LogicString } from '../Traits/Logic'
import { $t } from '../../../i18n'
import { addonId } from '../../utils/string/mkid'
import { SnippetBtn } from './SnippetBtn'
import { powerObj } from '../../utils/object/powerObj'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { ReferElement } from '../Refer/Refer'
import { Node } from '../../slate.inc'
import { atLater } from '@/slate-item/utils/atLater'

export type SnippetProps = {
  condition: LogicString
  withTitle?: 'yes' | 'no'
  pick?: (keyof UnitPersist)[]
  applied?: string // 应用过的模板
}
export type UnitWithSnippet = UnitPersist & {
  SNIPPET: LogicString
  snippet: SnippetProps
}
export type UnitWithImportedSnippet = UnitPersist & {
  referSnippet?: KyString[]
}

export const SNIPPET_TOPIC_KY = addonId('snippets')

export function createSnippetAddon({ app, $ }: NewAddonParams) {
  class Snippet implements IAddon {
    app!: App
    config = {}

    // 当要模板的标题节点也要被当作模板内容导入时，
    // 这里指定一些字段，只有这些字段才会被导入
    allowFields: string[] = [] // 例如 ['layout', 'blockStyle']

    allowTitleField(...fields: string[]) {
      this.allowFields.push(...fields)
    }

    detectAndApply(editor: ItemEditor, item: ItemNode) {
      const snippetItem = $.snippet.detect(item)
      if (snippetItem) {
        $.snippet.applies(editor, item.GetSlPath(), snippetItem)
      }
    }

    /**
     * Find a snippet that can be applied to the item
     * @param editor
     * @param activeItem
     * @returns
     */
    detect(activeItem: ItemNode): UnitWithSnippet | false {
      if ($.snippet.hasAppliedSnippet(activeItem)) {
        return false
      }
      const snippetList = $.snippet
        .getSnippetItems()
        .filter((item) => notEmpty(item.SNIPPET))
      for (const snippetItem of snippetList) {
        if ($.traits.match(snippetItem.SNIPPET!, activeItem)) {
          return snippetItem as UnitWithSnippet
        }
      }
      return false
    }

    hasAppliedSnippet(item: UnitPersist) {
      return (
        (typeof item === 'object' && 'referSnippet' in item) ||
        powerObj.get(item, 'snippet.applied')
      )
    }

    /**
     * Apply a snippet to the item
     * @param editor
     * @param path
     * @param snippetItem
     * @returns
     */
    applies(editor: ItemEditor, path: Path, snippetItem: UnitPersist) {
      if (
        editor.itemCountSubitems(path) < 1 ||
        (editor.itemCountSubitems(path) === 1 &&
          editor.itemHasNothing(editor.itemPathFirstSubitem(path)))
      ) {
        const sItem = $.dbMemory.getItem(snippetItem.ky, { isRecur: true })
        if (
          notEmpty(sItem.subitems) ||
          (typeof sItem.snippet === 'object' &&
            sItem.snippet.withTitle === 'yes')
        ) {
          const nextPath = Path.next(path)
          if (Editor.hasPath(editor, nextPath)) {
            editor.itemRemove(nextPath)
          }

          const clone = Item.clone(sItem as any)

          if (
            notEmpty(snippetItem.snippet) &&
            typeof snippetItem.snippet === 'object' &&
            snippetItem.snippet.withTitle === 'yes'
          ) {
            Transforms.insertNodes(
              editor,
              [...snippetItem.leaves, { text: ' ' }],
              {
                at: editor.itemPathText(path).concat(0),
                hanging: false,
                voids: true,
              }
            )
          }

          ItemTransforms.setItems(editor, {
            at: path,
            props: {
              ...pick(clone, $.snippet.allowFields),
              referSnippet: [snippetItem.ky],
            },
          })
          

          if (notEmpty(clone.subitems)) {
            ItemTransforms.insertItems(editor, {
              at: path,
              pos: -1,
              items: clone.subitems?.map((sub) => {
                return Item.make(Item.resolvePkyAndWeight(sub as any), {
                  editor,
                })
              }),
            })
          }

          if (editor.itemTextPlain().length > 0) {
            editor.itemFocusEnd(editor.itemPathFirstSubitem(path))
          }
          return true
        }
      }
      return false
    }

    /**
     * Check if the item has applied a snippet
     * @param item
     * @param snippetKy
     * @returns
     */
    hasApplied(item: UnitPersist, snippetKy: KyString) {
      if (item.referSnippet?.includes(snippetKy)) {
        const subOfSnippet = $.dbMemory.indexed.path[snippetKy]
        if (notEmpty(subOfSnippet)) {
          for (const sub of $.dbMemory.getItemsByIndex('path', item.ky)) {
            // 因为用 snippet 创建新的 item 时，
            // 是使用 cloneKy() 函数来生成新的 ky 值，
            // 因此可以查找新 ky 是否在 snippet 存在对应的原 ky 值，
            // 如果存在，则认为 snippet 被实际应用到了该 item 上了
            const ky = oriKy(sub.ky)
            if (ky in subOfSnippet) {
              return true
            }
          }
        }
      }
      return false
    }

    turnIntoSnippet(editor: ItemEditor, item: ItemNode) {
      ItemTransforms.setItems(editor, {
        at: item.GetSlPath(),
        props: {
          SNIPPET: '',
          snippet: {
            condition: '',
          },
        },
      })
    }

    addSlashMenu() {
      $.slashMenu?.addItems({
        slashAsSnippet: {
          id: 'slash-as-snippet',
          icon: 'svg_snippet',
          title: $t`snippet.turn_into_snippet`,
          order: $.slashMenu.order.others,
          versions: {
            cn: { v: '设为模板' },
            en: { v: 'As snippet' },
            pinyin: { v: 'she wei mo ban' },
            py: { v: 'swmb' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, '')
            $.snippet.turnIntoSnippet(editor, editor.item())
          },
        },

        // slashImportSnippet: {
        //   id: 'slash-import-snippet',
        //   icon: 'svg_snippet',
        //   title: $t`snippet.import_snippet`,
        //   order: $.slashMenu.order.others,
        //   versions: {
        //     cn: { v: '导入模板' },
        //     en: { v: 'Import snippet' },
        //     pinyin: { v: 'dao ru mo ban' },
        //     py: { v: 'drmb' },
        //   },
        //   handle({ editor }) {
        //     $.slashMenu.insertText(editor, '')
        //   },
        // },
      })
    }

    /**
     * Get the snippet items
     * @returns
     */
    getSnippetItems() {
      // eslint-disable-next-line prettier/prettier
      return Object.values($.dbMemory.indexed.SNIPPET)
    }

    /**
     * Get the items that are created with the snippet
     * @param snippetKy
     * @returns
     */
    getItemsAppliedSnippet(snippetKy: KyString) {
      const items = $.dbMemory.indexed.referSnippet?.[snippetKy]
      return (items ? Object.values(items) : [])
      // .filter((item) => $.snippet.hasApplied(item, snippetKy))
    }

    showForm(params: {
      editor: ItemEditor
      item: ItemNode
      SnapProps: SnapProps
    }) {
      const { item, editor } = params
      $.form.popup({
        title: $t`snippet.form_title`,
        initialValues: {
          condition: item.SNIPPET ?? '',
          withTitle: 'no',
          ...(item.snippet ?? {}),
        },
        subitems: {
          condition: {
            type: 'logicString',
            autoFocus: true,
            focused: true,
            title: $t`snippet.condition`,
            quote: $t`snippet.condition_quote`,
            options: {
              [`#${Item.headString(item)}`]: `#${Item.headString(item)}`,
            },
          },
          withTitle: {
            type: 'select',
            title: $t`snippet.with_title`,
            options: {
              yes: $t`common.yes`,
              no: $t`common.no`,
            },
            quote: $t`snippet.with_title_quote`,
          },
        },
        buttons: {
          [$t`common.done`]: (values) => {
            // $.dbMemory.saveItem({
            //   ...omit(item, ['$id']),
            //   SNIPPET: values.condition,
            //   snippet: values,
            // });

            ItemTransforms.setItems(editor, {
              at: item.GetSlPath(),
              props: {
                SNIPPET: values.condition,
                snippet: values,
              },
            } as any)
          },
          [$t`common.cancel`]: null,
        },
        SnapProps: params.SnapProps,
      })
    }

    isSnippet(item: UnitPersist) {
      return !isEmpty(item.snippet) || !isEmpty(item.SNIPPET)
    }

    addonInfo() {
      return {
        title: $t`snippet.title`,
        quote: $t`snippet.quote`,
        type: 'fieldset',
        defaultValue: 'on',
        subitems: {
          snippetManage: {
            title: $t`snippet.management`,
            type: 'button',
            onClick: () => {
              $.floatViewer.show({
                title: $t`snippet.management`,
                item: SNIPPET_TOPIC_KY,
                container: createTmpDom(),
              })
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
        },
      }
    }

    addonBeforeRun() {
      $.indexedCount.addIndexKey('referSnippet')

      $.is.addRules({
        // 检查一个节点是不是 snippet
        snippet(item: UnitPersist) {
          return $.snippet.isSnippet(item)
        },

        // 检查一个节点是否来自于 snippet 的复制
        'from-snippet': (item: UnitPersist) => {
          const arr = item.ky.split('_cp_')
          if (arr.length > 1) {
            const theKy = arr[0]
            const theItem = $.dbMemory.getItem(theKy)
            return $.traits.match(`under(is:snippet)`, theItem)
          }
          return false
        },
      })

      // Display snippet items in the backlink panel
      after($.backlink.getLinkedItems, (result, ky) => {
        const item = $.dbMemory.getItem(ky)
        // A stale or dangling backlink can outlive its target item. The base
        // DbMemory implementation normally returns an empty object here, but
        // other storage adapters may return undefined.
        if (!item) return result

        if (item?.topic === 'app/snippets') {
          return [
            ...result,
            ...$.snippet.getSnippetItems().filter(({ pky }) => pky !== ky),
          ]
        }

        if (notEmpty(item.SNIPPET)) {
          const list = $.snippet
            .getItemsAppliedSnippet(ky)
            .map((one) => $.dbMemory.getItem(one.ky, { isRecur: true }))
          return [...result, ...list]
        }

        if ($.traits.match('under(is(snippet))', item)) {
          const list = $.dbMemory.list.filter((one) =>
            one.ky.startsWith(`${item.ky}_cp_`)
          )
          return [...result, ...list]
        }
        return [...result]
      })

      // 如果一个 item 是用 snippet 创建的，
      // 那么在读取 snippet 的 refer-count 的时候，
      // 把模板的引用数也加上
      after($.refer.getCount, (result, ky) => {
        return $.indexedCount.getCount('referSnippet', ky) + result
      })
    }

    addonRun() {
      $.snippet.addSlashMenu()

      const delayedApply = (editor: ItemEditor, item: ItemNode, time = 100) => {
        atLater(() => {
          $.snippet.detectAndApply(editor, item)
        }, 'apply-snippet-'+item.ky, time)
      }

      pub.on(pub.evt.itemBlur, ({ editor, item }) => {
        delayedApply(editor, item)
      })

      pub.on(pub.evt.editorItemMounted, ({ editor, item }) => {
        // 对Daily note的处理

        if (item.topic && isDate(item.topic)) {
          const path = item.GetSlPath()
          if (
            editor.itemCountSubitems(path) === 1 &&
            editor.itemHasNothing(editor.itemPathFirstSubitem(path))
          ) {
            delayedApply(editor, item, 500)
          }
        }
      })

      pub.on(pub.evt.itemFocus, ({ editor, item }) => {
        // 对空节点，不必等到 blur 事件再检查
        try {
          if (editor.itemHasNothing(item.GetSlPath())) {
            delayedApply(editor, item)
          }
        } catch (e) {
          // console.error(e);
        }
      })

      // Display an input component to set the condition of the snippet
      $.editorView.addExtraItems({
        SnippetBtn,
        SnippetConditionBtn,
      })

      $.topic?.createTopic('App/Snippets', {
        ky: SNIPPET_TOPIC_KY,
        // subitems: [
        //   {
        //     ky: 'weekly-snippet',
        //     ori: 'Weekly (demo)',
        //     SNIPPET: '#weekly',
        //     subitems: [
        //       { ori: 'What did you do this week', ky: 'weekly-done' },
        //       { ori: 'What to do next Week', ky: 'weekly-todo' },
        //       { ori: 'Summary of the Week', ky: 'weekly-summary' },
        //     ],
        //   },
        // ],
      })
    }
  }

  return { snippet: new Snippet() }
}
