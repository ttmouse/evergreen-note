import React from 'react'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import Checkbox from '@mui/material/Checkbox'
import { TablePaginationActionsComp } from './TablePaginationActionsComp'
import { useAddons } from '../../hooks/useAddons'
import { pub } from '../../utils/pub'
import { isEmpty } from '../../utils/isEmpty'
import { ITEM_HAS } from '../Traits/Logic'
import { colorBase } from '../../styles'
import { WordHighlight } from '../../components/WordHighlight/WordHighlight'
import { EnhancedTableHead, CHECKBOX_CELL_SX, CHECKBOX_SX } from './EnhancedTableHead'
import { EnhancedTableToolbar } from './EnhancedTableToolbar'
import { getColor } from '../../styles/theme'
import { Item } from '../../interfaces/item'
import { ago } from '../../utils/date/datekit'
import { LayoutBadge } from '../LayoutFactory/LayoutBadge'
export interface RowData {
  ky: string
  ori: string
  words: number
  mentions: number
  created: number
  updated: number
  layout: string
}

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1
  }
  if (b[orderBy] > a[orderBy]) {
    return 1
  }
  return 0
}

export type TableOrder = 'asc' | 'desc'

function getComparator<Key extends keyof any>(
  order: TableOrder,
  orderBy: Key
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string }
) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy)
}

function topicComparator(a: RowData, b: RowData, kw: string) {
  const aIndex = Number((a.ori ?? '').toLocaleLowerCase().includes(kw))
  const bIndex = Number((b.ori ?? '').toLocaleLowerCase().includes(kw))
  return bIndex - aIndex
}

// This method is created for cross-browser compatibility, if you don't
// need to support IE11, you can use Array.prototype.sort() directly
function stableSort<T>(
  array: readonly T[],
  comparator: (a: T, b: T) => number,
  keyword?: string
) {
  const stabilizedThis = array.map((el, index) => [el, index] as [T, number])
  stabilizedThis.sort((a, b) => {
    if (!isEmpty(keyword)) {
      return topicComparator(
        a[0] as any,
        b[0] as any,
        (keyword as string).toLocaleLowerCase()
      )
    }
    const order = comparator(a[0], b[0])
    if (order !== 0) {
      return order
    }
    return a[1] - b[1]
  })
  return stabilizedThis.map((el) => el[0])
}

type TopicListSortableProps = {
  list: UnitPersist[]
  currentPage?: number
  itemsPerPage?: number
}

