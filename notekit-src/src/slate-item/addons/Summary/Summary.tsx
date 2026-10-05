import { IAddon, App, NewAddonParams } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { Path } from '../../slate.inc'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { Item, ItemNode } from '../../interfaces/item'
import { showSnack } from '../../utils/msg/showSnack'
import { ItemTransforms } from '../../transforms/item'
import { pub } from '../../utils/pub'
import { previous } from '../../utils/dom/previous'
import { next } from '../../utils/dom/next'
import { ItemDOM } from '../../components/ItemView'
import { sleep } from '../../utils/sleep'
import { after, cover } from '../../engine/helper'
import { domFindLastVisible, domSetAttr, domUnsetAttr } from './helper'
import { $$ } from '../../utils/lang'
import './summary.less'
import { $t } from '../../../i18n'

export type SummaryInfo = {
  start: KyString
  end: KyString
}

export type SummaryDOM = ItemDOM & {
  $startDom: ItemDOM
  $endDom: ItemDOM
}

export type SummaryItemNode = ItemNode & {
  summary: SummaryInfo
}

export function createSummaryAddon({ $ }: NewAddonParams) {
  class Summary implements IAddon {
    app!: App
    config = {}

    insert(editor: ItemEditor, startPath: Path, info: SummaryInfo) {
      if (
        $.summary.isItemSummarized(info.start) ||
        $.summary.isItemSummarized(info.end)
      ) {
        showSnack({
          content: $t`summary.should_not_intersect`,
          severity: 'warning',
        })
        return
      }

      const summaryItem = editor.itemCreate({
        summary: info,
        ori: '',
        placeholder: 'Summary',
        pky: editor.item(startPath).ky,
      } as any)
      ItemTransforms.insertNextItems(editor, {
        at: startPath,
        items: summaryItem as ItemNode,
        focus: true,
      })
    }

    update(editor: ItemEditor, summaryPath: Path, info: SummaryInfo) {
      ItemTransforms.setItems(editor, {
        at: summaryPath,
        props: {
          summary: info,
        },
      })
      ItemTransforms.moveAfterItems(editor, {
        at: summaryPath,
        after: editor.itemCache(info.start).GetSlPath(),
      })
    }

    isItemSummary(val: any): val is SummaryItemNode {
      return (
        Item.isItem(val) &&
        typeof (val as any).summary === 'object' &&
        typeof (val as any).summary.start === 'string' &&
        typeof (val as any).summary.end === 'string'
      )
    }

    /**
     * 检查一个节点是否处于概括区间
     * 也就是处于 summary-start 和 summary-end 之间的节点
     * @param item
     * @returns
     */
    isItemSummarized(
      item: UnitPersist | KyString
    ): boolean | [1 | 2, KyString] {
      if (typeof item === 'string') {
        item = $.dbMemory.getItem(item)
      }
      if (item.pky in $.summary.indexes) {
        for (const [summaryKy, { start, end }] of Object.entries(
          $.summary.indexes[item.pky]
        )) {
          if (item.ky === summaryKy) {
            continue
          }
          if (item.ky === start) {
            return [1, summaryKy]
          }
          if (item.ky === end) {
            return [2, summaryKy]
          }
          const startItem = $.dbMemory.getItem(start)
          const endItem = $.dbMemory.getItem(end)
          if (
            startItem.weight! < item.weight! &&
            endItem.weight! > item.weight!
          ) {
            return true
          }
        }
      }
      return false
    }

    isItemSummarizedStart(item: UnitPersist) {
      const result = $.summary.isItemSummarized(item)
      return Array.isArray(result) && result[0] === 1 ? result : false
    }

    isItemSummarizedEnd(item: UnitPersist) {
      const result = $.summary.isItemSummarized(item)
      return Array.isArray(result) && result[0] === 2 ? result : false
    }

    enclose(editor: ItemEditor) {
      const sel = editor.itemSelection()
      if (sel?.isMulti) {
        const startItem = sel.anchor.item
        const endItem = sel.focus.item
        if (startItem.pky !== endItem.pky) {
          showSnack({
            content: $t`summary.not_same_parent`,
            severity: 'warning',
          })
          return true
        }
        if (!sel?.anchor?.itemDom?.matches('.node-layout-flexmap *')) {
          showSnack({
            content: $t`summary.not_in_mindmap`,
            severity: 'warning',
          })
          return false
        }
        const info = {
          start: startItem.ky,
          end: endItem.ky,
        }
        $.summary.insert(editor, sel.anchor.path, info)
        return false
      }
      return true
    }

    registerHotkey() {
      $.hotkey?.register({
        summary: {
          icon: 'svg_brace',
          title: $t`summary.title`,
          hotkey: 'mod+j',
          handle({ editor }) {
            return $.summary.enclose(editor)
          },
        },
      })
    }

    fix(summaryDom: SummaryDOM) {
      const { $item, $startDom, $endDom } = summaryDom
      // const { start, end } = ($item as SummaryItemNode).summary;
      const s = `.node[data-summary~='${$item.ky}'] .node-text:not(:scope > .node[data-summary-self][data-ky='${$item.ky}'] *)`

      // 找到最右边的节点
      let right = 0
      for (const el of summaryDom.parentElement!.querySelectorAll(s)) {
        const rect = el.getBoundingClientRect()
        if (rect.right > right) {
          right = rect.right
        }
      }
      const startRect = $startDom.getBoundingClientRect()
      const startTextRect = $startDom
        .querySelector('.node-text')!
        .getBoundingClientRect()

      const parentRect = summaryDom.parentElement!.getBoundingClientRect()

      let height = 0
      // eslint-disable-next-line prettier/prettier
      const lastRect = domFindLastVisible($endDom, '.node-head')?.getBoundingClientRect()
      const endRect = $endDom.getBoundingClientRect()
      if (!lastRect) {
        height =
          endRect.bottom -
          startRect.top -
          12 - // 12 可理解为：大致是行高的一半
          startTextRect.height / 2
      } else {
        height =
          lastRect.bottom -
          startRect.top -
          lastRect.height / 2 -
          startTextRect.height / 2
      }

      const top = startRect.top + startTextRect.height / 2 - parentRect.top
      const left = Math.round(right - parentRect.left)
      Object.assign(summaryDom.style, {
        top: `${top}px`,
        left: `${left}px`,
        height: `${height}px`,
        'z-index': left, // 越往右的 z-index 越大
      })

      // const summaryBodyRect = summaryDom
      //   .querySelector(':scope > .node-body')!
      //   .getBoundingClientRect();

      // const endMarginBottom = summaryBodyRect.bottom - endRect.bottom;
      // if (endMarginBottom > 0) {
      //   Object.assign($endDom.style, {
      //     'margin-bottom': `${endMarginBottom}px`,
      //   });
      //   const h = endMarginBottom + 20;
      //   appendStyle(
      //     `
      //     #${$endDom.id} > .node-head::before {
      //       height: calc(100% + ${h}px);
      //       top: 0px;
      //     }
      //   `,
      //     `summary-fix-mg-${$item.ky}`
      //   );
      // }

      // const startMarginTop = startRect.top - summaryBodyRect.top;
      // if (startMarginTop > 0) {
      //   Object.assign($startDom.style, {
      //     'margin-top': `${startMarginTop}px`,
      //   });
      // }

      // const mapBodyDom = summaryDom.closest(
      //   '.node-layout-flexmap > .node-body'
      // )! as HTMLElement;
      // const mapBodyRect = mapBodyDom.getBoundingClientRect();
      // const diff = mapBodyRect.top - summaryBodyRect.top;
      // if (diff > 0) {
      //   Object.assign(mapBodyDom.style, {
      //     paddingTop: `${diff + 50}px`,

      //   });
      // }
    }

    fixAll(summaryParentDom: HTMLElement) {
      for (const summaryDom of summaryParentDom.querySelectorAll(
        '.node[data-summary-self]'
      )) {
        $.summary.fix(summaryDom as SummaryDOM)

        // 当同一父级节点之内存在多个 summary 节点时，它们有可能会重叠
        // 这里需要重新修正它们的位置
        setTimeout(() => $.summary.fix(summaryDom as SummaryDOM), 500)
      }
    }

    indexes: { [pky: KyString]: { [summaryKy: KyString]: SummaryInfo } } =
      {} as any

    addSummaryIndex(summaryItem: UnitPersist & { summary: SummaryInfo }) {
      const { pky, summary } = summaryItem
      if (!$.summary.indexes[pky]) {
        $.summary.indexes[pky] = {}
      }
      $.summary.indexes[pky][summaryItem.ky] = summary
    }

    /**
     * Add rules to search items
     */
    addIsRules() {
      $.is?.addRules({
        // is:summary
        summary: (item) => $.summary.isItemSummary(item),
        // is:summarized
        summarized: (item) => $.summary.isItemSummarized(item) !== false,
      })
    }

    addonInfo() {
      return {
        title: $t`summary.title`,
        quote: $t`summary.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonBeforeRun() {
      after($.dbMemory.handleIndex, (_, item) => {
        if ($.summary.isItemSummary(item)) {
          $.summary.addSummaryIndex(item)
        }
      })

      $.summary.addIsRules()
    }

    addonRun() {
      $.summary.registerHotkey()

      pub.on(pub.evt.editorItemMounted, async ({ item, itemDom }) => {
        await sleep(10)
        if ($.summary.isItemSummary(item)) {
          const { start, end } = item.summary

          const parentItemDom = itemDom.parentElement!.closest('.node')!
          domSetAttr(parentItemDom, 'data-with-summary', item.ky)

          // 在 HTML 中标记出 summary 节点
          itemDom.setAttribute('data-summary-self', item.ky)
          itemDom.classList.add('node-summary')

          // 在 HTML 中标记出 summary 的开始位置
          const startDom = previous(itemDom, `.node[data-ky=${start}]`)
          domSetAttr(startDom!, 'data-summary-start', item.ky)

          // 在 HTML 中标记 summary 的结束位置
          const endDom = next(itemDom, `.node[data-ky=${end}]`)
          domSetAttr(endDom!, 'data-summary-end', item.ky)

          let flag = false
          for (const el of itemDom.parentElement!.querySelectorAll(
            `.node:not([data-ky='${item.ky}'])`
          )) {
            if (el === startDom) {
              flag = true
            }
            if (flag) {
              domSetAttr(el, 'data-summary', item.ky)
            }
            if (el === endDom) {
              flag = false
              break
            }
          }

          Object.assign(itemDom, {
            $startDom: startDom as ItemDOM,
            $endDom: endDom as ItemDOM,
          })

          $.summary.fix(itemDom as SummaryDOM)

          // 当同一父级节点之内存在多个 summary 节点时，它们有可能会重叠
          // 这里需要重新修正它们的位置
          setTimeout(() => $.summary.fix(itemDom as SummaryDOM), 500)
        }
      })

      const { removeItems, moveItems } = $.itemTransforms ?? {}
      cover(removeItems, (editor, { at }) => {
        const item = editor.item(at)
        if (
          editor.selection &&
          !editor.itemSelection()?.isMulti &&
          Array.isArray($.summary.isItemSummarized(item))
        ) {
          showSnack({
            content: $t`summary.can_not_remove_start_and_end`,
            severity: 'warning',
          })
          return
        }

        removeItems?.call($.itemTransforms, editor, { at })

        if ($.summary.isItemSummary(item)) {
          if (item.ky in $.summary.indexes) {
            delete $.summary.indexes[item.ky]
          }

          document.body
            .querySelectorAll(
              `[data-summary~='${item.ky}'],[data-summary-start~='${item.ky}'],[data-summary-end~='${item.ky}']`
            )
            .forEach((el) => {
              domUnsetAttr(el, 'data-summary', item.ky)
              domUnsetAttr(el, 'data-summary-start', item.ky)
              domUnsetAttr(el, 'data-summary-end', item.ky)
            })
        }
      })

      cover(moveItems, (editor, opt) => {
        if ($.summary.isItemSummary(editor.item(opt.at as Path))) {
          showSnack({
            content: $t`summary.can_not_move_summary`,
            severity: 'warning',
          })
          return
        }
        if (
          Array.isArray($.summary.isItemSummarized(editor.item(opt.at as Path)))
        ) {
          showSnack({
            content: $t`summary.can_not_move_start_and_end`,
            severity: 'warning',
          })
          return
        }
        moveItems.call($.itemTransforms, editor, opt)
      })

      pub.on(pub.evt.editorNormalized, async (_, entry) => {
        const [node] = entry
        await sleep(10)
        if (Item.isItem(node)) {
          try {
            const dom = document.getElementById(node.$id)!
            if ($.summary.isItemSummary(node)) {
              const rect = dom
                .querySelector('.node-text')
                ?.getBoundingClientRect()
              if (rect) {
                Object.assign(
                  (dom.querySelector('.node-head')! as HTMLElement).style,
                  {
                    'flex-basis': `${rect.width}px`,
                  }
                )
              }
            } else if ($.summary.isItemSummarized(node)) {
              const nextDom = next(dom, '[data-summary]')
              if (nextDom) {
                domSetAttr(
                  dom,
                  'data-summary',
                  nextDom.getAttribute('data-summary')!
                )
              }
            }

            if (dom?.matches('[data-with-summary]')) {
              $.summary.fixAll(dom)
            }
          } catch (e) {
            console.error(e)
          }
        }
      })

      // $.floatBar?.addItems({
      //   summary: {
      //     icon: 'svg_brace',
      //     title: $$`Summary`,
      //     onClick: () => {},
      //     render(props: any) {
      //       const { editor, itemDom } = $.floatBar.getContext();
      //       if (
      //         editor?.itemSelection()?.isMulti &&
      //         itemDom.matches('.node-layout-flexmap *')
      //       ) {
      //         const onClick = () => {
      //           $.summary.handle(editor);
      //           $.floatBar.close();
      //         };
      //         return <IconItem {...props} onClick={onClick} />;
      //       }
      //       return null;
      //     },
      //   },
      // });
    }
  }

  return { summary: new Summary() }
}
