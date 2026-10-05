import { $t } from '../../../../i18n'
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { Item, ItemNode } from '../../../interfaces/item'
import { pick } from '../../../utils/object/pick'
import { PopupFormProps } from '../../Form/Form'
import {
  YYYY_MM_DD,
  todayFmt,
  isDateFmt,
  YYYY_MM,
  monthFmt,
  datekit,
} from '../../../utils/date/datekit'
import {
  calcAllDueDates,
  calcDueDate,
  calcDueDays,
  unitOptions,
  weekDayOptions,
  isDue,
  RepeatPlanProps,
  repeatPlanOptions,
  END_OF_MONTH,
  PLAN_STATUS as STATUS,
  PLAN_STATUS,
  calcTimeVals,
} from './countdown'
import { ReminderAddBtn, ReminderBtn } from './ReminderBtn'
import { KyString } from '../../../interfaces/unit'
import { after, before, cover } from '../../../engine/helper'
import { isEmpty, notEmpty } from '../../../utils/isEmpty'
import { Logic } from '../../Traits/Logic'
import { atLater } from '../../../utils/atLater'
import { withReference } from '../../Backlink/LinkedReferenceComp'
import React from 'react'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import { alertStyle } from '../../Form/components/AlertElComp'
import { ReminderCalendarElComp } from './ReminderCalendarElComp'
import { DueLogic } from './DueLogic'
import {
  createExtraDropdown,
  ExtraDropdownContext,
  ExtraDropdownMenu,
} from '../../../components/ItemView/ExtraDropdown'
import { isInfinity } from '../../../utils/number/isInfinity'
import { getPubState } from '../../../hooks/usePubState'
import { HotkeyMaps } from '../../Hotkey/Hotkey'
import { FloatMenuItems } from '../../FloatMenu/FloatMenuComp'
import { time } from '../../../utils/date/time'
import { getPlan, getRelativeDate, makeDoneKy } from './helper'
import { ItemEditor } from '../../EditorFactory/ItemEditor'
import { icons } from '@/components/SvgIcon'
import { showSnack } from '@/slate-item/utils/msg/showSnack'
import { pub } from '@/slate-item/utils/pub'
import { dialogShow } from '@/slate-item/utils/msg/showDialog'
import { ItemDOM } from '@/slate-item/components/ItemView'
import { deepEqual } from '@/slate-item/utils/object/deepEqual'

declare global {
  interface AppConf {
    reminderNotificationKey: string
    reminderDefaultTimeDelta: string
  }
}

export type ItemWithReminder = ItemNode & {
  reminder: {
    plans: RepeatPlanProps[]
  }
}

const DONE_TOPIC = `Task/Done`
const TODO_TOPIC = `Task/Todo`
const DOING_TOPIC = `Task/Doing`
const MENU_NAME = 'reminder-dropdown'
// const fmtToday = todayFmt() // REMOVED: Moved to Reminder class property

