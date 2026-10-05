import React from 'react'
import { ATOMIC_CLASS_MAP, Brick, BrickProps } from '../Brick/Brick'
import './Panel.less'

export type PanelProps = BrickProps & {}
export const PANEL_CLASS_MAP = {
  ...ATOMIC_CLASS_MAP,
  outer: 'nui-panel',
}

export const Panel = React.forwardRef(
  (props: PanelProps, ref: React.ForwardedRef<HTMLElement>) => {
    const { partClasses = PANEL_CLASS_MAP, ...rest } = props
    return <Brick partClasses={partClasses} {...rest} ref={ref} />
  }
)
