import {
  YYYY_MM_DD,
  datekit,
  dateFmt,
  HH_mm,
  YYYY_MM,
  todayFmt,
} from '../../../utils/date/datekit';
import { TimeSecond } from '../../../interfaces/unit';
import { $t } from '../../../../i18n';
import { isEmpty } from '../../../utils/isEmpty';

export const repeatPlanOptions = {
  once: $t`reminder.repeat_once`,
  interval: $t`reminder.repeat_interval`,
  weekly: $t`reminder.repeat_weekly`,
  monthly: $t`reminder.repeat_monthly`,
  yearly: $t`reminder.repeat_yearly`,
  never: $t`reminder.repeat_never`,
} as const;

export type RepeatPlan = keyof typeof repeatPlanOptions;

export const unitOptions = {
  // hour: $t`reminder.unit_hour`,
  day: $t`reminder.unit_day`,
  week: $t`reminder.unit_week`,
  month: $t`reminder.unit_month`,
  year: $t`reminder.unit_year`,
} as const;

export const weekDayOptions = {
  0: $t`reminder.sun`,
  1: $t`reminder.mon`,
  2: $t`reminder.tue`,
  3: $t`reminder.wed`,
  4: $t`reminder.thu`,
  5: $t`reminder.fri`,
  6: $t`reminder.sat`,
} as const;

export const weekDayOptionsForLLM = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}

export const weekDayOptionsForLLMReverse = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

export function weekDayToStringForLLM(day: number | string) {
  if (typeof day === 'string') day = parseInt(day);
  return weekDayOptionsForLLM[day as keyof typeof weekDayOptionsForLLM];
}

export function formatTimeDelta(td: string): string {
  const parts = td.split(/[,，]/).map(p => {
    p = p.trim()
    if (p === '0') return 'on due'
    const match = p.match(/^([+-])(.+)$/)
    if (!match) return p
    const [, sign, data] = match
    return sign === '-' ? `${data} before` : `${data} after`
  })
  return parts.join(', ')
}

export type DAY_OF_WEEK = keyof typeof weekDayOptions;

export const END_OF_MONTH = 'end';

export const PLAN_STATUS = {
  done: 'done',
  todo: 'todo',
  doing: 'doing',
  expired: 'expired',
  delay: 'delay',
  discard: 'discard',
} as const;

export type RepeatPlanProps = {
  dueDate?: YYYY_MM_DD;
  repeatPlan: keyof typeof repeatPlanOptions;
  dueTime?: HH_mm;

  // for interval
  step?: number;
  stepUnit?: keyof typeof unitOptions;

  // for weekly
  dayOfWeek?: DAY_OF_WEEK[];

  // for monthly
  dayOfMonth?: number | 'end';

  // 延期到的日期
  delay?: YYYY_MM_DD;

  // 在设置 Never 时，记录它之前的重复方式
  prevPlan?: RepeatPlan;

  // 事项的处理结果
  status?: keyof typeof PLAN_STATUS;

  // 事项的处理时间
  statusTime?: TimeSecond;

  // 记录每次完成的时间
  log?: TimeSecond[];

  every?: never;

  timeSensitive: boolean;

  time: string;

  timeDelta: string;
};

export type CountdownInterface = {
  [method in RepeatPlan]: (plan: any, currentDate: YYYY_MM_DD) => number;
};

export function getStartDate(
  plan: Pick<RepeatPlanProps, 'delay' | 'dueDate'>
): YYYY_MM_DD {
  const { delay, dueDate } = plan;
  if (delay && delay > dueDate!) {
    return delay;
  }
  return dueDate || '';
}

/**
 * 计算待办事项还有多少天到
 */
