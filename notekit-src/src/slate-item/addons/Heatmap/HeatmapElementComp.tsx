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
import { useFocused, useSelected } from '../../slate.inc';

const heatmapStyle = [
  cls`
    display: inline-flex;
  `,
  'heatmap-wrap',
];

// 光标落在热力图上时显示的「原始写法」（{{heatmap 2021-11,2022-1}}），
// 移开光标恢复渲染图。2026-10-09 用户反馈：键盘上下移动时想直接看到原始状态。
const sourceStyle = [
  cls`
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    opacity: 0.55;
    padding: 0 2px;
  `,
  'heatmap-source',
];

export function HeatmapElementComp(
  props: ElementComponentProps<HeatmapElement>
) {
  const $ = useAddons();
  const { element } = props;
  const {
    start,
    end,
    // 笔记内嵌热力图不渲染周几标题行（该行文字因全局 color:transparent 不可见，只剩一行空白——2026-10-09 用户反馈「额外空白」的根因）
    weekbar,
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

  const selected = useSelected();
  const focused = useFocused();
  const showSource = Boolean(selected && focused);
  const rawSource = start && end ? `{{heatmap ${start},${end}}}` : `{{heatmap}}`;

  const inner = React.useMemo(
    () =>
      showSource ? (
        <div className={sourceStyle.join(' ')}>{rawSource}</div>
      ) : (
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
    [start, end, weekbar, showSource]
  );
  return <InlineOuterComp cssInlineBlock inner={inner} {...props} />;
}
