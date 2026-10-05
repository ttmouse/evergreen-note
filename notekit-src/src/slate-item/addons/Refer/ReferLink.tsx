import React from 'react'
import { KyString } from '../../interfaces/unit'
import { useAddons } from '../../hooks/useAddons'
import Button, { ButtonTypeMap } from '@mui/material/Button'
import { Item } from '../../interfaces/item'
import { ExtendButtonBase } from '@mui/material'
import { SRS_KY } from '../Srs/Srs'

export function ReferLink(
  props: {
    ky: KyString
    action?: 'zoomin' | 'popup' | 'route-highlight'
  } & Partial<ExtendButtonBase<ButtonTypeMap<{}, 'button'>>>
) {
  const { ky, action = 'floatViewer', ...rest } = props
  const $ = useAddons()
  const item = React.useMemo(
    () => $.dbMemory.getItem(ky, { isRecur: true }),
    [$.dbMemory, ky]
  )
  const onClick = (e: React.MouseEvent) => {
    if (action === 'zoomin') {
      $.router.to(item)
    } else if (action === 'route-highlight') {
      $.router.to(SRS_KY, { highlightItems: item.ky })
    } else {
      $.floatViewer?.show({
        item,
        SnapProps: {
          targetBox: e.currentTarget as HTMLElement,
          place: ['right-out', 'middle'],
        },
      }) ?? $.router.to(item)
    }
  }
  return (
    <Button size="small" onClick={onClick} {...rest}>
      《{Item.headString(item, { parseRefer: true })}》
    </Button>
  )
}
