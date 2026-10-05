import { AutoCompleteParams } from '../../components/AutoComplete/AutoComplete'
import { App, NewAddonParams, CommandParams, IAddon } from '../../engine/App'
import { UnitProps, UnitVersions } from '../../interfaces/unit'
import { ReactEditor, Transforms, Node } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { SlashMenuComp } from './SlashMenuComp'
import dayjs from 'dayjs'
import { order } from '../../utils/array/order'
import { browser } from '../../utils/browser'
import { $t } from '../../../i18n'
import { datekit, h24, HH_mm } from '../../utils/date/datekit'

const slashTriggerPattern = browser.legacySafari ? new RegExp(`\\/([^/]*)$`) : new RegExp('(?<!\\/)\\/([^/]*)$')

export const filterItems = (items: UnitProps[], keyword: string, ignoreSpace = true) => {
  const kw = ignoreSpace ? (keyword.toLocaleLowerCase().replaceAll(' ', '')) : (keyword.toLocaleLowerCase());
  if (!isEmpty(kw)) {
    const result: [UnitProps, { pos: number; len: number }][] = []
    for (const item of items) {
      let index = 9999
      let len = 9999
      let content = item.title ?? item.ori
      if (isEmpty(content)) {
        continue
      }
      if (item.quote) {
        content += item.quote
      }
      const pos = (content as string).toLocaleLowerCase().indexOf(kw)
      if (pos > -1) {
        index = pos
        len = (content as string).length
      }
      if (typeof item.versions === 'object') {
        for (const ver of Object.values(item.versions as UnitVersions)) {
          const p = ver.v.toLocaleLowerCase().replace(/ /g, '').indexOf(kw)
          if (p > -1 && p < index) {
            index = p
            len = ver.v.length
          }
        }
      }
      if (index < 9999 && index > -1) {
        result.push([item, { pos: index, len }])
      }
    }
    return result
      .sort((a, b) => {
        const d = a[1].pos - b[1].pos
        if (d === 0) {
          return a[1].len - b[1].len
        }
        return d
      })
      .map((item) => item[0])
  }
  return items.filter((item) => !isEmpty(item.title ?? item.ori))
}

export function withWhenClick({
  subitems,
  editor,
}: {
  subitems: SlashItemProps[]
  editor: ItemEditor
}) {
  return subitems.map((item) => {
    return {
      ...item,
      onClick(params: CommandParams) {
        item.handle({ editor } as SlashHanlderParams)
        ;(params as any).closeMenu(true)
        const at = editor.selection
        ReactEditor.focus(editor as any)
        at && Transforms.select(editor, at)
      },
    }
  })
}

export type SlashHanlderParams = {
  editor: ItemEditor
  closeMenu: (willClose: boolean) => void
}

export type SlashItemProps = Partial<UnitProps> & {
  handle(params: SlashHanlderParams): void
}

export type SlashMenuItems = { [id: string]: SlashItemProps }

export function createSlashMenuAddon({ app, $ }: NewAddonParams) {
  class SlashMenu implements IAddon {
    app!: App
    config = {}
    items = {}

    order = {
      important: 50,
      markdown: 1000,
      inline: 2000,
      layout: 3000,
      others: 100000,
    }

    addItems(items: SlashMenuItems) {
      Object.keys(items).forEach((k) => {
        if (k in $.slashMenu.items) {
          throw new Error(`SlashMenu: ${k} already exists`)
        }
      })
      Object.assign($.slashMenu.items, items)
    }

    getSuggestMenu({ editor }: { editor: ItemEditor }): AutoCompleteParams {
      const menu = {
        title: 'Slash Menu',
        autoRule: () => slashTriggerPattern.exec(editor.itemTextBeforeCaret()),
        filter: ({ items }: any) => {
          const kw = slashTriggerPattern
            .exec(editor.itemTextBeforeCaret())?.[1]
            .toLocaleLowerCase()
          return order(filterItems(items, kw ?? ''))
        },
        body: () => order(Object.values($.slashMenu.items)) as SlashItemProps[],
      }
      return menu as any
    }

    insertText(editor: ItemEditor, text: string | Node[]) {
      editor.replaceTextBeforeCaret(slashTriggerPattern, text)
    }

    addonRun() {
      $.slashMenu.addItems({
        slashMenuTime: {
          id: 'slash-menu-time',
          icon: 'svg_clock',
          title: $t`slash.current_time`,
          order: $.slashMenu.order.important,
          versions: {
            en: { v: 'Current time' },
            pinyin: { v: 'dang qian shi jian' },
            py: { v: 'dqsj' },
            cn: { v: '当前时间' },
          },
          handle({ editor }: SlashHanlderParams) {
            // $.slashMenu.insertText(editor, `${dayjs().format('HH:mm')} `);
            $.slashMenu.insertText(editor, [
              { text: '' },
              $.bilink.createElement({
                topic: h24(),
                alias: datekit().format(HH_mm),
              }),
              { text: '' },
            ])
          },
        },
      })

      $.editorView?.addMoreComponent(SlashMenuComp)
    }
  }

  return new SlashMenu()
}