export function TopicListSortableComp(props: TopicListSortableProps) {
  const $ = useAddons()
  const { list, currentPage, itemsPerPage } = props

  const [keyword, setKeyword] = React.useState('')
  const [order, setTableOrder] = React.useState<TableOrder>(
    $.topicList.orderInfo.order as TableOrder
  )

  const [orderBy, setTableOrderBy] = React.useState<keyof RowData>(
    $.topicList.orderInfo.by as any
  )

  const [selected, setSelected] = React.useState<readonly string[]>([])
  const [page, setPage] = React.useState(currentPage ?? 0)
  const [dense, setDense] = React.useState(false)
  const [rowsPerPage, setRowsPerPage] = React.useState(itemsPerPage ?? 25)

  const createRowData = React.useCallback(
    (item: UnitPersist): RowData => {
      return {
        ...item,
        words: $.counter.countWordsOfTree(item).count,
        mentions: $.topic.getMentions((item as any).topic).length ?? 0,
      } as any
    },
    [$.counter, $.topic]
  )

  const [theList, setList] = React.useState(list)
  React.useEffect(() => {
    pub.on(pub.evt.topicListDelete, () => {
      setList($.topic.getList())
      setSelected([])
    })
  }, [$.topic])

  let totalWords = 0
  const rows = theList.map((item) => {
    const d = createRowData(item)
    totalWords += d.words
    return d
  })

  const handleRequestSort = (
    event: React.MouseEvent<unknown>,
    property: keyof RowData
  ) => {
    const isAsc = orderBy === property && order === 'asc'
    setTableOrder(isAsc ? 'desc' : 'asc')
    setTableOrderBy(property)
    $.topicList.rememberTableOrder({
      order: isAsc ? 'desc' : 'asc',
      by: property,
    })
  }

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelecteds = rows.map((n) => n.ky)
      setSelected(newSelecteds)
      return
    }
    setSelected([])
  }

  const handleClick = (event: React.MouseEvent<unknown>, ky: string) => {
    const selectedIndex = selected.indexOf(ky)
    let newSelected: readonly string[] = []

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, ky)
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1))
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1))
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1)
      )
    }

    setSelected(newSelected)
  }

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage)
    $.topicList.rememberPage(newPage)
  }

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const n = parseInt(event.target.value, 10)
    setRowsPerPage(n)
    $.topicList.rememberItemsPerPage(n)
    setPage(0)
  }

  // const handleChangeDense = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   setDense(event.target.checked);
  // };

  const isSelected = (ky: string) => selected.indexOf(ky) !== -1

  // Avoid a layout jump when reaching the last page with empty rows.
  const emptyRows =
    page > 0 ? Math.max(0, (1 + page) * rowsPerPage - rows.length) : 0

  return (
    <div
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        // 应用外壳的 main 区域从 44px 标题栏下方开始，但高度仍是整屏，
        // 这里主动扣掉标题栏，保证 footer 始终落在可视区内
        height: 'calc(100vh - 44px)',
        minHeight: 0,
      }}
    >
      <EnhancedTableToolbar
        setList={setList}
        setKeyword={setKeyword}
        selected={selected}
        numSelected={selected.length}
        sx={{ flexGrow: 0, flexShrink: 0 }}
      />
      <TableContainer sx={{ flexShrink: 1, flexGrow: 1, minHeight: 0 }}>
        <Table
          sx={{
            // fixed 布局：列宽完全由表头行（EnhancedTableHead）决定，
            // 标题再长也不会把表格撑宽；配合较低的 minWidth，容器多窄都不出现横向滚动。
            tableLayout: 'fixed',
            minWidth: 560,
            typography: 'body2',
            '& th.MuiTableCell-head': {
              position: 'sticky',
              top: 0,
              zIndex: 1,
              // 夜间模式是 CSS 注入（不改 MUI 调色板），background.paper 恒为白色，
              // 必须用语义 token 才能在浅色/夜间都正确（DESIGN.md §4）
              bgcolor: 'var(--nk-surface)',
              boxShadow: '0 1px 0 var(--nk-line)',
            },
            '& th.MuiTableCell-head .MuiTableSortLabel-root': {
              fontSize: 13,
              color: 'var(--nk-muted)',
            },
            '& .MuiTableRow-root:hover': {
              backgroundColor: 'var(--nk-hover)',
            },
            '& .MuiTableRow-root.Mui-selected': {
              backgroundColor: 'var(--nk-accent-soft)',
            },
            '& td.MuiTableCell-root, & th.MuiTableCell-root': {
              py: '6px',
            },
          }}
          aria-labelledby="tableTitle"
          size={dense ? 'small' : 'small'}
        >
          <EnhancedTableHead
            numSelected={selected.length}
            order={order}
            orderBy={orderBy}
            onSelectAllClick={handleSelectAllClick}
            onRequestSort={handleRequestSort}
            rowCount={rows.length}
          />
          <TableBody>
            {/* if you don't need to support IE11, you can replace the `stableSort` call with:
            rows.slice().sort(getComparator(order, orderBy)) */}
            {stableSort(rows, getComparator(order, orderBy), keyword)
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((row, index) => {
                const isItemSelected = isSelected(row.ky)
                const labelId = `enhanced-table-checkbox-${index}`

                return (
                  <TableRow
                    hover
                    onClick={(event) => handleClick(event, row.ky)}
                    role="checkbox"
                    aria-checked={isItemSelected}
                    tabIndex={-1}
                    key={row.ky}
                    selected={isItemSelected}
                  >
                    <TableCell sx={CHECKBOX_CELL_SX}>
                      <Checkbox
                        color="primary"
                        sx={CHECKBOX_SX}
                        checked={isItemSelected}
                        inputProps={{
                          'aria-labelledby': labelId,
                        }}
                      />
                    </TableCell>
                    <TableCell
                      component="th"
                      id={labelId}
                      scope="row"
                      padding="none"
                    >
                      <a
                        // to={`/${ROUTE_KEY}/${row.ky}`}
                        onClick={(e) => $.router.to(row)}
                        className="topic-title-link"
                        style={{
                          cursor: 'pointer',
                          color: getColor(colorBase.primary, 700),
                          fontSize: 14,
                          textDecoration: 'none',
                          display: 'block',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <WordHighlight
                          content={Item.headString(row as any)}
                          keyword={keyword}
                        />
                        <LayoutBadge layout={row.layout} />
                      </a>
                      {row.ky in ITEM_HAS && (
                        <p
                          style={{
                            margin: 0,
                            maxWidth: '100%',
                            fontSize: 13,
                            color: 'var(--nk-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <WordHighlight
                            content={Item.headString(ITEM_HAS[row.ky]!)}
                            keyword={keyword}
                          />
                        </p>
                      )}
                    </TableCell>
                    {/* 列宽由表头行统一决定（tableLayout: fixed），此处不再重复声明 width */}
                    <TableCell align="center">{row.words}</TableCell>
                    <TableCell align="center">{row.mentions}</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap', color: 'var(--nk-muted)' }}>{ago(row.created)}</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap', color: 'var(--nk-muted)' }}>{ago(row.updated)}</TableCell>
                  </TableRow>
                )
              })}
            {emptyRows > 0 && (
              <TableRow
                style={{
                  height: (dense ? 33 : 53) * emptyRows,
                }}
              >
                <TableCell colSpan={6} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <div
        className="topic-list-footer"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 16,
          minHeight: 56,
          paddingLeft: 16,
          paddingRight: 4,
          paddingBottom: 'env(safe-area-inset-bottom)',
          borderTop: '1px solid var(--nk-line)',
        }}
      >
        <span
          className="total-word-count"
          style={{
            fontSize: 13,
            color: 'var(--nk-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="count-label">Word count of topics: </span>
          <span
            className="count-value"
            style={{ color: 'var(--nk-ink)', fontWeight: 500 }}
          >
            {totalWords}
          </span>
        </span>
        <TablePagination
          sx={{ marginLeft: 'auto' }}
          component="div"
          rowsPerPageOptions={[25, 50, 100, { label: 'All', value: -1 }]}
          count={rows.length}
          rowsPerPage={rowsPerPage}
          page={page}
          SelectProps={{
            inputProps: {
              'aria-label': 'rows per page',
            },
            native: true,
          }}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          ActionsComponent={TablePaginationActionsComp}
        />
      </div>
    </div>
  )
}
