import React from 'react'
import { useAddons } from '../../../hooks/useAddons'
import { ElementComponentProps } from '../../EditorView/EditorView'
import { ContextLayoutDepth, ContextLayoutItem } from '../LayoutContexts'
import { findDOMIndex } from '../../../utils/dom/findDOMIndex'
import { useItem } from '../../../hooks/useItem'

export function TableSimpleCellComp(props: ElementComponentProps<any>) {
  const { tableSimple } = useAddons()
  const { children, element } = props
  const ctxDepth = React.useContext(ContextLayoutDepth)
  const tableItem = React.useContext(ContextLayoutItem)
  const ctxItem = useItem()

  React.useLayoutEffect(() => {
    const itemDom = document.getElementById(ctxItem.$id)
    if (!itemDom) return
    const cellDoms = itemDom.querySelectorAll('.node-layout-tablesimple-2')
    const el = cellDoms[ctxDepth === 1 ? 0 : cellDoms.length - 1] as HTMLElement
    if (!el) return
    const rect = el.getBoundingClientRect()
    const index =
      ctxDepth === 1
        ? 0
        : findDOMIndex(el.closest('.node')!, '.node-layout-tablesimple-2')
    tableSimple.setColWidth(tableItem.ky, index, rect.width)
    el.closest('.node')?.setAttribute('data-table-ky', tableItem.ky)
  })

  return <>{children}</>
}
