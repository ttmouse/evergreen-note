import { App, NewAddonParams, IAddon, CommandParams } from '../../engine/App'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { PREVENT_DEFAULT } from '../EventHandler/EventHandler'
import './markdown.less'
import { ItemTransforms } from '../../transforms/item'
import { InlineElement } from '../Inlines/Inlines'
import { Element, Text, Node } from '../../slate.inc'
import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { StrmapParams, ZERO_WIDTH_SPACE } from '../Strmap/Strmap'
import { Item } from '@/slate-item'
import { isEscape } from '@/slate-item/utils/string/isEscape'

export type MarkdownPatterns = { [blockType: string]: string }

export function createMarkdownAddon({ app, $ }: NewAddonParams) {
  class Markdown implements IAddon {
    app!: App
    config = {}

    addSlashItems() {
      const { slashMenu } = this.app.addons
      slashMenu?.addItems({
        slashMenuH1: {
          title: $t`markdown.h1`,
          icon: 'svg_h1',
          order: slashMenu.order.markdown,
          versions: {
            pinyin: { v: 'yi ji biao ti' },
            py: { v: 'yjbt' },
            enAbbr: { v: 'h1' },
            en: { v: 'header 1' },
            cn: { v: '一级标题' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, '')
            editor.itemSetProps({ blockType: 'h1' })
          },
        },
        slashMenuH2: {
          title: $t`markdown.h2`,
          icon: 'svg_h2',
          order: slashMenu.order.markdown,
          versions: {
            pinyin: { v: 'er ji biao ti' },
            py: { v: 'ejbt' },
            enAbbr: { v: 'h2' },
            en: { v: 'header 2' },
            cn: { v: '二级标题' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, '')
            editor.itemSetProps({ blockType: 'h2' })
          },
        },
        slashMenuH3: {
          title: $t`markdown.h3`,
          order: slashMenu.order.markdown,
          icon: 'svg_h3',
          versions: {
            pinyin: { v: 'san ji biao ti' },
            py: { v: 'sjbt' },
            enAbbr: { v: 'h3' },
            en: { v: 'header 3' },
            cn: { v: '三级标题' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, '')
            editor.itemSetProps({ blockType: 'h3' })
          },
        },
        slashMenuDivider: {
          title: $t`markdown.divider`,
          order: slashMenu.order.markdown,
          icon: 'svg_divider',
          versions: {
            pinyin: { v: 'fen ge xian' },
            py: { v: 'fgx' },
            en: { v: 'divider' },
            cn: { v: '分隔线' },
          },
          handle({ editor }) {
            slashMenu.insertText(editor, '')
            editor.itemSetProps({ blockType: 'divider' })
            ItemTransforms.insertNextItems(editor, {
              at: editor.itemPath(),
              focus: true,
            })
          },
        },
      })
    }

    /**
     * Convert an item into markdown string
     * @param item
     * @returns
     */
    itemToMarkdown(item: UnitPersist) {
      return Item.headString(item, { parseRefer: true, rich: true })
    }

    leavesToMarkdown(leaves: Node[]) {
      return Item.headString({ leaves } as UnitPersist, { parseRefer: true, rich: true })
    }

    addonInfo() {
      return {
        title: $t`markdown.title`,
        quote: $t`markdown.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addFloatMenuItems() {
      const set = (blockType: string) => {
        const { editor, item } = $.floatMenu.getContext()
        editor.itemSetProps({ blockType }, item.GetSlPath())
      }

      $.floatMenu?.addItems({
        floatMenuHeaders: {
          title: 'Block',
          icon: icons.svg_h1,
          order: 10000,
          hidden: ['title', 'icon'],
          foot: [
            {
              title: $t`markdown.h1`,
              icon: icons.svg_h1,
              order: 100,
              onClick: () => {
                set('h1')
              },
            },
            {
              title: $t`markdown.h2`,
              icon: icons.svg_h2,
              order: 200,
              onClick: () => {
                set('h2')
              },
            },
            {
              title: $t`markdown.h3`,
              icon: icons.svg_h3,
              order: 300,
              onClick: () => {
                set('h3')
              },
            },
            {
              title: $t`markdown.h4`,
              icon: icons.svg_h4,
              order: 300,
              onClick: () => {
                set('h4')
              },
            },
            {
              title: $t`markdown.h5`,
              icon: icons.svg_h5,
              order: 300,
              onClick: () => {
                set('h5')
              },
            },
            {
              title: $t`markdown.h6`,
              icon: icons.svg_h6,
              order: 300,
              onClick: () => {
                set('h6')
              },
            },
            {
              title: $t`markdown.parapraph`,
              icon: icons.svg_text,
              order: 400,
              onClick: () => {
                set('paragraph')
              },
            },
          ],
        },
      })
    }

    addonCommands(): HotkeyMaps {
      const setBlockType =
        (blockType: string) =>
        ({ editor }: CommandParams) => {
          editor.itemSetProps({ blockType })
          return PREVENT_DEFAULT
        }
      return {
        heading1: {
          title: $t`markdown.h1`,
          hotkey: 'mod+alt+1',
          handle: setBlockType('h1'),
        },
        heading2: {
          title: $t`markdown.h2`,
          hotkey: 'mod+alt+2',
          handle: setBlockType('h2'),
        },
        heading3: {
          title: $t`markdown.h3`,
          hotkey: 'mod+alt+3',
          handle: setBlockType('h3'),
        },
        heading0: {
          title: $t`markdown.parapraph`,
          hotkey: 'mod+alt+0',
          handle: setBlockType('paragraph'),
        },
      }
    }

    addonRun() {
      this.app.addons.strmap?.addRules({
        h1: {
          strmapRule: /^#\s+$/,
          title: '一级标题',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'h1' })
            return ''
          },
        },

        h2: {
          strmapRule: /^##\s+$/,
          title: '二级标题',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'h2' })
            return ''
          },
        },

        h3: {
          strmapRule: /^###\s+$/,
          title: '三级标题',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'h3' })
            return ''
          },
        },

        h4: {
          strmapRule: /^####\s+$/,
          title: '四级标题',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'h4' })
            return ''
          },
        },

        h5: {
          strmapRule: /^#####\s+$/,
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'h5' })
            return ''
          },
        },

        h6: {
          strmapRule: /^######\s+$/,
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'h6' })
            return ''
          },
        },

        // ul: {
        //   // strmapRule: /^(\*|-|\+)\s+$/,
        //   strmapRule: /^\*\s+$/,
        //  //   title: '无序列表',
        //   handle() {
        //     return ''
        //   },
        // },

        blockquote: {
          strmapRule: /^>\s+$/,
          title: '引述',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'blockquote' })
            return ''
          },
        },

        paragraph: {
          strmapRule: /^@\s+$/,
          title: '段落',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: undefined })
            return ''
          },
        },

        divider: {
          strmapRule: /^-{3,}$/,
          title: '水平线',
          handle({ editor }: StrmapParams) {
            editor.itemSetProps({ blockType: 'divider' })
            return '{%enter}'
          },
        },

        // 以下是行内文本样式

        // 加粗
        bold: {
          strmapRule: /\*\*((?:[^*]|\*[^*])+?)\*\*$/,
          handle({ match, textBeforeCaret }: StrmapParams) {
            if (!isEscape(textBeforeCaret, match, '`')) {
              return {
                bold: true,
                text: match[1],
              } as Text
            }
          },
        },

        underline: {
          strmapRule: /__((?:[^_]|_[^_])+?)__$/,
          handle({ match, textBeforeCaret }: StrmapParams) {
            if (!isEscape(textBeforeCaret, match, '`')) {
              return {
                underline: true,
                text: match[1],
              } as Text
            }
          },
        },

        // 斜体
        italic: {
          strmapRule: /\/\/((?:[^/]|\/[^/])+?)\/\/$/,
          handle({ match, textBeforeCaret }: StrmapParams) {
            if (!isEscape(textBeforeCaret, match, '`')) {
              return {
                italic: true,
                text: match[1],
              } as Text
            }
          },
        },

        // 删除线
        strikethrough: {
          strmapRule: /~~((?:[^~]|~[^~])+?)~~$/,
          handle({ match, textBeforeCaret }: StrmapParams) {
            if (!isEscape(textBeforeCaret, match, '`')) {
              return {
                strikethrough: true,
                text: match[1],
              } as Text
            }
          },
        },

        // 高亮
        highlight: {
          strmapRule: /==((?:[^=]|=[^=])+?)==$/,
          handle({ match, textBeforeCaret }: StrmapParams) {
            if (!isEscape(textBeforeCaret, match, '`')) {
              return {
                highlight: true,
                text: match[1],
              } as Text
            }
          },
        },

        // 行内代码
        code: {
          strmapRule: /`([^`]+?)`$/,
          handle({ match, textBeforeCaret }: StrmapParams) {
            if (!isEscape(textBeforeCaret, match, '`')) {
              return {
                code: true,
                text: match[1],
              } as Text
            }
          },
        },
      })
      this.addSlashItems()
      this.addFloatMenuItems()
    }
  }

  return new Markdown()
}
