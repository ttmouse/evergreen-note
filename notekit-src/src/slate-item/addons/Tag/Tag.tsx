import { Item, ItemEditor, UnitProps } from '../..'
import { App, NewAddonParams } from '../../engine/App'
import { Text, Node, Path, Element } from '../../slate.inc'
import { isEmpty } from '../../utils/isEmpty'
import { ZERO_WIDTH_SPACE } from '../Strmap/Strmap'
import { ItemTransforms } from '../../transforms/item'
import { TagsComp } from './TagsComp'
import { trimSharp } from './helper'
import { TagCountIcon } from './TagCountIcon'
import { Logic, LogicString } from '../Traits/Logic'
import { pub } from '../../utils/pub/pub'
import { omit } from '../../utils/object/omit'
import { $t } from '../../../i18n'
import { trim } from '../../utils/string/trim'
import { AutoCompleteParams } from '../../components/AutoComplete/AutoComplete'
import { SlashHanlderParams, SlashMenuItems } from '../SlashMenu/SlashMenu'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { IAddonElement } from '../ElementRegistry/ElementRegistry'
import { InlineElement } from '../Inlines/Inlines'
import { mkid } from '../../utils/string/mkid'
import { TagComp } from './TagComponent'
import { TagMenuComp } from './TagMenuComp'
import { Transforms } from '../../slate.inc'

export type TagElement = InlineElement & {
  blockType: 'tag'
  value: string
  children: Node[]
}

export type TextWithTag = Text & {
  tag: boolean
}

export type UnitWithTags = UnitPersist & { tags: string[] }

class TagLogic extends Logic {
  exec(item: UnitPersist) {
    const tag = `#${this.logicStr[0].replace(/^#/, '')}`
    return Array.isArray(item.tags) && item.tags.includes(tag)
  }
}

export const TAG_TOPIC_KY = 'AppTags'

