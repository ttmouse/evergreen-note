import React from 'react';
import {
  MonthCalendar,
  MonthCalendarProps,
} from '../../components/MonthCalendar/MonthCalendar';

export type YYYY_MM = string;

export type HeatmapProps = {
  start: YYYY_MM;
  end: YYYY_MM;
  weekbar: MonthCalendarProps['weekbar'];
};

export function HeatmapComp(
  props: HeatmapProps & Pick<MonthCalendarProps, 'renderCellContent'>
) {
  const { start, end, weekbar, renderCellContent } = props;

  const [stYear, stMonth] = start.split('-');
  const [endYear, endMonth] = end.split('-');

  const stDate = new Date(`${stYear}-${stMonth}-01`);
  const endDate = new Date(`${endYear}-${endMonth}-01`);

  const calendarContent: JSX.Element[] = [];

  for (let m = stDate, i = 0; m <= endDate && i <= 36; i++) {
    let wbar: string[] = [];
    if (m === stDate && weekbar) {
      wbar = ['一', '二', '三', '四', '五', '六', '日'];
    }

    let lastWeekVisible = false;
    if (m === endDate) {
      lastWeekVisible = true;
    }

    const comp = (
      <MonthCalendar
        year={m.getFullYear()}
        month={m.getMonth() + 1}
        laskWeekVisible={lastWeekVisible}
        weekbar={wbar}
        key={m.toDateString()}
        renderCellContent={renderCellContent}
      />
    );
    calendarContent.push(comp);

    let m2 = m.getMonth() + 1 + 1;
    let y2 = m.getFullYear();
    if (m2 > 12) {
      m2 = 1;
      y2 += 1;
    }
    m = new Date(`${y2}-${m2}-01`);
  }

  return <>{calendarContent}</>;
}
