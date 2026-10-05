import { isEmpty } from 'lodash'
import React from 'react'
import { usePubState } from '../../hooks/usePubState'
import { Item } from '../../interfaces/item'
import { PUB_KEY_SRS } from './Srs'
import { ItemWithSrsDeck } from './types'
import LinearProgress from '@mui/material/LinearProgress'
import { useAddons } from '../../hooks/useAddons'
import { DialogProps } from '../../utils/msg/showDialog'

export const DialogTitle = (props: {
  title: DialogProps<any>['title']
  deckItem: ItemWithSrsDeck
}) => {
  const { title, deckItem } = props
  const $ = useAddons()
  const [info] = usePubState(PUB_KEY_SRS, {} as any)

  let progressString = ''
  let progress = 0
  let currentTitle = title

  if (!isEmpty(info) && !isEmpty(info.restItems)) {
    progressString = `(${Math.min(info.index + 1, info.restItems.length)}/${
      info.restItems.length
    })`
    progress = Math.min(((info.index + 1) / info.restItems.length) * 100, 100)

    // 如果是从 App/Review 复习全部卡片
    // 则需要找出当前卡片具体所属的复习计划
    if (deckItem.ky === $.srs.SRS_KY) {
      const realDeckItem = $.srs.getRealDeckItem(info.restItems[info.index])
      if (realDeckItem) {
        currentTitle = `${currentTitle}/${Item.headString(realDeckItem)}`
      }
    }
  }

  return (
    <>
      <span className="deck-title">{currentTitle}</span>
      <span className="deck-progress">{progressString}</span>
      <LinearProgress variant="determinate" value={progress} />
    </>
  )
}
