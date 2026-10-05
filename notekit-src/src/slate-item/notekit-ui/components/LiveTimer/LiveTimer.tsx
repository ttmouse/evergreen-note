/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { AllowedTimeValue, datekit } from '../../../utils/date/datekit'

export type LiveTimerProps = {
  time: AllowedTimeValue
  interval?: number // milliseconds
  render?: (props: LiveTimerProps) => JSX.Element | null
  format?: (time: AllowedTimeValue) => string
}

/**
 * 一个实时刷新时间的组件
 * @param props
 * @returns
 */
export function LiveTimer(props: LiveTimerProps) {
  const {
    interval = 60 * 1000,
    render: Component = (renderProps) => <>{renderProps.time}</>,
    time,
    format = (t) => datekit(t).fromNow(),
  } = props

  const [fmtTime, setFmtTime] = React.useState(format(time))
  React.useEffect(() => {
    const t = setInterval(() => {
      setFmtTime(format(time))
    }, interval)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="nui-live-timer">
      <Component {...props} time={fmtTime} />
    </div>
  )
}