export function createReminderAddon({ app, $ }: NewAddonParams) {
  class Reminder implements IAddon {
    app!: App
    config = {}
    fmtToday: YYYY_MM_DD = todayFmt()

    indexed: { [ky: KyString]: ItemWithReminder } = {}
    reverseIndexed: { [ky: KyString]: { [ky: KyString]: ItemWithReminder }[] } = {}
    dueIndexed: {
      [fmtMonth: YYYY_MM]: {
        [fmtDate: YYYY_MM_DD]: { [ky: KyString]: ItemWithReminder }
      }
    } = {}

    menu: FloatMenuItems = {}

    getFieldset() {
      return {
        // dueDate: {
        //   type: 'date',
        //   title: $t`reminder.due_date`,
        // },

        dueDate: ReminderCalendarElComp,

        repeatPlan: {
          title: $t`reminder.repeat_plan`,
          type: 'select',
          options: repeatPlanOptions,
        },

        interval: {
          type: 'group',
          title: $t`reminder.repeat_interval`,
          when: { repeatPlan: 'interval' },
          subitems: {
            step: {
              type: 'number',
              width: 60,
            },

            stepUnit: {
              type: 'select',
              width: 60,
              options: unitOptions,
            },
          },
        },

        dayOfWeek: {
          when: { repeatPlan: 'weekly' },
          title: $t`reminder.day_of_week`,
          type: 'toggleButton',
          multiple: true,
          options: weekDayOptions,
          shape: 'round',
        },

        dayOfMonth: {
          title: $t`reminder.day_of_month`,
          when: { repeatPlan: 'monthly' },
          type: 'select',
          options: (() => {
            const arr = {} as any
            for (let i = 1; i <= 31; i++) {
              arr[i] = $t('reminder.day_of_month_option', { day: i })
            }
            arr[END_OF_MONTH] = $t('reminder.last_day_of_month')
            return arr
          })(),
        },

        DayOfYear({ values }: any) {
          if (values.repeatPlan !== 'yearly') {
            return null
          }
          const [, mm, dd] = (values.dueDate ?? '').split('-')
          if (!mm || !dd) {
            return null
          }
          return (
            <Box>
              <Alert severity="info" className={alertStyle}>
                {$t(`reminder.day_of_year_quote`, { mm, dd })}
              </Alert>
            </Box>
          )
        },

        delay: {
          type: 'date',
          title: `${$t`reminder.delay_date`}`,
          when: (values: any) => !isEmpty(values.delay),
        },

        timeSensitive: {
          type: 'switch',
          title: 'Time Sensitive',
          when: (values: any) => values.repeatPlan !== 'never',
        },

        time: {
          type: 'time',
          title: 'Time',
          when: (values: any) => values.timeSensitive && values.repeatPlan !== 'never',
        },

        timeDelta: {
          type: 'text',
          title: 'Time Delta',
          when: (values: any) => values.repeatPlan !== 'never',
        },
      }
    }

    showForm(
      params: Partial<PopupFormProps<any>> & { item: ItemWithReminder }
    ) {
      const { item } = params
      $.form.popup<any>({
        title: $t`reminder.item_menu_title`,
        initialValues: getPlan(item) ?? {
          dueDate: $.reminder.fmtToday,
          repeatPlan: 'once',
          dayOfWeek: 0,
          dayOfMonth: 1,
          stepUnit: 'day',
          step: 1,
          timeSensitive: false,
          timeDelta: $.prefer.getValue('reminderDefaultTimeDelta') ?? '0',
          time: '09:00',
        },
        subitems: $.reminder.getFieldset() as any,
        onChange(values) {
          // 临时屏蔽 setBaseAndExtent
          const originalSetBaseAndExtent = window.getSelection()!.setBaseAndExtent.bind(window.getSelection())
          window.getSelection()!.setBaseAndExtent = () => {}

          if (values.timeDelta === '') values.timeDelta = '0'
          $.reminder.setPlan(item, values, true);

          // 还原
          Promise.resolve().then(() => {
            window.getSelection()!.setBaseAndExtent = originalSetBaseAndExtent
          })
        },
        ...params,
      })
    }

    clear(item: ItemNode) {
      item.DoModify({ reminder: null })
      item.DoFocus()
      // $.http.progress({
      //   uri: '/api/clear-reminder',
      //   payload: { ky: item.ky },
      // });
    }

    getPlan(item: UnitPersist): RepeatPlanProps | null {
      return (item as ItemWithReminder).reminder?.plans?.[0]
    }

    setPlan(
      item: ItemNode,
      newValues: Partial<RepeatPlanProps>,
      override = false
    ) {
      let newPlan;
      if (override) {
        newPlan = newValues
      } else {
        const plan = getPlan(item)
        if (!plan) {
          return
        }
        newPlan = { ...plan, ...newValues }
      }
      item.DoModify({
        reminder: {
          plans: [newPlan],
        },
      })
      // Process Reminder Reference List
      if (!item.$id) return
      const dom = document.getElementById(item.$id)
      if (!dom) return
      const container = dom.closest("section[ctx-layout=result-container]") as ItemDOM
      if (!container) return
      const date = container.$item.ky.replace(/-remind$/, '')
      if (!isDateFmt(date)) return
      dom.style.transition = 'opacity 0.5s'
      if (calcDueDays(newPlan as RepeatPlanProps, date) === 0) dom.style.opacity = '1'
      else dom.style.opacity = '0.4'
    }

    setDelay(item: ItemNode, days: number) {
      const delayDate = datekit().add(days, 'day').format(YYYY_MM_DD)
      $.reminder.setPlan(item, { delay: delayDate, status: STATUS.delay })
    }

    cancelDelay(item: ItemNode) {
      // 所谓取消延期，就是把延迟日期设置为今天
      $.reminder.setPlan(item, { delay: $.reminder.fmtToday })
    }

    isDelay(item: UnitPersist) {
      const plan = getPlan(item)
      return !isEmpty(plan?.delay) && plan?.delay !== $.reminder.fmtToday
    }

    showDelayForm(params: { item: ItemNode }) {
      const { item } = params

      const onChange = (values: any) => {
        const { delay } = values
        if (delay.length === 0) {
          $.reminder.cancelDelay(item)
        } else {
          $.reminder.setDelay(item, Number(delay))
        }
      }

      const form = $.form.popup({
        title: $t`reminder.menu_delay`,
        initialValues: {
          delay: '',
        },
        subitems: {
          delay: {
            type: 'number',
            title: $t`reminder.delay_days`,
            quote: $t`reminder.delay_days_quote`,
          },
        },
        onChange,
        onSubmit() {
          form.close()
        },
      })
    }

    isReminder(item: UnitPersist) {
      return notEmpty(getPlan(item))
    }

    isDue(item: UnitPersist) {
      const plan = getPlan(item)
      return !!plan && isDue(plan)
    }

    calcDueDays(item: UnitPersist, fmtDate?: YYYY_MM_DD) {
      fmtDate = fmtDate ?? $.reminder.fmtToday
      const plan = getPlan(item)
      return plan ? calcDueDays(plan, fmtDate) : Infinity
    }

    calcDueDate(item: UnitPersist, fmtDate?: YYYY_MM_DD) {
      fmtDate = fmtDate ?? $.reminder.fmtToday
      const plan = getPlan(item)
      return plan ? calcDueDate(plan, fmtDate) : ''
    }

    calcItemAllDueDates(
      item: UnitPersist,
      monthCount = 1,
      currentDate?: YYYY_MM_DD
    ) {
      currentDate = currentDate ?? $.reminder.fmtToday
      const plan = getPlan($.dbMemory.getItem(item))
      return plan ? calcAllDueDates(plan, monthCount, currentDate) : []
    }

    isNever(item: UnitPersist) {
      const days = $.reminder.calcDueDays(item)
      return isInfinity(days)
    }

    setNever(item: ItemNode) {
      const plan = getPlan(item)
      $.reminder.setPlan(item, {
        prevPlan: plan.repeatPlan,
        repeatPlan: 'never',
      })
    }

    cancelNever(item: ItemNode) {
      const plan = getPlan(item)
      $.reminder.setPlan(item, {
        repeatPlan: plan.prevPlan,
      })
    }

    setStatus(item: ItemNode, status: RepeatPlanProps['status']) {
      const plan = getPlan(item)
      if (!plan) {
        return
      }

      const newVal = { status, statusTime: time() } as any
      if (status === STATUS.done) {
        // $.reminder.createDailyRecord(item)
        const set = new Set(plan?.log ?? [])
        set.add(time())
        newVal.log = [...set]
      }
      // if (updateCheckbox) {
      //   $.checkbox.setChecked(item.GetEditor(), item.GetSlPath(), checked)
      // }

      $.reminder.setPlan(item, newVal)
    }

    createDailyRecord(item: UnitPersist) {
      const topicItem = $.topic.getParentTopicItem(item)!
      if (topicItem.ky === $.reminder.fmtToday) {
        return
      }

      $.topic.createTopic($.reminder.fmtToday)
      // $.topic.createTopic(DONE_TOPIC, { ky: DONE_TOPIC.replaceAll('/', '') });

      const donePky = `${$.reminder.fmtToday}-done`
      if (!$.dbMemory.itemExist(donePky)) {
        $.dbMemory.saveItem(
          Item.newItem({
            ky: donePky,
            pky: $.reminder.fmtToday,
            weight: Date.now(),
            leaves: [
              { text: '' },
              $.bilink.createElement({
                topic: DONE_TOPIC,
                alias: $t`reminder.done_today`,
              }),
              { text: '' },
            ],
          })
        )
      }

      const fmtTime = datekit().format('YYYY-MM-DD HH:mm')
      $.dbMemory.saveItem(
        Item.newItem({
          pky: donePky,
          ky: makeDoneKy(item.ky, $.reminder.fmtToday),
          weight: Date.now(),
          leaves: [
            { text: '' },
            $.checkbox.createElement({ value: true }),
            // { text: '' },
            // $.bilink.createElement({
            //   topic: DONE_TOPIC,
            //   alias: $t`reminder.done`,
            // }),
            {
              text: ` ${$t(`reminder.done_at`, { fmtTime })}`,
              format: 'green',
              italic: true,
            } as any,
            $.embed.createElement({ ky: item.ky }),
            { text: '' },
          ],
        })
      )
    }

    getTimeStamp(plan: RepeatPlanProps, thisDay?: YYYY_MM_DD) {
      thisDay = thisDay ?? $.reminder.fmtToday
      const dueDate = calcDueDate(plan, thisDay)
      if (dueDate === '9999-12-31') return Infinity;
      const base = datekit(`${dueDate} ${(plan.timeSensitive ? plan.time : undefined) || '23:59'}`);
      if (dueDate !== thisDay && plan.timeSensitive) {
        let timeVals = calcTimeVals(plan.timeDelta);
        for (const timeVal of timeVals) {
          const newTime =  base.add(timeVal, 'second');
          let dueDateTmp = newTime.format(YYYY_MM_DD);
          if (dueDateTmp === thisDay) {
            return newTime.unix() * 1000;
          }
        }
      }
      return base.unix() * 1000;
    }

    isTodo(item: UnitPersist) {
      const plan = getPlan(item);
      if (!plan) return null;
      if (plan.repeatPlan !== 'once') return null;
      if (plan.status && (plan.status !== PLAN_STATUS.todo)) {
        return null;
      }
      const dueDays = calcDueDays(plan);
      if (dueDays >= 0) return PLAN_STATUS.todo;
      return null;
    }

    getStatus(item: UnitPersist) {
      return getPlan(item)?.status
    }

    updateOneDueDates(item: UnitPersist) {
      // 首先根据reverseIndexed删除过去对这个节点的引用
      for (const dateObj of $.reminder.reverseIndexed[item.ky] ?? []) {
        delete dateObj[item.ky];
      }
      if (!$.reminder.isReminder(item)) return;

      $.reminder.reverseIndexed[item.ky] = [];
      
      // 检查已经计算过的月份
      const calculatedMonths = Object.keys($.reminder.dueIndexed);
      
      for (const fmtMonth of calculatedMonths) {
        // 对于每个已计算的月份，重新计算这个item的due dates
        const monthStartDate = `${fmtMonth}-01` as YYYY_MM_DD;
        const dates = $.reminder.calcItemAllDueDates(item, 1, monthStartDate);
        
        for (const date of dates) {
          const m = monthFmt(date);
          if (m !== fmtMonth) {
            continue;
          }
          
          // 确保日期对象存在
          $.reminder.dueIndexed[fmtMonth][date] ??= {};
          
          // 更新dueIndexed
          $.reminder.dueIndexed[fmtMonth][date][item.ky] = item as ItemWithReminder;
          
          // 更新reverseIndexed
          $.reminder.reverseIndexed[item.ky].push($.reminder.dueIndexed[fmtMonth][date]);
        }
      }
    }

    /**
     * 获取所有日期的所有提醒事项
     * @param currentDate
     * @returns
     */
    calcAllDueDates(currentDate?: YYYY_MM_DD) {
      currentDate = currentDate ?? $.reminder.fmtToday
      const fmtMonth = monthFmt(currentDate)
      // ATTENTION: 增加了计算量
      currentDate = `${fmtMonth}-01`
      $.reminder.dueIndexed[fmtMonth] = {}
      for (const item of Object.values($.reminder.indexed)) {
        const dates = $.reminder.calcItemAllDueDates(item, 1, currentDate)
        for (const date of dates) {
          const m = monthFmt(date)
          if (m !== fmtMonth) {
            continue
          }
          $.reminder.dueIndexed[fmtMonth] ??= {}
          $.reminder.dueIndexed[fmtMonth][date] ??= {}
          $.reminder.dueIndexed[fmtMonth][date][item.ky] = item

          $.reminder.reverseIndexed[item.ky] ??= []
          $.reminder.reverseIndexed[item.ky].push($.reminder.dueIndexed[fmtMonth][date])
        }
      }
      return $.reminder.dueIndexed
    }

    /**
     * 获取指定日期的当月所有提醒
     * @param fmtDate
     * @returns
     */
    getDueItems(fmtDate: YYYY_MM_DD, isRecur = false) {
      const fmtMonth = monthFmt(fmtDate)
      if (!$.reminder.dueIndexed[fmtMonth]) {
        $.reminder.calcAllDueDates(fmtDate)
      }
      const logic = $.traits.createLogic('is:markedDone')
      return Object.values($.reminder.dueIndexed[fmtMonth]?.[fmtDate] ?? {})
        .filter((item) => !logic.exec(item))
        .map((item) => $.dbMemory.getItem(item.ky, { isRecur }))
    }

    /**
     * 获取某一天有多少个提醒
     * @param currentDate
     * @returns
     */
    getCountOfDueItems(currentDate: YYYY_MM_DD) {
      return $.reminder.getDueItems(currentDate).length
    }

    resetIndex() {
      $.reminder.dueIndexed = {}
      $.reminder.reverseIndexed = {}
    }

    addComponentToEditorView() {
      const RemindReferenceComp = withReference({
        type: 'remind',
        groupBy: 'none',
        i18nTitle: 'reminder.remind_references',
        getList: (item) => {
          if (isDateFmt(item.topic)) {
            const list = $.reminder.getDueItems(item.topic!, true);
            return list as any
          }
          return []
        },
        foldupTopics: false,
      })

      $.editorView.addMoreComponent(RemindReferenceComp)
    }

    getContext(): ExtraDropdownContext {
      const ctx = {
        ...getPubState(`float-menu-context-${MENU_NAME}`),
        app: $.ui.app,
      } as ExtraDropdownContext
      return ctx
    }

    addonBeforeRun() {
      Logic.register({
        due: DueLogic,
      })

      $.is.addRules({
        reminder: (item) => {
          return $.reminder.isReminder(item)
        },

        due(item) {
          return $.reminder.isDue(item)
        },
      })

      // 重新索引单个节点的提醒事项
      const savedPlan = {} as { [ky: KyString]: RepeatPlanProps }
      after($.dbMemory.handleIndex, (_, item) => {
        if ($.reminder.isReminder(item)) {
          $.reminder.indexed[item.ky] = item as ItemWithReminder
          const plan = getPlan(item)
          if (!savedPlan[item.ky] || !deepEqual(savedPlan[item.ky], plan)) {
            $.reminder.updateOneDueDates(item)
            savedPlan[item.ky] = plan
          }
        } else if (item.ky in $.reminder.indexed) {
          $.reminder.updateOneDueDates(item)
          delete savedPlan[item.ky]
          delete $.reminder.indexed[item.ky]
          delete $.reminder.reverseIndexed[item.ky]
        }
      })

      before(
        $.backlink.addComponentToEditorView,
        $.reminder.addComponentToEditorView
      )

      after($.inlines.setNodes, (_, editor, node, options) => {
        if ((node as any).blockType === 'checkbox' && options?.at) {
          const item = (editor as ItemEditor).item(options.at)
          if (item && $.reminder.isReminder(item)) {
            const newStatus = (node as any).value ? STATUS.done : STATUS.todo
            $.reminder.setStatus(item, newStatus)
          }
        }
      })
    }

    addonInfo() {
      return {
        title: $t`reminder.title`,
        quote: $t`reminder.quote`,
        defaultValue: 'on',
        type: 'fieldset',
        subitems: {
          reminderNotificationKey: {
            title: 'Reminder Notification URL: {orilf}/{oribr}: Content, {id}: ID',
            type: 'text'
          },
          reminderDefaultTimeDelta: {
            title: "Default Time Delta",
            type: 'text',
            defaultValue: '0'
          }
        },
        updated: 2025_02_14,
        isCore: true,
      }
    }

    addonCommands(): HotkeyMaps {
      return {
        reminder: {
          title: $t`reminder.title`,
          icon: 'svg_countdown',
          hotkey: 'alt+l',
          handle({ editor }) {
            $.reminder.showForm({
              item: editor.item() as ItemWithReminder,
            })
          },
        },
        autoReminder: {
          title: "Auto Reminder",
          icon: 'svg_countdown',
          hotkey: 'alt+shift+l',
          handle({ editor }) {
            $.reminder.autoReminder(editor.item())
          },
        }

        // 'reminder.done': {
        //   title: $t`reminder.done`,
        //   icon: 'svg_done',
        //   hotkey: 'mod+d',
        //   handle({ editor }) {
        //     const newStatus =
        //       $.reminder.getStatus(editor.item()) === STATUS.done
        //         ? STATUS.todo
        //         : STATUS.done
        //     $.reminder.setStatus(editor.item() as ItemWithReminder, newStatus)
        //   },
        // },
      }
    }

    async autoReminder(item: ItemNode) {
      const content = Item.headString(item);
      const result = (await (await fetch(`/api/parse-task/?content=${encodeURIComponent(content)}`)).json()).tasks[0]
      delete result.ori;
      $.reminder.setPlan(item, result, true);
    }

    addonRun() {
      $.floatMenu.addItems({
        reminder: {
          title: $t`reminder.item_menu_title`,
          icon: 'svg_countdown',
          hotkey: 'mod+l',
          onClick: () => {
            const ctx = $.floatMenu.getContext()
            $.reminder.showForm(pick(ctx, ['editor', 'item']))
          },
        },
        autoReminder: {
          title: "Auto Reminder",
          icon: 'svg_countdown',
          hotkey: 'mod+shift+l',
          onClick: async () => {
            const ctx = $.floatMenu.getContext()
            $.reminder.autoReminder(ctx.item)
          }
        }
      })

      const ctx = $.reminder.getContext

      const menu = {
        edit: {
          title: $t`common.edit`,
          icon: 'svg_edit',
          hotkey: 'mod+l',
          onClick() {
            const { item, currentTarget } = ctx()
            $.reminder.showForm({
              item: item as any,
              SnapProps: {
                targetBox: currentTarget,
                place: ['left-out', 'middle'],
              },
            })
          },
        },
        zoomin: {
          title: $t`reminder.zoomin`,
          icon: 'svg_zoomin',
          cond() {
            const { item } = ctx()
            return $.reminder.getStatus(item) !== STATUS.discard
          },
          onClick() {
            const { item, editor } = ctx()
            const computedDueDate = $.reminder.calcDueDate(item)
            $.daily.route(computedDueDate, {}, editor)
          },
        },
        next_date: {
          icon: 'svg_calendar',
          title: $t`To Next Due`,
          cond() {
            const { item } = ctx()
            const plan = getPlan(item)
            return plan && ['interval', 'weekly', "monthly", "yearly"].includes(plan.repeatPlan)
          },
          onClick() {
            const { item } = ctx()
            let relativeDate = getRelativeDate(item, $.reminder.fmtToday)
            const computedDueDate = $.reminder.calcDueDate(item, relativeDate)
            const nextDay = datekit(computedDueDate).add(1, 'day').format(YYYY_MM_DD)
            const nextDue = $.reminder.calcDueDate(item, nextDay)
            $.reminder.setPlan(item, { dueDate: nextDue }, false)
          },
        },
        no_delay: {
          icon: 'svg_fire',
          title: $t`reminder.menu_no_delay`,
          cond() {
            const { item } = ctx()
            const plan = getPlan(item)
            return (
              $.reminder.isDelay(item) &&
              plan.repeatPlan !== 'never' &&
              $.reminder.getStatus(item) !== STATUS.discard
            )
          },
          onClick() {
            const { item } = ctx()
            $.reminder.cancelDelay(item)
          },
        },
        delay: {
          icon: 'svg_countdown',
          title: $t`reminder.menu_delay`,
          cond() {
            const { item } = ctx()
            const plan = getPlan(item)
            return (
              !$.reminder.isNever(item) &&
              plan.repeatPlan !== 'never' &&
              !$.reminder.isDelay(item) &&
              ![STATUS.discard, STATUS.done].includes(
                $.reminder.getStatus(item) as any
              )
            )
          },
          subitems: {
            delay_1day: {
              icon: 'svg_dot',
              title: $t`reminder.tomorrow`,
              onClick() {
                $.reminder.setDelay(ctx().item, 1)
              },
            },
            delay_7days: {
              icon: 'svg_dot',
              title: `7${$t`reminder.unit_day`}`,
              onClick() {
                $.reminder.setDelay(ctx().item, 7)
              },
            },
            delay_30days: {
              icon: 'svg_dot',
              title: `30${$t`reminder.unit_day`}`,
              onClick() {
                $.reminder.setDelay(ctx().item, 30)
              },
            },
            delay_custom: {
              icon: 'svg_dot',
              title: $t`reminder.custom_delay`,
              onClick() {
                $.reminder.showDelayForm(ctx())
              },
            },
          },
        },
        todo: {
          title: $t`reminder.todo`,
          icon: 'svg_redo',
          onClick: () => {
            const { item } = ctx()
            $.reminder.setStatus(item, STATUS.todo)
          },
          cond() {
            const { item } = ctx()
            return (
              $.reminder.getStatus(item) !== STATUS.todo
            )
          },
        },
        discard: {
          title: $t`reminder.discard`,
          icon: 'svg_undo',
          onClick: () => {
            const { item } = ctx()
            $.reminder.setStatus(item, STATUS.discard)
          },
          cond() {
            const { item } = ctx()
            return (
              $.reminder.getStatus(item) !== STATUS.discard
            )
          },
        },
        never: {
          icon: 'svg_ignore',
          title: $t`reminder.menu_never`,
          cond() {
            const { item } = ctx()
            return (
              !$.reminder.isNever(item) &&
              $.reminder.getStatus(item) !== STATUS.discard
            )
          },
          onClick() {
            const { item } = ctx()
            $.reminder.setNever(item)
          },
        },
        restore: {
          icon: 'svg_restore',
          title: $t`reminder.menu_restore`,
          cond() {
            const { item } = ctx()
            return (
              $.reminder.isNever(item) &&
              $.reminder.getStatus(item) !== STATUS.discard
            )
          },
          onClick() {
            const { item } = ctx()
            $.reminder.cancelNever(item)
          },
        },
        clear: {
          title: $t`reminder.menu_clear`,
          icon: 'svg_clear',
          onClick() {
            const { item } = ctx()
            $.reminder.clear(item)
          },
        },
      } as ExtraDropdownMenu

      createExtraDropdown($, ReminderBtn, {
        menu,
        name: MENU_NAME,
        order: 9999,
      })

      $.editorView.addExtraItems({
        ReminderAddBtn,
      })
      
      // 跨天检查定时器 / Cross-day check timer
      setInterval(() => {
        const realToday = todayFmt()
        if (realToday !== $.reminder.fmtToday) {
          $.reminder.fmtToday = realToday
          // 重新计算索引，确保跨天后任务的 due 状态更新
          $.reminder.resetIndex()
          $.reminder.calcAllDueDates(realToday)
          console.log(`[Reminder] Cross-day detected: ${realToday}`)
        }
      }, 60000)

    }
  }

  return { reminder: new Reminder() }
}
