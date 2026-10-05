import React from 'react'
import { $t } from '../../../i18n'
import { EleOuter, EleIcon } from '../../components/Ele'
import { Tip } from '../../components/Tip/Tip'
import { ItemNode, Item } from '../../interfaces/item'
import { cls, preset } from '../../styles'
import { Icon } from '../../../components/MaterialIcon'
import { isEmpty } from '../../utils/isEmpty'
import { useAddons } from '../../hooks/useAddons'

export function SrsDeckSettingIcon(props: { ctxItem: ItemNode }) {
  const { ctxItem } = props
  const $ = useAddons()
  if (
    $.crumbs.getPath(ctxItem).includes($.srs.SRS_KY) &&
    !isEmpty(Item.headString(ctxItem))
  ) {
    const id = `srs-deck-${ctxItem.$id}`
    return (
      <Tip title={$t`srs.tip_setup`} interactive={false}>
        <EleOuter
          onClick={() => $.srs.showDeckForm({ deckItem: ctxItem })}
          id={id}
          order={10000}
        >
          <EleIcon classIcon={cls(preset.icon.basic)}>
            <Icon name="svg_settings" size={16} />
          </EleIcon>
        </EleOuter>
      </Tip>
    )
  }
  return null
}
