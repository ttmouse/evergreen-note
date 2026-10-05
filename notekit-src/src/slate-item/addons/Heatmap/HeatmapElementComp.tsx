import React from 'react';
import { ElementComponentProps } from '../EditorView/EditorView';
import { HeatmapElement, STRATEGIES } from './Heatmap';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { HeatmapComp } from './HeatmapComp';
import { cls } from '../../styles';
import { useAddons } from '../../hooks/useAddons';
import { CellProps } from '../../components/MonthCalendar/MonthCalendar';
import { isEmpty } from '../../utils/isEmpty';
import './heatmap.less';
import { Tip } from '../../components/Tip/Tip';
import { useEditor } from '@/slate-item/hooks/useEditor';

const heatmapStyle = [
  cls`
    display: inline-flex;
  `,
  'heatmap-wrap',
];

export function HeatmapElementComp(
  props: ElementComponentProps<HeatmapElement>
) {
  const $ = useAddons();
  const { element } = props;
  const {
    start,
    end,
    weekbar = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  } = element;

  const renderCellContent = (cellProps: CellProps) => {
    const { date } = cellProps;
    const classes = ['cell-text'];
    const ky = date;
    if (!isEmpty($.dbMemory.indexed.pky[ky])) {
      classes.push('warn-it');
    }
    const [, , day] = date.split('-');
    const bg = $.heatmap.calcBgColor(date);
    return (
      // <Tip title={date}>
        <span
          data-ky={date}
          className={classes.join(' ')}
          style={{ backgroundColor: bg }}
          title={date}
          onClick={() => $.heatmap.route(date, {}, useEditor())}
        >
          {day}
        </span>
      // </Tip>
    );
  };

  const inner = React.useMemo(
    () => (
      <div className={heatmapStyle.join(' ')}>
        <HeatmapComp
          renderCellContent={renderCellContent}
          start={start}
          end={end}
          weekbar={weekbar}
        />
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, end, weekbar]
  );
  return <InlineOuterComp cssInlineBlock inner={inner} {...props} />;
}