export const countdown: CountdownInterface = {
  never() {
    return Infinity;
  },

  // 待办事项只重复一次的情况
  once(
    plan: Required<Pick<RepeatPlanProps, 'dueDate' | 'delay'>>,
    currentDate: YYYY_MM_DD
  ) {
    const dueDate = getStartDate(plan);
    const dueDay = datekit(dueDate);
    const currentDay = datekit(currentDate);
    return dueDay.diff(currentDay, 'day');
  },

  // 待办事项每隔一段时间重复一次的情况
  interval(
    plan: Required<
      Pick<RepeatPlanProps, 'step' | 'stepUnit' | 'dueDate' | 'delay'>
    >,
    currentDate: YYYY_MM_DD
  ) {
    const dueDate = getStartDate(plan);
    const { stepUnit, step } = plan;
    const dueDay = datekit(dueDate);
    const currentDay = datekit(currentDate);
    const dayDiff = dueDay.diff(currentDay, 'day');
    if (dayDiff >= 0) {
      return dayDiff;
    }
    if (stepUnit === 'day' && step === 1) {
      return 0;
    }
    // 将周、月、年的步长转换为以天为单位的步长
    const dayStep = step * datekit.duration(1, stepUnit).asDays();
    const mod = dayDiff % dayStep;
    if (mod == 0) return 0;
    return dayStep + mod;
  },

  // 每周的某些天
  weekly(
    plan: Required<Pick<RepeatPlanProps, 'dayOfWeek' | 'dueDate' | 'delay'>>,
    currentDate: YYYY_MM_DD
  ) {
    const dueDate = getStartDate(plan);
    const { dayOfWeek } = plan;
    const currentDay = datekit(currentDate);
    if (dueDate >= currentDate) {
      return countdown.once(plan, currentDate);
    }
    const wdays = Array.isArray(dayOfWeek) ? dayOfWeek : [dayOfWeek];
    const currentDayOfWeek = currentDay.day();
    const diffs = wdays
      .map((day) => {
        const diff = day - currentDayOfWeek;
        return diff >= 0 ? diff : 7 + diff;
      })
      .filter((diff) => diff >= 0)
      .sort((a, b) => a - b);
    return diffs[0];
  },

  // 每月的某些天
  monthly(
    plan: Required<Pick<RepeatPlanProps, 'dayOfMonth' | 'dueDate'>>,
    currentDate: YYYY_MM_DD
  ) {
    const dueDate = getStartDate(plan);
    const { dayOfMonth } = plan;
    if (dueDate >= currentDate) {
      return countdown.once(plan, currentDate);
    }
    if (typeof dayOfMonth === 'undefined') {
      return Infinity;
    }
    const currentDay = datekit(currentDate);
    const daysOfMonth = [dayOfMonth];
    const currentDayOfMonth = currentDay.date();
    const diffs = daysOfMonth
      .map((day) => {
        if ((day as any) === END_OF_MONTH) {
          day = currentDay.daysInMonth();
        }
        if (day > currentDay.daysInMonth()) {
          day = currentDay.daysInMonth();
        }
        const diff = Number(day) - currentDayOfMonth;
        if (diff >= 0) {
          return diff;
        }
        return datekit(currentDay).daysInMonth() + diff;
      })
      .filter((diff) => diff >= 0)
      .sort((a, b) => a - b);
    return diffs[0];
  },

  // 每年的某月某日
  yearly(
    plan: Required<Pick<RepeatPlanProps, 'dueDate'>>,
    currentDate: YYYY_MM_DD
  ) {
    const dueDate = getStartDate(plan);
    if (dueDate >= currentDate) {
      return countdown.once(plan, currentDate);
    }
    const nextDueDate = datekit(dueDate).add(1, 'year').format(YYYY_MM_DD);
    return countdown.once({ ...plan, dueDate: nextDueDate }, currentDate);
  },

  // 每年的某月中的第几个星期几
  // yearlyMonthWeek(
  //   plan: Required<Pick<RepeatPlanProps, 'dueDate'>>,
  //   currentDate: YYYY_MM_DD
  // ) {
  //   const { dueDate, yearlyMonth, weekOfMonth,  } = plan;
  //   const currentDay = datekit(currentDate);
  //   const currentMonth = currentDay.month();
  //   const currentDayOfMonth = currentDay.day();
  //   const currentDayOfWeek = currentDay.day();
  //   const diffMonth = month - currentMonth;
  //   const diffDay = day - currentDayOfWeek;
  //   const diffWeek = week - Math.floor(currentDayOfMonth / 7);
  //   if (diffMonth > 0) {
  //     return diffMonth * 30 + diffWeek * 7 + diffDay;
  //   }
  //   return diffWeek * 7 + diffDay;
  // },
};

