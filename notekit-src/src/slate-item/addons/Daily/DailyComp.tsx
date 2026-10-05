import React from 'react'
import { UnitPersist } from '../..'
import { isDate } from './Daily'
import { useAddons } from '../../hooks/useAddons'
import { isEmpty } from '../../utils/isEmpty'
import { cls, colorBase } from '../../styles'
import { useScrollLoad } from '../../notekit-ui/components/ScrollLoad/useScrollLoad'
import { ContextDialog } from '../../utils/msg/msgContexts'

const classList = [
  cls`
    border-top: 1px solid var(--cl-slate-300);
    &:not(.previous-diary-wrap ~ *) {
      margin-top: 300px;
    }
  `,
  'previous-diary-wrap',
].join(' ')

function Daily(props: { item: UnitPersist; fromRouter: boolean }) {
  const { item, fromRouter } = props
  const $ = useAddons()
  const ref = React.useRef(null)
  // 浮窗/对话框里只看当前这篇：不挂滚动加载，否则底部会长期留一个 500px 的空占位。
  const inDialog = React.useContext(ContextDialog)
  const loading = useScrollLoad(ref, !inDialog)
  const prevItem = React.useMemo(() => {
    if (!loading) {
      const prev = $.daily.getPrevious(item.topic!)
      return !prev ? null : $.dbMemory.getItem(prev.ky, { isRecur: true })
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, item.topic])
  const EditorComponent = $.editorView.createComponent()

  // 对于最后一个项目我们增加一个100vh的placeholder使其有空间滚动
  const prevComp = isEmpty(prevItem) ? <div className={cls`width: 100%; height: 100vh; display: block;`}></div> : (
    <>
      <div className={classList}>
        <EditorComponent item={prevItem!} />
      </div>
      {/* <DailyScrollComp item={prevItem!} fromRouter={fromRouter} /> 已在moreComponent里挂载 */}
    </>
  )

  return (
    <>
      {loading ? (
        <div
          ref={ref}
          id={`loading-${item.ky}`}
          style={{ height: '500px', opacity: '0' }}
        >
          loading
        </div>
      ) : (
        prevComp
      )}
    </>
  )
}

export function DailyScrollComp(props: {
  item: UnitPersist
  fromRouter: boolean
}) {
  const { item, fromRouter } = props
  return isDate(item.topic) ? <Daily {...props} /> : null
}
