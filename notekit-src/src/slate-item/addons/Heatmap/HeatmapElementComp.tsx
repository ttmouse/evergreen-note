import React from 'react';
import { ElementComponentProps } from '../EditorView/EditorView';
import { HeatmapElement, STRATEGIES } from './Heatmap';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { HeatmapComp } from './HeatmapComp';
import { cls } from '../../styles';
import { useAddons } from '../../hooks/useAddons';
import { CellProps } from '../../components/MonthCalendar/MonthCalendar';
import { isEmpty } from '../../utils/isEmpty';
import type { YYYY_MM_DD } from '../../utils/date/datekit';
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

  // 编辑器实例在组件顶层取一次（不要写在 renderCellContent 闭包里：
  // 闭包会被下方 useMemo 缓存成旧值，且 hook 调用位置不合法）
  const editor = useEditor();

  // 日期格跳转必须挂在 mousedown 而非 click（2026-10-09 用户反馈「日期不能够点击」）：
  // 点击日期格时 mousedown 的原生选区移动会让 Slate 选中本 void 节点 → selected+focused
  // → showSource 把色块图替换成原始文本 div，日期格 span 在 mouseup 前被卸载，
  // click 事件永远不会落在它身上。preventDefault 阻止选区移动、保住色块图，
  // 在 mousedown 阶段直接路由跳当天日记。不挂 onClick，避免重复导航。
  const openDayOnMouseDown = (date: YYYY_MM_DD) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    $.heatmap.route(date, {}, editor);
  };

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
          onMouseDown={openDayOnMouseDown(date as YYYY_MM_DD)}
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
