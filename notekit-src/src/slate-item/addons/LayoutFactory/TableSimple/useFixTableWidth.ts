import React from 'react'
import { useItem } from '../../../hooks/useItem'
import { atLater } from '../../../utils/atLater'
import { ContextLayoutName } from '../LayoutContexts'

// 修正表格主体的宽度
export function useFixTableWidth() {
  const ctxItem = useItem()
  const ctxLayout = React.useContext(ContextLayoutName)

  React.useEffect(() => {
    if (ctxLayout !== 'tablesimple') return
    const itemDom = document.getElementById(ctxItem.$id)
    const colDom = itemDom?.querySelector(
      '.node-layout-tablesimple-2:last-child'
    ) as HTMLElement
    if (colDom) {
      const id = ctxItem.pky
      atLater(() => {
        const tableSubitemsDom: HTMLElement = colDom.closest(
          '.node-layout-tablesimple > .node-body > .node-subitems'
        )!
        const containerRect = tableSubitemsDom.getBoundingClientRect()
        const colRect = colDom.getBoundingClientRect()
        const width = colRect.right - containerRect.left + 2
        ;(tableSubitemsDom.style as any)['min-width'] = `${width}px`
        ;(tableSubitemsDom.style as any)['max-width'] = `${width}px`

        const rowHelperDom = tableSubitemsDom.parentElement!.querySelector(
          ':scope > .new-row-helper'
        ) as HTMLElement
        if (rowHelperDom) {
          ;(rowHelperDom.style as any)['min-width'] = `${width}px`
        }
      }, `set-table-width-${id}`)
    }
  })
}