export function createTagAddon({ $ }: NewAddonParams) {
  class Tag implements IAddonElement<TagElement> {
    app!: App
    config = {}

    suggestTriggerPattern = /#(\S*)$/

    open(tag: string) {
      $.search.showDialog({ keyword: `tag(${trimSharp(tag)})` })
    }

    splitTagPath(val: string) {
      const parts = val.split('/').map((part) => part.trim())
      const q = [] as string[]
      const result = [] as string[]
      for (const part of parts) {
        if (part.length > 0) {
          q.push(part)
          result.push(q.join('/'))
        }
      }
      return result
    }

    extractTags(item: UnitPersist) {
      if (isEmpty(item.leaves)) {
        return []
      }
      let tags: string[] = []
      for (const [node] of Node.nodes({ children: item.leaves })) {
        if (
          Text.isText(node) &&
          !isEmpty((node as TextWithTag).tag) &&
          !isEmpty(node.text.trim())
        ) {
          tags.push(...this.splitTagPath(node.text))
        }
        if (
          Element.isElement(node) &&
          (node as TagElement).blockType === 'tag'
        ) {
          tags.push(...this.splitTagPath((node as TagElement).value))
        }
      }
      if (Array.isArray(item.tags)) {
        tags = [
          ...item.tags.filter((tag: string) => tag.endsWith('#')),
          ...tags,
        ]
      }

      return [...new Set(tags)]
    }

    setExtraTags(editor: ItemEditor, itemPath: Path, ...tags: string[]) {
      const item = editor.item(itemPath)
      const originalTags = item.tags || []
      const newTags = [...new Set([...originalTags, ...tags])]
      ItemTransforms.setItems(editor, {
        at: itemPath,
        props: { tags: newTags },
      })
    }

    itemToTagText(item: UnitPersist) {
      const l = item.path
        .slice(1)
        .map((p) => Item.headString($.dbMemory.getItem(p)))
      return (
        l.join('/') +
        (l.length > 0 ? '/' : '') +
        Item.headString(item)
      ).trim()
    }

    getList() {
      return $.dbMemory.getItemsByIndex('path', TAG_TOPIC_KY)
    }

    getSuggestMenu({ editor }: { editor: ItemEditor }): AutoCompleteParams {
      const { suggestTriggerPattern } = this

      const insertTagElement = (itemEditor: ItemEditor, tagValue: string) => {
        const text = itemEditor.itemTextBeforeCaret()
        const match = suggestTriggerPattern.exec(text)
        if (match) {
          Transforms.delete(itemEditor, {
            unit: 'character',
            reverse: true,
            distance: match[0].length,
          })
          itemEditor.insertFragment([
            $.tag.createElement({ tag: tagValue }) as unknown as Node,
            { text: ZERO_WIDTH_SPACE },
          ])
        }
      }

      return {
        title: 'Tag Menu',
        autoRule: () =>
          suggestTriggerPattern.exec(editor.itemTextBeforeCaret()),
        filter: ({ items }: any) => {
          const text = editor.itemTextBeforeCaret()
          const match = suggestTriggerPattern.exec(text)
          const kwRaw = match?.[1] || ''
          const kw = kwRaw.toLocaleLowerCase()
          const seen = new Set<string>()
          const result: any[] = []
          let kwItem: any = null

          for (const tagItem of items) {
            const rawName = $.tag.itemToTagText(tagItem).trim()
            const normalizedName = rawName.toLocaleLowerCase()
            if (seen.has(normalizedName)) continue
            if (kw.length > 0 && !normalizedName.includes(kw)) continue
            if (normalizedName === kw) {
              kwItem = tagItem
              continue
            }
            seen.add(normalizedName)
            result.push({ ...tagItem, __tagName: rawName })
          }

          if (!kwItem && kw.length > 0) {
            result.push({
              __isNewTag__: true,
              __tagName: kwRaw,
              ky: `__new_tag__${kw}`,
            })
          } else if (kwItem) {
            // 将完全匹配的项放到第一位
            result.unshift({
              ...kwItem,
              __tagName: $.tag.itemToTagText(kwItem),
            })
          }

          return result
        },
        map: (item: any) => {
          if (item.__isNewTag__) {
            return {
              id: item.ky,
              title: `New Tag: #${item.__tagName}`,
              icon: 'svg_hash',
              handle({ editor: itemEditor }: SlashHanlderParams) {
                insertTagElement(itemEditor, `#${item.__tagName}`)
              },
            }
          }
          const tagName = item.__tagName || $.tag.itemToTagText(item)
          return {
            id: item.ky,
            title: trimSharp(tagName),
            icon: 'svg_hash',
            handle({ editor: itemEditor }: SlashHanlderParams) {
              insertTagElement(itemEditor, `#${trimSharp(tagName)}`)
            },
          }
        },
        body: () => {
          return $.tag.getList()
        },
      } as any
    }

    tagToTagId(tag: string) {
      return `tag-${trimSharp(tag).toLocaleLowerCase()}`
    }

    save(tag: string) {
      const niceTag = trimSharp(tag)
      const tagPath = $.tag.splitTagPath(niceTag)
      let pky = TAG_TOPIC_KY
      for (const subTag of tagPath) {
        const subTagId = $.tag.tagToTagId(subTag)
        let existingSubTagItem = $.dbMemory.getItem(subTagId)
        if (isEmpty(existingSubTagItem)) {
          const cleanOri = subTag.split('/').slice(-1)[0]
          existingSubTagItem = Item.newItem({
            ori: cleanOri,
            asky: [subTagId],
            pky: pky,
          } as any)
          $.dbMemory.saveItem(existingSubTagItem, {
            saveTime: 1,
          })
        }
        pky = existingSubTagItem.ky
      }
    }

    isTagItem(item: UnitPersist) {
      return item.path?.includes(TAG_TOPIC_KY) && Item.headString(item)
    }

    getCount(tag: string) {
      const indexedTags = $.dbMemory.indexed.tags
      return Object.keys(indexedTags[tag] || {}).length
    }

    createTopic() {
      $.topic.createTopic('App/Tags', {
        ky: TAG_TOPIC_KY,
      })
    }

    handleTagCountIconClick(tagItem: UnitPersist) {
      $.tag.open($.tag.itemToTagText(tagItem))
    }

    handleClick(e: MouseEvent) {
      if (e.target instanceof HTMLElement) {
        const el = e.target.closest('.mark-tag')
        if (el?.textContent) {
          $.tag.open(el.textContent)
        }
      }
    }

    createElement(props: { tag: string }) {
      return {
        inline: true,
        isVoid: true,
        blockType: 'tag',
        value: trim(props.tag),
        iky: mkid(),
        children: [{ text: trim(props.tag) }],
      } as TagElement
    }

    isVoid(val: TagElement) {
      return this.verify(val)
    }

    verify(val: any): val is TagElement {
      return Element.isElement(val) && (val as any).blockType === 'tag'
    }

    createComponent() {
      return TagComp
    }

    slashMenu(): SlashMenuItems {
      return {
        slashTag: {
          title: $t`tag.title`,
          icon: 'svg_hash',
          order: 2000,
          versions: {
            pinyin: { v: 'biao qian' },
            py: { v: 'bq' },
            en: { v: 'tag' },
            cn: { v: '标签' },
          },
          id: 'slashTag',
          handle({ editor }: SlashHanlderParams) {
            $.slashMenu.insertText(editor, '#')
          },
        },
      }
    }

    addonBeforeRun() {
      Logic.register({
        tag: TagLogic,
      })
    }

    addonInfo() {
      return {
        title: $t`tag.title`,
        quote: $t`tag.quote`,
        type: 'fieldset',
        defaultValue: 'on',
        subitems: {
          tagManage: {
            title: $t`tag.management`,
            type: 'button',
            onClick: () => {
              $.floatViewer.show({
                title: $t`tag.management`,
                item: TAG_TOPIC_KY,
                container: createTmpDom(),
                DialogProps: { mask: true },
              })
            },
            others: {
              btnText: $t`common.manage`,
            },
          },
        },
      }
    }

    addonRun() {
      $.editorView?.addMoreComponent(TagMenuComp)

      /*
      需要在节点 blur 之后，才保存标签，否则会产生很多中间状态的标签
      */
      pub.on(pub.evt.itemBlur, ({ item }) => {
        const tags = this.extractTags(item)
        if (tags.length > 0) {
          const originalData = $.dbMemory.getItem(item.ky)
          const originalTags = originalData.tags || []
          const hasDiff =
            tags.some((tag) => !originalTags.includes(tag)) ||
            originalTags.some((tag) => !tags.includes(tag))
          if (!hasDiff) return
          const newItem = { ...item, tags }
          newItem.tags.forEach($.tag.save)
          $.dbMemory.saveItem(newItem)
        } else if ('tags' in item) {
          $.dbMemory.saveItem(omit(item, ['tags']) as any)
        }
      })

      $.tag.createTopic()

      $.editorView.addExtraItems({
        TagsComp,
        TagCountIcon,
      })

      document.addEventListener('click', $.tag.handleClick)
    }
  }

  return { tag: new Tag() }
}
