import React, { useRef } from 'react'
import { useClickAway } from '../../hooks/useClickAway'
import { useSnap } from '../../hooks/useSnap'
import { cls } from '../../styles'
import { BoxInfo, Placement } from '../../utils/calcSnap'
import { useTopZIndex } from '../../hooks/useTopZIndex'

export type PopupProps = {
  draggable?: boolean
  isVisible?: boolean
  targetBox?: BoxInfo
  place?: Placement
  [k: string]: any
}

const popupStyle = cls`
  visibility: visible;
  position: fixed;
`

export const PopupBox = (props: PopupProps) => {
  const ref = useRef(null)
  const { isVisible = true } = props
  const [visible, setVisible] = React.useState(isVisible)

  useClickAway(ref, () => {
    if (props.closeMenu) props.closeMenu()
    else setVisible(false)
  })

  const {
    place = ['center', 'middle'],
    targetBox = {
      left: window.innerWidth / 2,
      top: window.innerHeight / 2,
      width: 0,
      height: 0,
    },
   ...rest
  } = props

  useSnap(ref, targetBox, place)
  useTopZIndex(ref)

  if (visible) {
    return (
      <div ref={ref} {...rest} className={popupStyle}>
        {props.children}
      </div>
    )
  }
  return null
}
