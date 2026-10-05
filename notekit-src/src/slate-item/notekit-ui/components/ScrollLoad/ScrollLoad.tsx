import React from 'react'
import { DEBUG_MODE } from '../../../../main'
import { isEmpty } from '../../../utils/isEmpty'
import { useScrollLoad } from './useScrollLoad'

export function ScrollLoad<T>(props: { renderItem: () => JSX.Element | null, allCnt: number, currentCnt: number }) {
  const { renderItem: Comp } = props
  const ref = React.useRef(null)
  const loading = useScrollLoad(ref)

  return (
    <>
      {loading ? (
        <div
          ref={ref}
          className="nui-loading"
          style={{ height: '500px', opacity: '0' }}
        />
      ) : (
        <>
          <Comp />
          {(props.allCnt >= props.currentCnt) && <ScrollLoad renderItem={props.renderItem} allCnt={props.allCnt} currentCnt={props.currentCnt + 1} />}
        </>
      )}
    </>
  )
}

export function ScrollLoad2<T>(props: {
  renderItem: (props: { item: T }) => JSX.Element | null
  list: T[]
  /*
  allow to indicate a slice size to render some of the items statically,
  like: items in slice(0, 10) are rendered statically,
  and the rest slice(10) will be applied the lazy-loading effect.
  */
  staticCount?: number
}) {
  const { renderItem: Comp, list, staticCount = 0 } = props
  let i = 0
  const dynamicItems = list.slice(staticCount)
  const renderItem2 = () => {
    const index = Math.floor(i / 1)
    const item = dynamicItems[index]
    i += DEBUG_MODE ? 0.5 : 1 // 由于 renderNext2 会被 React 调用两次 ，所以这里要加0.5
    return isEmpty(item) ? null : <Comp item={item!} />
  }

  return (
    <>
      {list.slice(0, staticCount).map((item) => (
        <Comp item={item} />
      ))}
      <ScrollLoad renderItem={renderItem2} allCnt={dynamicItems.length} currentCnt={1} />
    </>
  )
}
