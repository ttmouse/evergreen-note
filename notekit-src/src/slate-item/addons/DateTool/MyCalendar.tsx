import * as React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import {
  CalendarPicker,
  CalendarPickerProps,
} from '@mui/x-date-pickers/CalendarPicker';
import { YYYY_MM_DD } from '../../utils/date/datekit';
import { isEmpty } from '../../utils/isEmpty';
import { PickersDay } from '@mui/x-date-pickers';
import { useAddons } from '../../hooks/useAddons';

export type MyCalendarProps = {
  value?: YYYY_MM_DD;
  onChange?: (val: YYYY_MM_DD) => void;
  renderDay?: CalendarPickerProps<any>['renderDay'];
};

export function MyCalendar(props: MyCalendarProps) {
  const { value, onChange, renderDay } = props;
  const [date, setDate] = React.useState<Dayjs | null>(dayjs(value));

  let flag = 0;

  const handleChange = (newDate: Dayjs | null) => {
    setDate(newDate);
    setTimeout(() => {
      if (Date.now() - flag > 100) {
        onChange?.(newDate?.format(YYYY_MM_DD) ?? '');
      }
    }, 50);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <CalendarPicker
        date={date}
        onChange={handleChange}
        onMonthChange={() => {
          flag = Date.now();
        }}
        onYearChange={() => {
          flag = Date.now();
        }}
        renderDay={renderDay}
      />
    </LocalizationProvider>
  );
}

export type InfoCalendarProps = {
  onPick: (date: YYYY_MM_DD) => void;
};

export function useRenderDay(props: InfoCalendarProps) {
  const $ = useAddons();
  const { onPick } = props;

  return (day: dayjs.Dayjs, _: any, DayProps: any) => {
    const fmtDate = dayjs(day).format(YYYY_MM_DD);
    let style: any = {};
    let level = 0;
    if (fmtDate !== $.reminder.fmtToday) {
      const bg = $.heatmap?.calcBgColor(fmtDate);
      level =
        Math.ceil(($.heatmap.calcPercent(fmtDate) * 100) / 10) * 100;
      if (bg && bg !== 'transparent') {
        style.backgroundColor = bg;
      }
    }
    if (!isEmpty($.dbMemory.indexed.mentions[fmtDate])) {
      style.border = `1px solid var(--cl-orange-300)`;
    }

    const dueCount = $.reminder?.getCountOfDueItems(fmtDate);
    if (!isEmpty(dueCount)) {
      style = {
        ...style,

        position: 'relative',
        border: `1px solid var(--cl-orange-300)`,

        '&::after': {
          content: `"${dueCount}"`,
          display: 'inline-flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 12,
          height: 12,
          borderRadius: '50%',
          fontSize: 9,
          backgroundColor: 'var(--cl-red-300)',
        },
      };
    }

    return (
      <PickersDay
        {...DayProps}
        onClick={(e) => onPick(fmtDate)}
        sx={style}
        level={level}
        data-due-count={dueCount}
      />
    );
  };
}

export function InfoCalendar(props: InfoCalendarProps) {
  const renderDay = useRenderDay(props);
  return <MyCalendar renderDay={renderDay} />;
}
