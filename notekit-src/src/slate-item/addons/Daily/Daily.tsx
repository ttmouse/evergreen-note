import React from 'react'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import dayjs from 'dayjs'
import { icons } from '../../../components/SvgIcon'
import { DailyScrollComp } from './DailyComp'
import { after } from '../../engine/helper'
import { UnitPersist } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { showSnack } from '../../utils/msg/showSnack'
import { $t } from '../../../i18n'
import { createDailyActivityAddon } from './DailyActivity/DailyActivity'
import { isDateFmt, YYYY_MM_DD } from '../../utils/date/datekit'
import { HotkeyMaps } from '../Hotkey/Hotkey'
import { keyState } from '../KeyClick/helper'

export function isDate(val: any) {
  return isDateFmt(val)
}

/**
 * Daily Note
 */
export function createDailyAddon(params: NewAddonParams) {
  const { app, $ } = params
  class Daily implements IAddon {
    app!: App
    config = {}

    /**
     * The title format of daily note
     */
    format = YYYY_MM_DD

    /**
     * Create a topic with a date
     * @param theDate The date of the topic, default is today
     */
    createTopic(theDate?: string, paramValues?: any): UnitPersist {
      const todayDate = dayjs(theDate).format($.daily.format)
      let topicData = $.topic.getTopic(todayDate)
      if (!topicData) {
        const values = {
          ky: dayjs(theDate).format($.daily.format),
        }
        Object.assign(values, paramValues)
        topicData = $.topic?.createTopic(todayDate, values)
      }
      return topicData!
    }

    getTodayDate() {
      return $.reminder.fmtToday
    }

    getTodayItem() {
      return $.daily.createTopic($.daily.getTodayDate())
    }

    createComponent(theDate?: string) {
      const EditorComponent = $.editorView.createComponent()
      return ({ inFloatWindow }: { inFloatWindow?: boolean }) => {
        const currentDate = theDate ?? $.daily.getTodayDate()
        const topicData = $.daily.createTopic(currentDate || '')
        React.useEffect(() => {
          setTimeout(() => {
            $.main?.setCrumbs([] as any)
          })
        }, [currentDate])
        if (!topicData || isEmpty(topicData)) {
          return null
        }
        return (
          <EditorComponent fromRouter={!inFloatWindow} ky={topicData!.ky} />
        )
      }
    }

    route(ky?: YYYY_MM_DD, extraInfo?: any, itemEditor?: any) {
      ky ??= $.daily.getTodayDate()
      const topicData = $.daily.createTopic(ky)
      $.router.to(topicData, extraInfo, itemEditor)
    }

    getAllTopics() {
      return Object.values($.dbMemory.indexed.topic).filter((item) =>
        isDate(item.topic)
      )
    }

    getPrevious(theDate: string) {
      const allDays = [...$.daily.getAllTopics()]
      allDays.forEach((e: any) => {
        e.$timeTmp = dayjs(e.topic).valueOf()
        return e
      })
      allDays.sort((a: any, b: any) => {
        return b.$timeTmp - a.$timeTmp
      })
      return allDays.find((item) => item.topic && item.topic < theDate)
    }

    addComponentToEditorView() {
      // const Comp = createDailyComp(this.app.addons);
      $.editorView.addMoreComponent(DailyScrollComp as any)
    }

    addonInfo() {
      return {
        title: $t`daily.title`,
        quote: $t`daily.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonCommands(): HotkeyMaps {
      // ⌘L 触发时 meta 仍处于按下状态，router.to 会把这次跳转
      // 误判成「⌘+点击 → 弹窗打开」（Router.tsx 的 mod+click 分支），
      // 所以跳转前先清掉修饰键状态，保证直接在主区打开笔记。
      const openDirectly = (ky?: string) => {
        keyState.pressed.ctrl = 0
        keyState.pressed.meta = 0
        $.daily.route(ky)
      }
      return {
        dailyToday: {
          title: $t`daily.today`,
          icon: 'svg_daily',
          hotkey: 'mod+l',
          context: 'everywhere',
          handle() {
            openDirectly()
          },
        },
        dailyYesterday: {
          title: $t`daily.yesterday`,
          icon: 'svg_daily',
          hotkey: 'mod+shift+l',
          context: 'everywhere',
          handle() {
            openDirectly(
              dayjs().subtract(1, 'day').format($.daily.format) as YYYY_MM_DD
            )
          },
        },
      }
    }

    addonRun() {
      $.topic.lockHead((props) => isDate(props.item?.topic))

      $.nav?.addItems({
        dailynote: {
          size: 18,
          order: 1000,
          title: $t`daily.nav_title`,
          icon: icons.svg_daily,
          onClick(e) {
            $.router?.to('/diaries')
          },
        },
      })

      $.router?.register({
        diaries: {
          title: $t`daily.nav_title`,
          comp: $.daily.createComponent(),
        },
      })
      $.router.addDefault(1, $.daily.createComponent())

      after(
        $.backlink.addComponentToEditorView,
        $.daily.addComponentToEditorView
      )

      // Create today's topic when app starts
      $.daily.createTopic()
    }
  }
  return { ...createDailyActivityAddon(params), daily: new Daily() }
}
