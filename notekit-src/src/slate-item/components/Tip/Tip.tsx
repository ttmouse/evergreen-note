import Tooltip, { TooltipProps } from '@mui/material/Tooltip'
import React from 'react'
import { isEmpty } from '../../utils/isEmpty'
import { ContextTip } from './TipContexts'
import './Tip.less'

export type TipProps = {
  title: string | JSX.Element
  children: JSX.Element
  placement?: TooltipProps['placement']
  interactive?: boolean
  enterDelay?: number
  enterNextDelay?: number
  enterTouchDelay?: number
  leaveTouchDelay?: number
}

export function Tip(props: TipProps) {
  const {
    title,
    children,
    placement,
    interactive = true,
    enterDelay,
    enterNextDelay,
    enterTouchDelay,
    leaveTouchDelay,
  } = props
  const insideTip = React.useContext(ContextTip)
  if (insideTip) {
    return children
  }
  if (isEmpty(title)) {
    return children
  }
  // If '\n' exists in title, it will be rendered as a new line.
  // So we replace it with <br />.
  let titleComp: any = title
  if (typeof title === 'string' && title.includes('\n')) {
    titleComp = title
      .split(/(\n)/)
      .map((t, i) => (t === '\n' ? <br key={i} /> : t))
  }

  return (
    <ContextTip.Provider value={title as string}>
      <Tooltip
        title={titleComp}
        placement={placement}
        arrow
        disableInteractive={!interactive}
        enterDelay={enterDelay}
        enterNextDelay={enterNextDelay}
        enterTouchDelay={enterTouchDelay}
        leaveTouchDelay={leaveTouchDelay}
      >
        {children}
      </Tooltip>
    </ContextTip.Provider>
  )
}
