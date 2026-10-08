import React from 'react';
import { HeatmapComp } from './HeatmapComp';
import { useAddons } from '../../hooks/useAddons';
import { CellProps } from '../../components/MonthCalendar/MonthCalendar';
import { datekit, YYYY_MM_DD } from '../../utils/date/datekit';
import { isEmpty } from '../../utils/isEmpty';
import { cls, px } from '../../styles';
import './heatmap.less';

const pageStyle = [
  cls`
    overflow: auto;
    padding: ${px(16)};
    height: 100%;
    box-sizing: border-box;
  `,
];

/**
 * Full-page heatmap shown in the navigation sidebar route (/heatmap).
 */
export function HeatmapPageComp() {
  const $ = useAddons();

  const end = datekit().format('YYYY-MM');
  const start = datekit().add(-11, 'month').format('YYYY-MM');
  const weekbar = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const renderCellContent = (cellProps: CellProps) => {
    const { date } = cellProps;
    const classes = ['cell-text'];
    if (!isEmpty($.dbMemory.indexed.pky[date])) {
      classes.push('warn-it');
    }
    const [, , day] = date.split('-');
    const bg = $.heatmap.calcBgColor(date as YYYY_MM_DD);
    return (
      <span
        data-ky={date}
        className={classes.join(' ')}
        style={{ backgroundColor: bg }}
        title={date}
        onClick={() => $.heatmap.route(date as YYYY_MM_DD)}
      >
        {day}
      </span>
    );
  };

  return (
    <div className={[pageStyle[0], 'heatmap-page'].join(' ')}>
      <div className="heatmap-wrap" style={{ display: 'inline-flex' }}>
        <HeatmapComp
          start={start}
          end={end}
          weekbar={weekbar}
          renderCellContent={renderCellContent}
        />
      </div>
    </div>
  );
}
