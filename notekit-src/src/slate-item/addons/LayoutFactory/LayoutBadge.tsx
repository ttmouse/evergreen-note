import React from 'react'
import { Keyword } from '../../notekit-ui/styled'
import { useAddons } from '../../hooks/useAddons'
import { isEmpty } from '../../utils/isEmpty'

/**
 *
 */

export function LayoutBadge(props: { layout: string }) {
  const { layout } = props
  const $ = useAddons()
  if (isEmpty(layout)) {
    return null
  }
  const title = $.layoutFactory.layouts[layout]?.title ?? ''
  if (isEmpty(title)) {
    return null
  }
  return (
    <Keyword color="slate" depth={200} style={{ marginRight: 4 }}>
      {title}
    </Keyword>
  )
}