/**
 * 计算某个日期离到期日还有多少天
 * @param plan
 * @param currentDate
 * @returns
 */
export function calcDueDays(
  plan: RepeatPlanProps,
  currentDate = dateFmt()
): number {
  if (isEmpty(plan)) {
    return Infinity;
  }
  if (isEmpty(plan.repeatPlan)) {
    return Infinity;
  }
  return (countdown as any)[plan.repeatPlan](plan, currentDate);
}

export function calcDueDate(
  plan: RepeatPlanProps,
  currentDate = dateFmt()
): YYYY_MM_DD {
  if (isEmpty(plan)) {
    return '';
  }
  const dueDays = calcDueDays(plan, currentDate);
  if (dueDays === Infinity) {
    return '9999-12-31'; // can be improved
  }
  return datekit(currentDate).add(dueDays, 'day').format(YYYY_MM_DD);
}

function numberOfNotifications(plan: RepeatPlanProps): number {
  if (isEmpty(plan) || isEmpty(plan.timeDelta)) return 0;
  return plan.timeDelta.split(/[，,]/).length;
}

export function calcTimeVals(ori: string): number[] {
  let results = [];
  let vals = ori.split(/[，,]/);
  
  for (let val of vals) {
      try {
          if (val === "0") {
              results.push(0);
              continue;
          }
          let pattern = /^(-?\+?)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
          let match = val.match(pattern);
          
          if (!match) continue;

          let [_, sign, daysStr, hoursStr, minutesStr, secondsStr] = match;
          
          let days = parseInt(daysStr || "0");
          let hours = parseInt(hoursStr || "0");
          let minutes = parseInt(minutesStr || "0");
          let seconds = parseInt(secondsStr || "0");

          let totalSeconds = Math.round(days * 86400 + hours * 3600 + minutes * 60 + seconds);
          
          if (sign === '-') {
              totalSeconds = -totalSeconds;
          }

          results.push(totalSeconds);
      } catch (e) {
          // Ignore errors
      }
  }
  
  if (results.length === 0) {
      results.push(0);
  }
  
  return results;
}

export function calcAllDueDates(
  plan: RepeatPlanProps,
  monthCount = 1, // 计算多少个月的到期日
  currentDate = dateFmt()
): YYYY_MM_DD[] {
  if (isEmpty(plan)) {
    return [];
  }
  const dueDates: YYYY_MM_DD[] = [];
  let dueDate = calcDueDate(plan, currentDate);
  const parsedToday = datekit(todayFmt());
  const count = 100 * numberOfNotifications(plan);
  const months: { [m: YYYY_MM]: boolean } = {};
  while (dueDate && dueDates.length < count) {
    months[dueDate.replace(/-\d+$/, '')] = true;
    if (Object.keys(months).length > monthCount) {
      break;
    }
    dueDates.push(dueDate);
    if(isEmpty(plan.timeDelta)) dueDates.push(dueDate);
    else {
      let timeVals = calcTimeVals(plan.timeDelta);
      const base = datekit(`${dueDate} ${plan.time || '00:00'}`);
      for (let timeVal of timeVals) {
        const dueDateTmp = base.add(timeVal, 'second');
        if (dueDateTmp.isBefore(parsedToday)) continue;
        const dueDateTmpFormatted = base.add(timeVal, 'second').format(YYYY_MM_DD);
        if (!dueDates.includes(dueDateTmpFormatted)) dueDates.push(dueDateTmpFormatted);
      }
    }
    if (plan.repeatPlan === 'once') {
      break;
    }
    const nextDate = datekit(dueDate).add(1, 'day').format(YYYY_MM_DD);
    dueDate = calcDueDate(plan, nextDate);
  }
  // console.log(dueDates)
  return dueDates;
}

/**
 * 判断某个日期是否到期
 * @param plan
 * @param currentDate
 * @returns
 */
export function isDue(plan: RepeatPlanProps, currentDate = dateFmt()): boolean {
  return calcDueDays(plan, currentDate) === 0;
}
