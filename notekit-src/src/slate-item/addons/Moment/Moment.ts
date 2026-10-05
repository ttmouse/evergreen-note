import { IAddon, App, NewAddonParams } from '../../engine/App'
import { MomentComp } from './MomentComp'
import {
  datekit,
  h24,
  isTime,
  todayFmt,
  YYYY_MM_DD,
} from '../../utils/date/datekit'
import { isEmpty } from '../../utils/isEmpty'
import { Item } from '../../interfaces/item'
import { $t } from '../../../i18n'

export type ItemByMoment = {
  moment: { v: boolean }
}

declare global {
  interface AppConf {
    momentFilterRule?: string
  }
}

export function createMomentAddon({ app, $ }: NewAddonParams) {
  class Moment implements IAddon {
    app!: App
    config = {
      momentFlmApi: '',
      momentFilterRule: '',
    }

    createComponent() {
      return MomentComp
    }

    getList(theDate?: YYYY_MM_DD) {
      theDate = theDate ?? $.reminder.fmtToday
      const logic = $.traits.createLogic('under(ky:AppConfigs)')
      const rule = 'is:by-moment'
      const filter = isEmpty(rule) ? null : $.traits.createLogic(rule)
      try {
        const list: UnitPersist[] = []
        let day = datekit(theDate)
        for (let i = 0; i < 2000 && list.length < 1000; i++) {
          const fmtDate = day.format(YYYY_MM_DD)
          const items = $.backlink
            .preventDuplicate(
              (typeof $.dbMemory.indexed.created === 'object' &&
                fmtDate in $.dbMemory.indexed.created
                ? Object.values($.dbMemory.indexed.created[fmtDate]).map((item) =>
                    $.dbMemory.getItem(item.ky, { isRecur: true })
                  )
                : [])
                .filter(
                  (item) =>
                    item &&
                    !item.topic &&
                    !isEmpty(Item.headString(item)) &&
                    !logic.test(item) &&
                    isTime(item.updated) &&
                    (!filter || filter.test(item))
                )
            )
            .sort((a, b) => b.created - a.created)
          list.push(...items)
          day = day.subtract(1, 'day')
        }

        return list
      } catch (e) {
        console.error(e)
        return []
      }
    }

    addonBeforeRun() {
      $.is.addRules({
        'by-moment': (item: UnitPersist) => {
          return typeof (item as any)?.moment === 'object'
        },
      })

      Object.assign($.dbMemory.indexes, {
        created: {
          unique: false,
          indexVal(item: UnitPersist) {
            if (!isEmpty(item.created)) {
              return datekit(item.created).format(YYYY_MM_DD)
            }
          },
        },
      })
    }

    addonInfo() {
      return {
        title: $t`moment.title`,
        quote: $t`moment.quote`,
        defaultValue: 'off',
        updated: 20250417,
        depend: ['backlink'],
        // hidden: true,
        tags: ['time management'],
        type: 'fieldset',
        // subitems: {
        //   momentFilterRule: {
        //     title: 'Moment Filter Rule',
        //     type: 'string',
        //     options: {
        //       'is:by-moment': '从每刻中创建的笔记',
        //       '*': '整库的笔记',
        //     },
        //     quote: `“每刻”的列表中默认按时间顺序展示整库的笔记。可以修改规则，筛选出你希望显示到“每日”列表中的笔记，筛选规则支持使用 ${app.appName} 的数据检索语法`,
        //   },
        //   // momentFlmApi: {
        //   //   type: 'text',
        //   //   title: 'Flomo post API',
        //   //   quote:
        //   //     '如果你希望在“每刻”创建的笔记也同步到 Flomo，可以填写 Flomo 的提交链接，例如：https://flomoapp.com/xxxx/xxxxxx/ca77ab40394e110d65821208230c5c0d/',
        //   // },
        // },
      }
    }

    addonRun() {
      // 注册路由
      $.router?.register({
        moment: {
          title: $t`moment.title`,
          comp: this.createComponent(),
        },
      })

      $.nav?.addItems({
        moment: {
          size: 16,
          order: 2000,
          title: $t`moment.nav_title`,
          icon: 'svg_moment',
          onClick() {
            $.router?.to('/moment')
          },
        },
      })

      // $.hotkey?.register({
      //   timestamp: {
      //     hotkey: 'space',
      //     title: 'Timestamp',
      //     handle({ editor }) {
      //       const text = editor.itemTextPlain()
      //       if (isEmpty(text)) {
      //         editor.insertFragment([
      //           $.bilink.createElement({
      //             topic: h24(),
      //             alias: datekit().format('HH:mm'),
      //           }),
      //           { text: '' },
      //         ])
      //         return false
      //       }
      //       return true
      //     },
      //   },
      // })
    }
  }

  return { moment: new Moment() }
}
