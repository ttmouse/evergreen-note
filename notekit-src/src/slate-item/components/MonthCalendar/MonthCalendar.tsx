/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role */
import dayjs from 'dayjs';
import React from 'react';
import { $t } from '../../../i18n';
import { YYYY_MM_DD } from '../../utils/date/datekit';
import './month-calendar.less';
import { unstable_GlobalApp } from '@/main';

export type MonthCalendarProps = {
  year: number;
  month: number;
  laskWeekVisible?: boolean;
  weekbar?: string[];
  onCellClick?: CellProps['onClick'];
  renderCellContent?: CellProps['renderContent'];
};

export type CellProps = {
  date: YYYY_MM_DD;
  isCurrentMonth: boolean;
  isOverflow: boolean; // 在当前月份之前或之后的日期
  isToday: boolean;
  renderContent?: (params: CellProps) => JSX.Element;
  onClick?: (e: React.MouseEvent, val: string) => void;
};

export function Cell(props: CellProps) {
  const { date, isCurrentMonth, isToday, onClick, renderContent } = props;
  return (
    <li
      role="button"
      onMouseDown={(e) => onClick?.(e, date)}
      data-date={date}
      is-current-month={String(isCurrentMonth)}
      is-today={String(isToday)}
      key={date}
    >
      {renderContent ? renderContent(props) : <span>{date}</span>}
    </li>
  );
}

export function MonthCalendar(props: MonthCalendarProps) {
  const {
    year,
    month,
    laskWeekVisible,
    weekbar,
    onCellClick,
    renderCellContent,
  } = props;
  const oneDay = 86400 * 1000;
  const endOfMonth = new Date(year, month, 0); // 该月的最后一天
  const startOfMonth = new Date(year, month - 1, 1); // 该月的第一天

  let cell = startOfMonth.getTime();
  if (startOfMonth.getDay() > 0) {
    cell -= (startOfMonth.getDay() - 1) * oneDay;
  } else {
    cell -= 6 * oneDay;
  }

  let lastCell = endOfMonth.getTime();
  if (endOfMonth.getDay() > 0) {
    lastCell += (7 - endOfMonth.getDay()) * oneDay;
  }

  const date = new Date();

  let ws: JSX.Element[] = [];
  const monthContent: JSX.Element[] = [];

  do {
    date.setTime(cell);
    const fmt = dayjs(cell).format(YYYY_MM_DD);
    ws.push(
      <Cell
        date={fmt}
        isCurrentMonth={date.getMonth() === month - 1}
        isOverflow
        isToday={fmt === unstable_GlobalApp.addons.reminder.fmtToday}
        key={fmt}
        onClick={onCellClick}
        renderContent={renderCellContent}
      />
    );
    // get day of week

    if (dayjs(cell).day() === 0) {
      monthContent.push(<ul key={cell}>{ws}</ul>);
      ws = [];
    }
    cell += oneDay;
  } while (cell <= lastCell);

  const wk: JSX.Element[] = [];
  let comp: JSX.Element = <></>;
  if (Array.isArray(weekbar)) {
    for (const w of weekbar) {
      wk.push(<li key={w}>{w}</li>);
    }
    comp = (
      <div className="month-calendar">
        <div className="month">
          <ul>{wk}</ul>
        </div>
      </div>
    );
  }
  const mon = $t(`calendar.month`, { month });
  const m = month < 10 ? `0${month}` : month;
  return (
    <>
      {comp}
      <div className="month-calendar" data-month={`${year}-${m}`}>
        <div className="month">{monthContent}</div>
        <h4 title={`${year}-${month}`}>{mon}</h4>
      </div>
    </>
  );
}
