import { isEmpty } from 'lodash'
import React from 'react'
import { $t } from '../../../i18n'
import { EleOuter, EleIcon } from '../../components/Ele'
import { Tip } from '../../components/Tip/Tip'
import { ItemNode, Item } from '../../interfaces/item'
import { Keyword } from '../../notekit-ui/styled'
import { cls, preset } from '../../styles'
import { sleep } from '../../utils/sleep'
import { useAddons } from '../../hooks/useAddons'
import { Icon } from '../../../components/MaterialIcon'
import { usePubState } from '../../hooks/usePubState'
import { useIsTop } from '../../hooks/useIsTop'

export function countKey(id: string) {
  return `srs-deck-count-${id}`
}

export function SrsDeckStartIcon(props: { ctxItem: ItemNode }) {
  const { ctxItem } = props
  const isTop = useIsTop()
  const $ = useAddons()

  let deckItem = ctxItem
  if (isTop && !$.srs.isDeck(deckItem)) {
    const foundDeckItem = $.srs.hasDeckFrom(ctxItem)
    if (foundDeckItem) {
      deckItem = foundDeckItem as any
    }
  }

  const [count, setCount] = usePubState(countKey(deckItem.ky), 0, {
    clearWhenUnmount: deckItem.ky !== $.srs.SRS_KY,
  })

  React.useEffect(() => {
    if (!deckItem?.path?.includes($.srs.SRS_KY)) {
      return
    }
    sleep(100).then(() => {
      // const items = $.srs.getItems(kw as LogicString)
      const items = $.srs.getItemsOfDeck(deckItem.ky)
      setCount(items.length)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckItem.updated])

  if (!$.srs.getWhere(deckItem) && deckItem.ky !== $.srs.SRS_KY) {
    return null
  }

  if (
    $.crumbs.getPath(deckItem).includes($.srs.SRS_KY) &&
    !isEmpty(Item.headString(deckItem))
  ) {
    const onClick = () => {
      $.srs.showReviewDialogOf(deckItem as any)
    }
    return (
      <Tip title={$t(`srs.tip_start_review`, { count })} interactive={false}>
        <EleOuter onClick={onClick} classOuter="srs-deck-start-icon">
          <EleIcon classIcon={cls(preset.icon.basic)}>
            <Keyword color="slate" depth={200} style={{ marginRight: 4 }}>
              {count}
              <Icon name="svg_start" size={14} />
            </Keyword>
          </EleIcon>
        </EleOuter>
      </Tip>
    )
  }
  return null
}
