import { observer } from 'mobx-react'
import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { useIsTop } from '../../hooks/useIsTop'
import { ItemNode } from '../../interfaces/item'
import { cls, colorBase, preset } from '../../styles'
import classnames from 'classnames'
import { FeatureIcon } from '../../components/ItemView'
import { useIsReferContext } from '../../hooks/useIsReferContext'
import { $t } from '../../../i18n'
import { Tip } from '../../components/Tip/Tip'
import { EleIcon, EleOuter } from '../../components/Ele'
import { Icon } from '../../../components/MaterialIcon'

export const StarIcon = observer((props: { ctxItem: ItemNode }) => {
  const { ctxItem } = props
  const { star } = useAddons()
  const isReferCxt = useIsReferContext()
  const isTop = useIsTop()
  if (ctxItem.$isTmp) return null;
  if (!isTop || isReferCxt || ctxItem.ky === star.starKy) {
    return null
  }
  const onClick = () => {
    star.toggle(ctxItem.ky)
  }

  const stared = cls`
    * {
      color: ${[colorBase.primary, 500]};
    }
  `
  return (
    <Tip title={$t`star.title`}>
      {/* <FeatureIcon
        classOuter={classnames({
          [stared]: star.isStar(ctxItem.ky),
        })}
        order={4000}
        icon="svg_star"
        onClick={onClick}
      /> */}
      <EleOuter
        onClick={onClick}
        classOuter={classnames({
          [stared]: star.isStar(ctxItem.ky),
        })}
      >
        <EleIcon order={4000} classIcon={cls(preset.icon.basic)}>
          <Icon name="svg_star" />
        </EleIcon>
      </EleOuter>
    </Tip>
  )
})
