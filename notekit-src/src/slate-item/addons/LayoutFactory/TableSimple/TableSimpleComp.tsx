import React from 'react'
import { ElementComponentProps } from '../../EditorView/EditorView'
import { useItem } from '../../../hooks/useItem'
import { Item } from '../../../interfaces/item'
import { ContextLayoutName, ContextLayoutDepth } from '../LayoutContexts'
import { useFixTableWidth } from './useFixTableWidth'
import { TableStyleComp } from './TableStyleComp'
import { TableSimpleCellComp } from './TableSimpleCellComp'

function TableSimpleSubitemsComp(props: ElementComponentProps<any>) {
  const { children } = props
  return (
    <>
      {children}
      {/* <RowDragComp />
      <NewRowComp />
      <NewColComp /> */}
      <TableStyleComp />
    </>
  )
}

export function TableSimpleComp(props: ElementComponentProps<any>) {
  const { children, element } = props
  const ctxItem = useItem()

  useFixTableWidth()

  const ctxLayout = React.useContext(ContextLayoutName)
  const ctxDepth = React.useContext(ContextLayoutDepth)

  if (ctxItem.layout === 'tablesimple' && !ctxItem.foldup) {
    if (element.type === Item.partTypes.subitems) {
      return <TableSimpleSubitemsComp {...props} />
    }
  }

  if (
    ctxLayout === 'tablesimple' &&
    [1, 2].includes(ctxDepth) &&
    element.type === Item.partTypes.head
  ) {
    return <TableSimpleCellComp {...props} />
  }

  return <>{children}</>
}
