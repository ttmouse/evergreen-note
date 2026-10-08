import React from 'react'
import { icons } from '../../../components/SvgIcon'
import { $t } from '../../../i18n'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { TopicListSortableComp } from './TopicListSortableComp'
import { isEmpty } from '../../utils/isEmpty'
import { nanoid } from '../../utils/string/mkid'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'

/**
 * 主题列表插件
 */
export function createTopicListAddon({ app, $ }: NewAddonParams) {
  class TopicList implements IAddon {
    app!: App
    config = {}

    /**
     * 每页显示多少个主题
     */
    itemsPerPage = 25

    /**
     * 默认排序方式
     */
    orderInfo = {
      by: 'created',
      order: 'desc',
    }

    rememberTableOrder(orderInfo: { by: string; order: string }) {
      this.orderInfo = orderInfo
      localStorage.setItem('topicListOrder', JSON.stringify(orderInfo))
    }

    /**
     * 在选择每页显示多少个主题的时候, 记住这个值
     * @param itemsPerPage
     */
    rememberItemsPerPage(itemsPerPage: number) {
      this.itemsPerPage = itemsPerPage
    }

    createComponent() {
      const { topicList, main } = this.app.addons
      return () => {
        React.useEffect(() => { setTimeout(() => { main.setCrumbs([]) }) }, [])
        return (
          <TopicListSortableComp
            list={topicList.getList()}
            currentPage={topicList.currentPage}
            itemsPerPage={topicList.itemsPerPage}
          />
        )
      }
    }

    /**
     * 获取主题列表
     * @returns
     */
    getList() {
      return this.app.addons.topic.getList()
    }

    handleDelete(kyList: KyString[]) {
      kyList.forEach((ky) => {
        this.app.addons.dbMemory.deleteItem(ky, { isRecur: true })
      })
    }

    /**
     * 当前页码
     */
    currentPage = 0

    /**
     * 记住当前页码
     * @param page
     */
    rememberPage(page: number) {
      this.currentPage = page
    }

    addonRun() {
      const { router, nav } = this.app.addons

      appendStyle(`
        .topic-title-link:hover {
          text-decoration: underline !important;
          text-underline-offset: 3px;
        }
        .topic-list-footer .MuiTablePagination-toolbar {
          min-height: 56px;
          padding-left: 0;
          padding-right: 8px;
        }
        .topic-list-footer .MuiTablePagination-selectLabel,
        .topic-list-footer .MuiTablePagination-displayedRows {
          font-size: 13px;
          color: var(--nk-muted);
        }
        .topic-list-footer .MuiTablePagination-toolbar .MuiIconButton-root {
          width: 32px;
          height: 32px;
          padding: 6px;
        }
        .topic-list-footer .MuiTablePagination-toolbar .MuiIconButton-root svg {
          width: 16px;
          height: 16px;
          font-size: 16px;
        }
        @media (max-width: 768px) {
          .topic-list-footer {
            padding-left: 8px;
            column-gap: 8px;
          }
          .MuiTablePagination-spacer,.MuiTablePagination-selectLabel {
            display: none;
          }
        }
      `)

      router?.register({
        topics: {
          title: 'Topic list',
          comp: this.createComponent(),
          minWidth: 790,
        },
      })

      router?.addDefault(100, this.createComponent())

      nav?.addItems({
        topiclist: {
          size: 16,
          order: 2000,
          title: $t`topicList.nav_title`,
          icon: icons.svg_topics,
          onClick(e) {
            router?.to('/topics')
          },
          extra: [
            {
              title: $t`topicList.new_topic_button`,
              icon: 'svg_add',
              onClick(e) {
                e.stopPropagation()

                const targetBox = (e.currentTarget as HTMLElement).closest(
                  '.node-extra'
                ) as HTMLElement
                const formHandler = $.form.popup({
                  title: $t`topicList.new_form_title`,
                  subitems: {
                    topicTitle: {
                      title: $t`topicList.topic_title`,
                      type: 'text',
                      autoFocus: true,
                      focused: true,
                    },
                    layout: {
                      title: $t`layoutFactory.item_menu_title`,
                      type: 'select',
                      options: (() => {
                        const opts = {}
                        for (const [layout, item] of Object.entries(
                          $.layoutFactory.layouts
                        )) {
                          ;(opts as any)[layout] = item.title
                        }
                        return opts
                      })(),
                    },
                  },
                  SnapProps: {
                    targetBox,
                    place: ['right-out', 'top-in'],
                  },
                  onSubmit(values) {
                    const { topicTitle, layout } = values as any
                    const title = isEmpty(topicTitle)
                      ? `Untitled ${nanoid(4)}`
                      : topicTitle
                    const topicData = $.topic.createTopic(title, {
                      layout,
                    })
                    $.router.to(topicData!)
                    formHandler.close()
                  },
                  buttons: {
                    [$t`common.done`]: (values) => {
                      const { topicTitle, layout } = values as any
                      const title = isEmpty(topicTitle)
                        ? `Untitled ${nanoid(4)}`
                        : topicTitle
                      const topicData = $.topic.createTopic(title, {
                        layout,
                      })
                      $.router.to(topicData!)
                    },
                    [$t`common.cancel`]: null,
                  },
                })
              },
            },
          ],
        },
      })

      this.orderInfo = JSON.parse(
        localStorage.getItem('topicListOrder') ?? '{}'
      )
    }
  }

  return { topicList: new TopicList() }
}
