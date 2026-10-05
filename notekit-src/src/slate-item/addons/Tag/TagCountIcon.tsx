import { observer } from 'mobx-react'
import React from 'react'
import { EleOuter, EleHead } from '../../components/Ele'
import { useAddons } from '../../hooks/useAddons'
import { Item, ItemNode } from '../../interfaces/item'
import { isEmpty } from '../../utils/isEmpty'
import { ContextEditorInline } from '../EditorView/EditorViewContexts'
import { countIconStyle } from '../Refer/ReferIcon'

export const TagCountIcon = observer((props: { ctxItem: ItemNode }) => {
  const { ctxItem } = props
  const $ = useAddons()

  if (!$.tag.isTagItem(ctxItem)) {
    return null
  }

  const count = $.tag.getCount($.tag.itemToTagText(ctxItem))
  const isInline = React.useContext(ContextEditorInline)

  const onClick = (e: React.MouseEvent) => {
    $.tag.handleTagCountIconClick(ctxItem)
    e.stopPropagation()
  }

  return isInline || isEmpty(count) ? null : (
    <EleOuter onClick={onClick} classOuter={`${countIconStyle} refer-count`}>
      <EleHead>{count}</EleHead>
    </EleOuter>
  )
})
