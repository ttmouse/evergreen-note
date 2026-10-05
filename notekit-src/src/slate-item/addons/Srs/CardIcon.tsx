import React from 'react'
import { useItem } from '../../hooks/useItem'
import { useAddons } from '../../hooks/useAddons'
import { EleIcon, EleOuter } from '../../components/Ele'
import { Icon } from '../../../components/MaterialIcon'
import { cls, preset } from '../../styles'
import { Tip } from '../../components/Tip/Tip'
import { ReferLink } from '../Refer/ReferLink'
import { CLOZE_OPTIONS, SRS_KY } from './Srs'
import { ItemWithSrsDeck } from './types'

const outerStyle = cls`
  opacity: 0.2;
  transition: opacity 0.2s;
  position: absolute;
  right: -30px;
  top: 0px;

  &:hover {
    opacity: 1;
  }
`

const tipStyle = cls`
  * {
    color: #fff !important;
    text-align: left !important;
  }
`

export function CardItemIcon() {
  const ctxItem = useItem()
  const $ = useAddons()

  if (!$.srs.isCard(ctxItem)) {
    return null
  }

  const deckItem = $.srs.whichDeck(ctxItem)
  if (!deckItem) {
    return null
  }

  const info = (deckItem as any)?.srs?.deck ?? {}

  return (
    <Tip
      title={
        <p>
          当前节点符合复习预设条件：“{info.where}”， 已纳入到复习计划
          <span className={tipStyle}>
            <ReferLink ky={deckItem.ky} action="route-highlight" />
          </span>
          <span>
            当前复习计划的答案规则是:{' '}
            {info.cloze?.map((c: any) => (CLOZE_OPTIONS as any)[c])}
          </span>
        </p>
      }
    >
      <EleOuter
        onClick={() => $.router.to(SRS_KY, { highlightItems: deckItem.ky })}
        classOuter={outerStyle}
      >
        <EleIcon classIcon={cls(preset.icon.basic)}>
          <Icon name="svg_srs" size={16} />
        </EleIcon>
      </EleOuter>
    </Tip>
  )
}
