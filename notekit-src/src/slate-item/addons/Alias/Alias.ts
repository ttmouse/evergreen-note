import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { after, cover } from '../../engine/helper'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { notEmpty } from '../../utils/isEmpty'
import { showSnack } from '../../utils/msg/showSnack'
import { trim } from '../../utils/string/trim'

export const APP_ALIASES_KY = 'AppAliases'

function lowerEqual(a: string, b: string) {
  return trim(a).toLowerCase() === trim(b).toLowerCase()
}

export function createAliasAddon({ $ }: NewAddonParams) {
  class TopicAlias implements IAddon {
    app!: App
    config = {}

    find(keyword: string): string[] | null {
      const defItem = $.alias.getDefItem(keyword)
      if (defItem?.mentions) {
        return defItem.mentions.map(trim)
      }
      return null
    }

    getDefItem(topicTitle: string) {
      const items = $.dbMemory.getItemsByIndex('path', APP_ALIASES_KY)
      const result = $.search.findAll(`link(${topicTitle})`, { items })
      return result[0]
    }

    getBacklinkItems(ky: KyString) {
      const item = $.dbMemory.getItem(ky)
      const result: UnitPersist[] = []
      if (item.topic) {
        const topicTitle = Item.headString(item)
        const aliases = $.alias
          .find(topicTitle)
          ?.filter((str) => !lowerEqual(str, topicTitle))
        if (notEmpty<string[]>(aliases)) {
          for (const str of aliases) {
            const list = $.backlink.getLinkedItemsByTopic(str)
            result.push(...list)
          }
        }
      }
      return result
    }

    addonInfo() {
      return {
        title: $t`alias.title`,
        quote: $t`alias.quote`,
        type: 'fieldset',
        defaultValue: 'off',
        subitems: {
          aliasManage: {
            title: $t`alias.management`,
            type: 'button',
            onClick() {
              $.floatViewer.show({
                title: $t`alias.management`,
                item: APP_ALIASES_KY as any,
                container: createTmpDom(),
              })
            },
            quote: $t`alias.management_quote`,
            others: {
              btnText: $t`common.manage`,
            },
          },
        },
      }
    }

    addonRun() {
      $.editorView.addDropdown({
        aliases: {
          title: $t`alias.editor_dropdown_label`,
          icon: 'svg_alias',
          onClick(e, { item }) {
            const headString = Item.headString(item)
            let theItem = $.alias.getDefItem(headString)
            const title = $t(`alias.float_view_title`, {
              topic: headString,
            })
            if (!theItem) {
              theItem = APP_ALIASES_KY as any
            }
            $.floatViewer.show({
              title,
              item: theItem,
              keepTitleVisible: true,
            })
          },
        },
      })

      $.topic.createTopic('App/Aliases', {
        ky: APP_ALIASES_KY,
      })

      const { route } = $.topic
      cover(route, (topicTitle, ...args) => {
        const topicAlias = this.find(topicTitle)
        if (notEmpty(topicAlias) && !lowerEqual(topicAlias![0], topicTitle)) {
          const [mainTopicTitle] = topicAlias!
          showSnack(`Redirect from [[${topicTitle}]] to [[${mainTopicTitle}]]`)
          route.call($.topic, mainTopicTitle, ...args)
          return
        }
        route.call($.topic, topicTitle, ...args)
      })

      // 处理反向链接的同义词
      after($.backlink?.getLinkedItems, (prevResult, ky) => {
        const result = $.alias.getBacklinkItems(ky)
        return [...prevResult, ...result]
      })

      // 处理 Unlinked references 中的同义词
      const { getUnlinkedItemsByTopic } = $.backlink
      cover(getUnlinkedItemsByTopic, (...keywords) => {
        if (keywords.length === 1) {
          const aliases = $.alias.find(keywords[0])
          if (Array.isArray(aliases) && aliases.length > 1) {
            return getUnlinkedItemsByTopic.call($.backlink, ...aliases)
          }
        }
        return getUnlinkedItemsByTopic.call($.backlink, ...keywords)
      })

      // 处理图谱中的同义词
      // const { getTopic } = $.networkGraph;
      // cover(getTopic, (topicTitle) => {
      //   const aliases = $.alias.find(topicTitle);
      //   if (notEmpty(aliases)) {
      //     [topicTitle] = aliases!;
      //   }
      //   return getTopic.call($.networkGraph, topicTitle);
      // });
    }
  }

  return { alias: new TopicAlias() }
}
