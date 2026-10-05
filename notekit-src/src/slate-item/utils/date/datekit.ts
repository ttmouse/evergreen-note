/* eslint-disable @typescript-eslint/no-use-before-define */
import dayjs from 'dayjs'
import duration, { DurationUnitType } from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import { isEmpty } from '../isEmpty'
import { time } from './time'

export type YYYY_MM_DD = string
export const YYYY_MM_DD = 'YYYY-MM-DD'

export type YYYY_MM = string
export const YYYY_MM = 'YYYY-MM'

export type HH_mm = string
export const HH_mm = 'HH:mm'

export type Minutes = number

export type AllowedTimeValue = Parameters<typeof dayjs>[0]

dayjs.extend(duration)
dayjs.extend(relativeTime)

export function datekit(val?: any) {
  let value = val
  if (isTime(val)) {
    value *= 1000
  }
  return dayjs(value)
}

export function ago(val: any) {
  if (isEmpty(val) || val < 10) {
    return '-'
  }
  const d = datekit(val)
  if (d.diff(datekit(), 'days') > 1) {
    return d.format(YYYY_MM_DD)
  }
  return d.fromNow()
}

datekit.duration = dayjs.duration

export function dateFmt(date?: Date | string | number) {
  return datekit(date).format(YYYY_MM_DD)
}

export function isDateFmt(date: any) {
  // YYYY-MM-DD
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
}

export function todayFmt() {
  return dateFmt(Date.now())
}

export function monthFmt(fmtDate: YYYY_MM_DD) {
  return fmtDate.replace(/-\d+$/, '')
}

export function isFuture(date: Date | string | number) {
  return datekit(date).isAfter(Date.now())
}

export function timeUnit(unit: DurationUnitType) {
  return dayjs.duration(1, unit).asSeconds()
}

export function isTime(n: any) {
  return (
    Number.isInteger(n) && String(n).length === 10 && String(n).startsWith('1')
  )
}

export function h24(h?: number) {
  if (typeof h === 'undefined') {
    h = time()
  }
  if (isTime(h)) {
    h = datekit(h).format('HH') as any
  }
  h = String(h).padStart(2, '0') as any
  return `24h/${h}`
}

export function fromNow(date: AllowedTimeValue) {
  if (Math.abs(datekit().diff(datekit(date), 'day')) > 30) {
    return datekit(date).format('YYYY-MM-DD')
  }
  return datekit(date).fromNow()
}
