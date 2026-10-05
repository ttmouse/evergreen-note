import React from 'react'
import { App, NewAddonParams, IAddon, CommandMaps } from '../../engine/App'
import { useParams } from 'react-router-dom'
import { isEmpty } from '../../utils/isEmpty'
import { KyString } from '../../interfaces/unit'
import { Item, ItemNode } from '../../interfaces/item'
import { HTMLDecode } from '../../utils/string/HTMLDecode'
import { cover } from '../../engine/helper'
import { pub } from '../../utils/pub'
import { atLater } from '../../utils/atLater'
import { time } from '../../utils/date/time'
import { ElementComponentProps } from '../EditorView/EditorView'
import { showSnack } from '../../utils/msg/showSnack'
import { trim } from '../../utils/string/trim'
import { isDate } from '../Daily/Daily'
import { ItemTransforms } from '../../transforms/item'
import { KYS } from '../../utils/string/mkid'
import { omit } from '../../utils/object/omit'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { keyState } from '../KeyClick/helper'
import { nanoid } from '../../utils/string/mkid'
import { $t } from '../../../i18n'

export type TopicPersist = UnitPersist & {
  topic: string
  isTopic: boolean
}

/**
 * 笔记主题插件
 */
export function createTopicAddon({ app, $ }: NewAddonParams) {
  class Topic implements IAddon {
    app!: App
    config = {}

    /**
     * 创建一个用于显示主题页面的 React 组件
     * @returns
     */
    createComponent() {
      const { editorView, topic: topicAddon } = this.app.addons
      const getTopic = this.getTopic.bind(this)

      return () => {
        const EditorComponent = editorView.createComponent()
        const { topic } = useParams()
        const [topicKy, setTopicKy] = React.useState<string | null>(null)

        React.useEffect(() => {
          if (topic) {
            setTimeout(() => {
              let topicData = getTopic(topic)
              if (!topicData) {
                topicData = topicAddon.createTopic(topic)
              }
              setTopicKy(topicData!.ky)
            })
          }
        }, [topic])

        if (!topicKy) {
          return null
        }
        return <EditorComponent ky={topicKy} />
      }
    }

    getParentTopicItem(item: KyString | UnitPersist): UnitPersist | null {
      if (typeof item === 'string') {
        item = $.dbMemory.getItem(item)
      }
      const visited = new Set<string>()
      while (item && typeof item.pky === 'string' && item.pky.length >= 2) {
        if (visited.has(item.pky)) return null
        visited.add(item.pky)
        const parent = $.dbMemory.getItem(item.pky)
        if (!parent) return null
        if (parent.isTopic) return parent
        item = parent
      }
      return null
    }

    /**
     * Disallow to edit the title of daily note
     * @param props
     * @returns
     */
    lockHead(cond: (props: ElementComponentProps<any>) => boolean) {
      const { renderElement } = $.editorView
      cover(renderElement, (props: ElementComponentProps<any>) => {
        if (props.element.type === Item.partTypes.head && cond(props)) {
          props.attributes.contentEditable = false
        }
        return renderElement.call($.editorView, props)
      })
    }

    /**
     * 创建主题
     * @param topic
     * @param values
     * @returns
     */
    createTopic(topicTitle: string, values: Partial<UnitPersist> = {}) {
      const { dbMemory } = this.app.addons
      const lowerTopic = this.refine(topicTitle)
      if (lowerTopic in dbMemory.indexed.topic === false) {
        const { subitems, ...props } = values
        const topicData = Item.newItem({
          topic: this.refine(topicTitle),
          isTopic: true,
          leaves: [{ text: topicTitle }],
          ori: topicTitle,
          weight: time(),
          ...props,
        })
        dbMemory.saveItem(topicData, {
          saveTime: 1,
        })

        // const first = `${topicData.ky}-${$.libAdmin.current.ky.slice(-3)}1`
        // const subs = subitems ?? [{ ky: first }]
        const subs = subitems ?? []
        subs.forEach((sub: UnitPersist) => {
          dbMemory.saveItem(Item.newItem({ ...sub, pky: topicData.ky }), {
            isRecur: true, 
            // 设置最新的更新时间为1，让它的值小一些，
            // 确保系统生成的主题不会在多设置同步的时候覆盖了已有的主题
            saveTime: 1,
          })
        })
      }

      return this.getTopic(topicTitle)
    }

    /**
     * 根据主题的标题读取 item
     * @param topic 主题的标题
     * @returns
     */
    getTopic(topicTitle: string): UnitPersist | null {
      if (isEmpty(topicTitle)) {
        return null
      }
      const refinedTopic = this.refine(topicTitle)
      const topicData = $.dbMemory.indexed.topic[refinedTopic]
      if (!topicData) {
        return null
      }
      return topicData
    }

    /**
     * 读取主题列表
     */
    getList(): TopicPersist[] {
      return Object.values($.dbMemory.indexed.topic).filter(
        (item) => Item.isNormalStatus(item) && !isEmpty(item.topic)
      ) as TopicPersist[]
    }

    /**
     * 读取链接了某主题的所有 item
     * @param topic
     */
    getMentions(topicTitle: string) {
      return Object.values($.dbMemory.indexed.mentions?.[topicTitle] ?? [])
    }

    groupItems(items: UnitPersist[]) {
      return Item.groupItemsByTopic(items)
    }

    /**
     * 将主题的标题进行净化处理, 使得同一主题标题的不同格式能统一到一个一致的值,
     * 例如: 假设有一个主题为“Personal knowledge management”,
     * 那么它出现在笔记中的格式可能是以下形式:
     * - **Personal** knowledge management
     * - Personal knowledge ~~management~~
     * - Personal Knowledge Management
     * 我们需要将它统一净化成小写的字母, 去除各种与语义无关的格式: personal knowledge management
     * @param topic
     * @returns
     */
    refine(topicTitle: string) {
      return trim(
        HTMLDecode(topicTitle)
          .replace(
            /([[\]`]|\{\{.*?\}\}|\{.*?\}|<.+?>|\s+$|^\s+|\*\*|__|==|--|~~|\/\/|˜˜|▪)/g,
            ''
          )
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .toLowerCase()
      )
    }

    /**
     * 路由跳转到指定的主题页面
     * @param topic
     */
    route(topicTitle: string, ...args: any[]) {
      if (isDate(topicTitle) && $.daily) {
        return $.daily.route(topicTitle)
      }
      const topicData =
        this.getTopic(topicTitle) ?? this.createTopic(topicTitle)
      $.router.to(topicData!, ...args)
    }

    /**
     * 获取主题链接的路径
     * @param theTopic
     * @returns
     */
    getLinkPath(topicTitle: string) {
      topicTitle = this.refine(topicTitle)
      const topicData = this.getTopic(topicTitle)
      return topicData ? `/item/${topicData.ky}` : `/topic/${topicTitle}`
      // return `/topic/${theTopic}`;
    }

    /**
     * 检查主题是否存在
     * @param topic
     * @returns
     */
    isExist(topic: string) {
      return !!this.getTopic(topic)
    }

    del(topic: string): boolean {
      const { dbMemory } = $
      const topicData = this.getTopic(topic)
      if (!topicData) {
        return true
      }
      return dbMemory.deleteItem(topicData.ky)
    }

    /**
     * 在保存 item 时, 若 item 是一个主题, 则更新 item 的 topic 值
     * @param item
     * @returns
     */
    updateTopicProp(item: UnitPersist) {
      const newItem = {
        ...item,
      }
      if (Item.isTopic(item)) {
        newItem.topic = this.refine(Item.headString(item))
      }
      return newItem
    }

    check(item: UnitPersist) {
      const topicTitle = trim(Item.headString(item))
      if (isEmpty(topicTitle)) {
        showSnack({
          content: $t`topic.no_empty`,
          severity: 'error',
        })
        return false
      }
      if ($.topic.isExist(topicTitle)) {
        showSnack({
          content: $t(`topic.has_exist`, { topic: topicTitle }),
          severity: 'error',
        })
        return false
      }
      return true
    }

    turnIntoSubTopic(editor: ItemEditor, item: ItemNode) {
      if (!$.topic.check(item)) {
        return
      }
      const topicTitle = trim(Item.headString(item))
      ItemTransforms.setItems(editor, {
        at: item.GetSlPath(),
        props: {
          isTopic: true,
          topic: $.topic.refine(topicTitle),
        },
      })
    }

    turnIntoRootTopic(editor: ItemEditor, item: ItemNode) {
      if (!$.topic.check(item)) {
        return
      }
      const topicTitle = trim(Item.headString(item))
      ItemTransforms.insertPrevItems(editor, {
        at: item.GetSlPath(),
        items: Item.make(
          {
            leaves: [
              { text: '' },
              $.bilink.createElement({
                topic: topicTitle,
              }),
              { text: '' },
            ],
          },
          { editor }
        ),
      })
      $.dbMemory.saveItem({
        ...omit(item, ['path', 'crumbs']),
        path: [KYS.ROOT],
        crumbs: [
          {
            ky: KYS.ROOT,
            text: '/',
          },
        ],
        isTopic: true,
        topic: $.topic.refine(topicTitle),
        pky: KYS.ROOT,
      })
      editor.withoutSaving(() => {
        editor.itemRemove(item.GetSlPath())
      })
    }

    addonCommands(): HotkeyMaps {
      return {
        newTopic: {
          title: $t`topic.new_topic`,
          icon: 'svg_add',
          hotkey: 'mod+alt+n',
          context: 'everywhere',
          handle() {
            // 与 TopicList 的「添加主题」一致：临时标题 Untitled + 随机后缀，
            // 进入页面后标题处于全选状态，直接输入即改名。
            const topicTitle = `Untitled ${nanoid(4)}`
            // 与 Daily 的 ⌘L 同理：⌘ 仍处于按下状态时 router.to 会把
            // 这次跳转误判成「⌘+点击 → 弹窗打开」，先清掉修饰键状态。
            keyState.pressed.ctrl = 0
            keyState.pressed.meta = 0
            $.topic.route(topicTitle)
            // 路由渲染完成后，把光标放进新页面的标题并全选，直接输入即可命名。
            atLater(
              () => {
                const head = Array.from(
                  document.querySelectorAll('header.node-head')
                ).find((h) => h.textContent?.includes(topicTitle))
                if (!head) return
                const text = head.querySelector('[data-slate-string]')
                  ?.firstChild as Text | undefined
                const sel = window.getSelection()
                if (text && sel) {
                  const range = document.createRange()
                  range.setStart(text, 0)
                  range.setEnd(text, text.length)
                  sel.removeAllRanges()
                  sel.addRange(range)
                } else {
                  ;(head as HTMLElement).focus()
                }
              },
              `focus-new-topic-${topicTitle}`,
              400
            )
          },
        },
        turnIntoSubTopic: {
          hotkey: 'mod+m',
          title: $t`topic.turn_into_sub_topic`,
          handle({ editor }) {
            const item = editor.item()
            $.topic.turnIntoSubTopic(editor, item)
          },
        },
        turnIntoRootTopic: {
          hotkey: 'shift+mod+m',
          title: $t`topic.turn_into_root_topic`,
          handle({ editor }) {
            const item = editor.item()
            $.topic.turnIntoRootTopic(editor, item)
          },
        },
      }
    }

    addonRun() {
      const { router, dbMemory, topic } = this.app.addons
      const { saveItem } = dbMemory

      topic.lockHead((props) => /^app\/.+/i.test(props.item.topic ?? ''))

      cover(saveItem, (item, ...args) => {
        // Stop saving empty topic
        if (item.topic && Item.headString(item).length < 1) {
          showSnack('The topic title should not be empty')
          return dbMemory.getItem(item.ky)
        }

        // 主题改名保存前做重名检查：目标标题已被其他主题占用则阻止保存。
        // 与 check() 不同，这里要排除自身（标题未变时不算重名）。
        if (Item.isTopic(item)) {
          const newTopic = topic.refine(Item.headString(item))
          const oldItem = dbMemory.getItem(item.ky)
          if (
            !isEmpty(newTopic) &&
            newTopic !== oldItem?.topic &&
            topic.isExist(newTopic)
          ) {
            showSnack({
              content: $t(`topic.has_exist`, { topic: newTopic }),
              severity: 'error',
            })
            return oldItem
          }
        }

        const newItem = topic.updateTopicProp(item)
        return saveItem.call(dbMemory, newItem, ...args)
      })

      router?.register({
        'topic/:topic': {
          title: $t`topic.topic`,
          comp: this.createComponent(),
        },
      })

      // pub.on(pub.evt.addonInvoke, (info: any) => {
      //   if (info.invoker === 'editor' && info.method === 'saveItem') {
      //     const [newItem] = info.args
      //     atLater(
      //       () => {
      //         const itemFromDb = this.app.addons.dbMemory.getItem(newItem.ky)
      //         const crumbs = $.crumbs.getCrumbs(itemFromDb)
      //         if (itemFromDb && Array.isArray(crumbs)) {
      //           for (const crumb of crumbs) {
      //             if (crumb.isTopic) {
      //               $.dbMemory.updateItem(crumb.ky, {
      //                 updated: time(),
      //               })
      //             }
      //           }
      //         }
      //       },
      //       `update-topic-${newItem.ky}`,
      //       1000
      //     )
      //   }
      // })

      const cond = () => {
        const { item } = $.floatMenu?.getContext()
        const topicTitle = Item.headString(item)
        return !isEmpty(topicTitle)
      }

      $.floatMenu?.addItems({
        topicalize: {
          title: $t`topic.topicalize`,
          icon: 'svg_turn_into',
          order: 5500,
          cond,
          subitems: {
            toTopic: {
              title: $t`topic.turn_into_sub_topic`,
              icon: 'svg_dot',
              hotkey: 'mod+m',
              onClick() {
                const ctx = $.floatMenu?.getContext()
                $.topic.turnIntoSubTopic(ctx.editor, ctx.item)
              },
            },
            toBilink: {
              title: $t`topic.turn_into_root_topic`,
              icon: 'svg_dot',
              hotkey: 'shift+mod+m',
              onClick() {
                const ctx = $.floatMenu?.getContext()
                $.topic.turnIntoRootTopic(ctx.editor, ctx.item)
              },
            },
          },
        },
      })
    }
  }

  return { topic: new Topic() }
}
