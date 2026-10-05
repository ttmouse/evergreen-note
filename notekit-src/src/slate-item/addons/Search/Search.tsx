import { App, NewAddonParams } from '../../engine/App'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { StrmapParams, StrmapRuleInfo } from '../Strmap/Strmap'
import { InlineElement } from '../Inlines/Inlines'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { SearchElementComp } from './SearchComp'
import { mkid, userMkid } from '../../utils/string/mkid'
import { Item } from '../../interfaces/item'
import { LogicString } from '../Traits/Logic'
import { isEmpty } from '../../utils/isEmpty'
import { ReactEditor, Element } from '../../slate.inc'
import { atLater } from '../../utils/atLater'
import { showSnack } from '../../utils/msg/showSnack'
import { ItemDOM } from '../../components/ItemView'
import { dialogHide, DialogProps } from '../../utils/msg/showDialog'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { Orderby } from '../Sorter/Sorter'
import { $t } from '../../../i18n'
import { createSearchDialogAddon } from './SearchDialog/SearchDialog'
import { FORM_EL } from '../Form/Form'
import { isInfinity } from '../../utils/number/isInfinity'

export type SearchNeededProps = {
  value: string
  limit?: number
  orderby?: Orderby
  groupby?: string
  layout?: string
  iky?: string
}
export type SearchElement = InlineElement & SearchNeededProps

export type CacheData = {
  [key: string]: UnitPersist[]
}

