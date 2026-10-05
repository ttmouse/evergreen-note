import React from 'react'
import { cls, colorBase, px } from '../../styles'
import { useAddons } from '../../hooks/useAddons'
import { EleHead, EleOuter } from '../../components/Ele'
import { observer } from 'mobx-react'
import { isEmpty } from '../../utils/isEmpty'
import { ItemNode } from '../../interfaces/item'
import { ContextEditorInline } from '../EditorView/EditorViewContexts'
import { $t } from '../../../i18n'
import { Tip } from '../../components/Tip/Tip'

export const countIconStyle = cls`
  order: 100;
  border-radius: ${px(100)};
  display: inline-flex;
  min-width: ${px(20)};
  height: ${px(20)};
  justify-content: center;
  align-items: center;
  font-size: ${px(12)};
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;
  // background-color: var(--cl-slate-100);

  &:hover {
    background-color: var(--cl-slate-300);
  }
`

export const ReferIcon = observer((props: { ctxItem: ItemNode }) => {
  const { ctxItem } = props
  const { refer } = useAddons()
  const referCount = refer.getCount(ctxItem.ky)
  const isInline = React.useContext(ContextEditorInline)

  const onClick = (e: React.MouseEvent) => {
    refer.handleReferIconClick(ctxItem)
    e.stopPropagation()
  }

  return isInline || isEmpty(referCount) ? null : (
    <Tip title={$t('refer.refer_icon_tip', { count: referCount }) as string}>
      <EleOuter onClick={onClick} classOuter={`${countIconStyle} refer-count`}>
        <EleHead>{referCount}</EleHead>
      </EleOuter>
    </Tip>
  )
})
