import React from 'react';
import Box from '@mui/material/Box';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Checkbox from '@mui/material/Checkbox';
import { visuallyHidden } from '@mui/utils';
import { RowData, TableOrder } from './TopicListSortableComp';

interface EnhancedTableProps {
  numSelected: number;
  onRequestSort: (
    event: React.MouseEvent<unknown>,
    property: keyof RowData
  ) => void;
  onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  order: TableOrder;
  orderBy: string;
  rowCount: number;
}

export interface HeadCell {
  id: keyof RowData;
  label: string;
  minWidth?: number;
  /**
   * 列宽（表格为 fixed 布局，列宽只由表头行决定）。
   * 用百分比而非「标题列吸收剩余空间」，避免宽窗口下标题列无限变宽、
   * 其余列被推到屏幕最右侧（2026-10-07 用户反馈）。
   */
  width?: string | number;
  align?: 'right';
  format?: (value: number, RowData: RowData) => string;

  disablePadding: boolean;
  numeric: boolean;
}

/**
 * 勾选列宽：占表格宽度的固定比例。
 *
 * 为什么用百分比而不是固定 52px：fixed 布局下「固定 px 列」会把比例分配后的
 * 剩余空间全部吸收——超宽窗口下勾选列会从 52px 膨胀到 150px，把标题列整个推右；
 * 而 min-width / max-width 在表格列宽计算里不生效（实测 Chromium）。
 * 代价：容器窄于约 1040px 时勾选列会窄于 52px（实测 1000px 容器约 50px、760px 容器约 38px），
 * 所以单元格内边距必须同步收紧（见 CHECKBOX_CELL_SX），否则复选框被裁。
 */
export const CHECKBOX_COL_WIDTH = '5%';

/** 勾选单元格的内边距：比 MUI 默认（16px）小，把宽度让给复选框本体。 */
export const CHECKBOX_CELL_SX = { width: CHECKBOX_COL_WIDTH, pl: '4px', pr: 0, py: 0 } as const;

/** 复选框本体默认带 9px 内边距（点击区 42px），窄容器下会溢出列宽，收紧到 4px（点击区 32px）。 */
export const CHECKBOX_SX = { p: '4px' } as const;

/**
 * 列宽比例（合计 100%）。
 * 标题列此前不设宽度、独占「容器宽 - 其余列」的全部剩余空间，宽窗口下能吃到 65% 宽，
 * 把 Words/Mentions/Created/Updated 全推到屏幕最右侧（2026-10-07 用户反馈：
 * 名称列太宽、要横向滚动才能看到所有列）。改成表格 fixed 布局 + 固定比例分配。
 */
export const headCells: readonly HeadCell[] = [
  {
    id: 'ori',
    label: 'Title',
    numeric: false,
    disablePadding: true,
    width: '40.5%',
  },
  { id: 'words', label: 'Words', numeric: true, disablePadding: false, width: '11%' },
  {
    id: 'mentions',
    label: 'Mentions',
    numeric: true,
    disablePadding: false,
    width: '12%',
  },
  {
    id: 'created',
    label: 'Created',
    numeric: true,
    disablePadding: false,
    width: '16%',
  },
  {
    id: 'updated',
    label: 'Updated',
    numeric: true,
    disablePadding: false,
    width: '16%',
  },
];

export function EnhancedTableHead(props: EnhancedTableProps) {
  const {
    onSelectAllClick,
    order,
    orderBy,
    numSelected,
    rowCount,
    onRequestSort,
  } = props;
  const createSortHandler =
    (property: keyof RowData) => (event: React.MouseEvent<unknown>) => {
      onRequestSort(event, property);
    };

  return (
    <TableHead>
      <TableRow>
        <TableCell sx={CHECKBOX_CELL_SX}>
          <Checkbox
            color="primary"
            sx={CHECKBOX_SX}
            indeterminate={numSelected > 0 && numSelected < rowCount}
            checked={rowCount > 0 && numSelected === rowCount}
            onChange={onSelectAllClick}
            inputProps={{
              'aria-label': 'select all desserts',
            }}
          />
        </TableCell>
        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.numeric ? 'center' : 'left'}
            padding={headCell.disablePadding ? 'none' : 'normal'}
            sortDirection={orderBy === headCell.id ? order : false}
            sx={{ width: headCell.width }}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : 'asc'}
              onClick={createSortHandler(headCell.id)}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}