export function createSearchAddon(params: NewAddonParams) {
  const { app, $ } = params

  class Search implements IAddonElement<SearchElement> {
    app!: App
    config = {
      searchFlatMode: 'off',
    }

    searchKy = userMkid(app.user.id, 'search')

    fieldset() {
      return {
        value: {
          title: 'Keyword',
          type: FORM_EL.text,
        },

        limit: {
          title: 'Limit',
          type: FORM_EL.number,
        },

        orderby: {
          title: 'Order by',
          type: FORM_EL.select,
          options: {
            created: 'Created',
            updated: 'Updated',
            title: 'Title',
          },
        },
      }
    }

    isVoid(val: SearchElement) {
      return $.search.verify(val)
    }

    createComponent() {
      return SearchElementComp
    }

    exportString(el: SearchElement): string {
      return `{{search ${el.value}}}`;
    }

    fromMarkdown(md: string) {
      return undefined
    }

    verify(val: any): val is SearchElement {
      return Element.isElement(val) && (val as any).blockType === 'search'
    }

    strmap(): StrmapRuleInfo {
      return {
        title: 'Search',
        strmapRule: /\{\{search\s+?(.+?)\}\}$/,
        handle({ match }: StrmapParams) {
          return $.search.createElement({ value: match[1] })
        },
      } as any
    }

    slashMenu(): SlashMenuItems {
      return {
        slashSearch: {
          icon: 'svg_search',
          title: $t`search.slash_menu_title`,
          order: $.slashMenu.order.inline,
          versions: {
            en: { v: 'search' },
            cn: { v: '搜索' },
            pingyin: { v: 'sou suo' },
            py: { v: 'ss' },
          },
          handle({ editor }) {
            $.slashMenu.insertText(editor, [
              $.search.createElement({ value: '' }),
            ]);
            $.search.focusInput(editor);
          },
        },
      }
    }

    focusInput(editor: ItemEditor) {
      const domNode = ReactEditor.toDOMNode(
        editor as any,
        editor.itemSelection().anchor.item
      )
      setTimeout(() => {
        const input = domNode.querySelector(
          '.search-input-wrap input'
        ) as HTMLElement
        input?.focus()
      }, 0)
    }

    createElement(props: { value: string }): SearchElement {
      return {
        inline: true,
        isVoid: true,
        iky: mkid(),
        blockType: 'search',
        ...props,
        children: [{ text: `{{search ${props.value}}}` }],
      } as SearchElement
    }

    cacheData: CacheData = {}

    addCache(key: string, items: UnitPersist[]): void {
      const lower = key.toLowerCase()
      $.search.cacheData[lower] = items
      atLater(
        () => {
          delete $.search.cacheData[lower]
        },
        `delete-cache-${lower}`,
        10000
      )
    }

    getCache(kw: string): UnitPersist[] | null {
      const lower = kw.toLowerCase()
      if ($.search.cacheData[lower]) {
        return $.search.cacheData[lower]
      }
      // 不能是 is:xxx 或 (xxx) 这种形式，也不能有 OR
      // 也就是说，不支持复杂的条件
      if (/([:()]| OR |-|NOT|AND)/.test(kw)) {
        return null
      }
      const entries = Object.entries($.search.cacheData)
      entries.sort((a, b) => b[0].length - a[0].length)
      for (const [k, items] of entries) {
        if (lower.startsWith(k)) {
          return items
        }
      }
      return null
    }

    findAll(
      condition: LogicString, // condition to find items
      options: {
        canCache?: boolean
        items?: UnitPersist[] // If not provided, will search all items
        limit?: number // If not provided, will search all items
        isRecur?: boolean // Whether read the subitems for each result item
        foldupEach?: boolean // Whether foldup each result item
        readTrash?: boolean // Whether read the trash items
      } = {},
      forComponent = false
    ): UnitPersist[] {
      const { limit = Infinity, canCache = true } = options
      const cacheRange = $.search.getCache(condition)
      if (canCache && cacheRange) {
        options = {
          ...options,
          items: cacheRange,
        }
      }
      const result = $.search.query(condition, options, forComponent)
      if (
        !isEmpty(result) &&
        isInfinity(limit) &&
        canCache &&
        /([:()]| OR |-|NOT)/.test(condition) === false // 不能是 is:xxx 或 (xxx) 这种形式，也不能有 OR
      ) {
        $.search.addCache(condition, result)
      }
      //console.log(condition)
      return result
    }

    query(
      condition: LogicString, // condition to find items
      options: {
        items?: UnitPersist[] // If not provided, will search all items
        limit?: number // If not provided, will search all items
        isRecur?: boolean // Whether read the subitems for each result item
        foldupEach?: boolean // Whether foldup each result item
        readTrash?: boolean // Whether read the trash items
      } = {},
      forComponent = false
    ): UnitPersist[] {
      // 当指定了 limit 时，所有的数据可能还没遍历完，就已经达到了 limit 的限制，
      // 这里记录一下还剩多少数据没遍历，当下次在缓存中检索时，需要加上这些未被遍历的数据

      // 检查是否使用了小写的 AND 或 OR
      if (
        (/\s+and\s+/i.test(condition) &&
          /\s+AND\s+/.test(condition) === false) ||
        (/\s+or\s+/i.test(condition) && /\s+OR\s+/.test(condition) === false)
      ) {
        showSnack({
          // content: '请使用大写的 AND 或 OR',
          content: $t`search.keyword_case_error`,
          vertical: 'bottom',
          horizontal: 'center',
        })
        console.warn($t`search.keyword_case_error`, condition)
      }

      const { list } = $.dbMemory
      const {
        limit = Infinity,
        items = list,
        isRecur = false,
        foldupEach = false,
        readTrash = false,
      } = options
      const result: UnitPersist[] = []
      const logic = $.traits.createLogic(condition)
      for (const [i, item] of items.entries()) {
        if ((readTrash || Item.isNormalStatus(item)) && logic.test(item)) {
          if (forComponent && item.leaves && item.leaves.some((e: SearchElement)=>e.blockType && e.blockType === 'search')) {
            continue
          }
          const subitems = isRecur
            ? $.dbMemory.getSubitems(item.ky, { isRecur: true })
            : undefined

          result.push({
            ...item,
            foldup: (!isEmpty(subitems) && foldupEach) || item.foldup,
            subitems,
          })
        }
        if (result.length >= limit) {
          break
        }
      }

      return result
    }

    async findAllAsync(
      condition: LogicString, // condition to find items
      options: {
        items?: UnitPersist[] // If not provided, will search all items
        limit?: number // If not provided, will search all items
        isRecur?: boolean // Whether read the subitems for each result item
        foldupEach?: boolean // Whether foldup each result item
        readTrash?: boolean // Whether read the trash items
      } = {},
      forComponent = false
    ) {
      return $.search.findAll(condition, options, forComponent)
    }

    // createSearchTopicIfNotExists(): void {
    //   $.topic?.createTopic('App/Search', {
    //     ky: 'AppSearch',
    //     asky: [this.searchKy],
    //     layout: 'markdown',
    //     subitems: [
    //       {
    //         ky: 'AppSearchComp',
    //         leaves: [
    //           { text: '' },
    //           $.search.createElement({ value: '' }),
    //           { text: '' },
    //         ],
    //       },
    //     ],
    //   });
    // const ky = $.search.searchKy;
    // if (!dbMemory.itemExist(ky)) {
    //   // In some cases, the [[app/search]] topic has been created (imported from other user account),
    //   // but the the ky value of the topic is not equal to $.searchimport { FORM_EL } from '../Form/Form';

    //   // we need to remove the old item and create a new one.
    //   const oldTopicItem = topic.getTopic('app/search') ?? {};
    //   if (notEmpty(oldTopicItem)) {
    //     topic.del('app/search');
    //   }

    //   topic.del('app/search');
    //   const newItem = Item.newItem({
    //     pky: KYS.ROOT,
    //     isTopic: true,
    //     topic: 'app/search',
    //     ori: 'App/Search',
    //     created: time(),
    //     updated: time(),
    //     layout: 'markdown',
    //     ...oldTopicItem, // keep the old item's properties
    //     ky, // put ky at last to override the old ky in oldTopicItem
    //   }) as UnitPersist;
    //   dbMemory.saveItem(newItem);

    //   const newItem2 = Item.newItem({
    //     pky: ky,

    //     created: time(),
    //     updated: time(),
    //     leaves: [
    //       { text: '' },
    //       $.search.createElement({ value: '' }),
    //       { text: '' },
    //     ],
    //   }) as UnitPersist;
    //   dbMemory.saveItem(newItem2);
    // }
    // }

    showDialog<T>(
      options: Partial<DialogProps<T>> & { keyword: LogicString } = {} as any
    ) {
      const { floatViewer, router } = $.search.app.addons
      const { keyword, ...rest } = options
      const dialogId = floatViewer.show({
        SnapProps: {
          targetBox: document.getElementById($.main.ids.extra) as HTMLElement,
          place: ['right-in', 'bottom-out'],
        },
        ...rest,
        item: 'AppSearch',
        editorProps: {
          readOnly: true,
          backlink: false,
          titleVisible: false,
        },
        onItemMounted: ({ container }) => {
          const selector = '.search-input-wrap input'
          const elInput = container.querySelector(selector) as HTMLInputElement
          if (!isEmpty(keyword)) {
            elInput.value = keyword
            elInput.focus()
            elInput.blur()
          }
          // elInput?.select();
          container.addEventListener('click', (e: MouseEvent) => {
            const el = e.target as HTMLElement
            if (
              el.matches('.node-layout-result-1 .node-head *') &&
              window.getSelection()?.isCollapsed
            ) {
              const { $item } = el.closest('.node-layout-result-1') as ItemDOM
              router.to($item)
              dialogHide(dialogId)
            } else if (el.matches('.crumbs-outer *')) {
              dialogHide(dialogId)
            }
          })
        },
      })
      return dialogId
    }

    addonBeforeRun() {
      const { search, hotkey } = $.search.app.addons
      hotkey?.register({
        floatSearch: {
          title: $t`search.title`,
          icon: 'svg_search',
          hotkey: 'mod+p',
          context: 'everywhere',
          handle() {
            const keyword = window.getSelection()?.toString() ?? ''
            search.showDialog({
              keyword,
            })
            return false
          },
        },
        floatSearchFromCurrent: {
          title: $t`search.title`,
          icon: 'svg_search',
          hotkey: 'mod+shift+p',
          context: 'editor',
          handle({ editor }) {
            const item = editor.item()
            if (!item) return;
            search.showDialog({
              keyword: `under(ky:${item.ky}) `,
            })
            return false
          },
        },
      })
    }

    addonInfo() {
      return {
        title: $t`search.title`,
        quote: $t`search.quote`,
        isCore: true,
        defaultValue: 'on',
        // type: 'fieldset',
        // subitems: {
        //   searchFlatMode: {
        //     title: $$`Flat mode`,
        //     type: 'select',
        //     options: {
        //       on: $$`On`,
        //       off: $$`Off`,
        //     },
        //     quote: $$`Search notes in flat mode while using multiple keywords, e.g. "kwA kwB", we treat an item and its subitems as a whole, if the whole contains both "kwA" and "kwB", then the item will be shown in the search result.`,
        //   },
        // },
      }
    }

    addonRun() {
      // $.search.createSearchTopicIfNotExists();

      $.floatBar?.addItems({
        search: {
          title: $t`search.float_bar_title`,
          icon: 'svg_search',
          hotkey: 'mod+p',
          order: 10000,
          onClick(e) {
            const { selectedText } = $.floatBar.getContext()
            $.search.showDialog({
              keyword: selectedText,
              SnapProps: {
                targetBox: (e.target as HTMLElement).closest(
                  '.float-bar'
                )! as HTMLElement,
                place: ['center', 'bottom-out'],
              },
            })
          },
        },
      })

      // setTimeout(() => {
      //   const id = `item-float-${$.search.searchKy}`;
      //   const el = document.getElementById(id);
      //   if (!el) {
      //     $.search.showDialog();
      //     dialogHide(id);
      //   }
      // }, 5000);
    }
  }

  return {
    search: new Search(),
    ...createSearchDialogAddon(params),
  }
}
