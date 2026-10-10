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
    // D125F26FCF5E-18：热力不再整格填灰阶（深底会吞掉数字），降为数字下方的小圆点；
    // 引用（mentions）与提醒（due）视觉分离：引用=橙点，提醒=右上红角标计数。
    let level = 0;
    let heatColor: string | undefined;
    if (fmtDate !== $.reminder.fmtToday) {
      level =
        Math.ceil(($.heatmap.calcPercent(fmtDate) * 100) / 10) * 100;
      const bg = $.heatmap?.calcBgColor(fmtDate);
      if (bg && bg !== 'transparent') {
        heatColor = bg;
      }
    }
    const hasMentions = !isEmpty($.dbMemory.indexed.mentions[fmtDate]);
    const hasHeat = level > 0 && !!heatColor;

    const dueCount = $.reminder?.getCountOfDueItems(fmtDate);
    const hasDue = !isEmpty(dueCount);

    if (hasHeat || hasMentions || hasDue) {
      style.position = 'relative';
    }
    if (hasHeat || hasMentions) {
      style['&::before'] = {
        content: '""',
        position: 'absolute',
        bottom: 2,
        left: '50%',
        transform: 'translateX(-50%)',
        width: hasHeat && hasMentions ? 3 : 4,
        height: 4,
        borderRadius: 2,
        // 同时有记录密度与引用时：橙点居中，灰阶点经 box-shadow 靠左
        backgroundColor: hasMentions
          ? 'var(--cl-orange-500, #ec8b33)'
          : heatColor,
        ...(hasHeat && hasMentions
          ? { boxShadow: `-4px 0 0 ${heatColor}` }
          : {}),
      };
    }
    if (hasDue) {
      style['&::after'] = {
        content: `"${dueCount}"`,
        display: 'inline-flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        fontSize: 10,
        color: '#fff',
        backgroundColor: 'var(--cl-red-500, #e5484d)',
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
