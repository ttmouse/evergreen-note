import { FormikValues } from 'formik'
import React from 'react'
import { Dayjs } from 'dayjs'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { datekit, YYYY_MM_DD } from '../../../utils/date/datekit'
import { FormElProps } from '../../Form/Form'
import { useChange } from '../../Form/helper'
import { CalendarPicker } from '@mui/x-date-pickers/CalendarPicker'
import { cls } from '../../../styles'
import { PickersDay } from '@mui/x-date-pickers'
import { calcAllDueDates } from './countdown'

export type DateElProps<V extends FormikValues> = FormElProps<V> & {}

export const ReminderCalendarElComp = (props: any) => {
  const { value, values } = props
  const [val, setVal] = React.useState<Dayjs | null>(
    value ? datekit(value as YYYY_MM_DD) : null
  )
  const onChange = useChange(props)
  const handleChange = (newValue: Dayjs | null) => {
    setVal(newValue)
    onChange(null, newValue?.format(YYYY_MM_DD) ?? '')
  }

  const allDueDates = calcAllDueDates(values, 12)

  const RenderDay = (day, _, DayProps) => {
    const fmtDate = day.format(YYYY_MM_DD)
    const style = {} as any
    if (allDueDates.includes(fmtDate)) {
      style.border = '1px solid var(--cl-orange-400)'
    }

    return <PickersDay key={fmtDate} {...DayProps} sx={style} />
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <div
        className={cls`
          .PrivatePickersSlideTransition-root {
            min-height: 200px !important;
          }
        `}
      >
        <CalendarPicker
          renderDay={RenderDay}
          date={val}
          onChange={handleChange}
        />
      </div>
    </LocalizationProvider>
  )
}
