import React, { useEffect } from 'react'
import { TabList } from '../../notekit-ui/components/Tab/Tab'
import { useApp } from '../../hooks/useApp'
import { observer } from 'mobx-react'
import { useAddons } from '../../hooks/useAddons'
import './float-viewer.less'
import { Brick } from '../../notekit-ui/components/Brick/Brick'
import { XIcon } from '@phosphor-icons/react'
import { MainToolbarComp } from '../Main/MainComp'
import { WorkspaceTabsComp } from '../Main/WorkspaceTabsComp'

export const FloatViewerListComp = observer(() => {
  const app = useApp()
  const $ = useAddons()

  const activeKey = app.states.floatViewerActiveKey
  useEffect(() => {
    if (app.states.floatViewerMode !== 'andy') return
    const tab = document.getElementById(`tab-${activeKey}`)
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey, app.states.floatViewerMode, app.states.floatViewerList.length])

  const items = (() => {
    const order = $.dialog.store.order
    const orderedList = order
      .filter((id) => app.states.floatViewerList.some((d) => d.dialogId === id))
      .map((id) => app.states.floatViewerList.find((d) => d.dialogId === id)!)
    const remaining = app.states.floatViewerList.filter(
      (d) => !order.includes(d.dialogId)
    )
    return [...orderedList, ...remaining].map((dlg) => {
      const entry = $.dialog.store.get(dlg.dialogId)
      return {
        title: (entry?.folded ? '*' : '') + dlg.title,
        id: `tab-${dlg.dialogId}`,
        active: dlg.dialogId === app.states.floatViewerActiveKey,
        extra: (
          <button
            type="button"
            className="floatviewer-tab-close"
            aria-label={`关闭 ${dlg.title}`}
            title="关闭标签页"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              $.dialog.close(dlg.dialogId)
            }}
          >
            <XIcon
              size={app.states.floatViewerMode === 'andy' ? 12 : 14}
              weight={app.states.floatViewerMode === 'andy' ? 'light' : 'regular'}
              aria-hidden="true"
            />
          </button>
        ),
        onClick() {
          if (!entry || !entry.visible || entry.folded) {
            $.floatViewer.show({
              item: dlg.key,
              DialogProps: {
                canPin: {
                  pin: true,
                },
                SnapProps: {
                  targetBox: window,
                  place: ['center', 'top-in'],
                },
              },
            })
          } else {
            $.floatViewer.unfold(dlg.dialogId)
          }
          setTimeout(() => {
            $.andy.scrollIntoView(dlg.dialogId)
          }, 10)
        },
        onContextMenu(e: React.MouseEvent) {
          if (entry && entry.visible) {
            e.preventDefault()
            $.dialog.close(dlg.dialogId)
          }
        },
      }
    })
  })()
  const mode = app.states.floatViewerMode
  return (
    <Brick
      type="floatview-container"
      title={mode === 'andy' ? (
        <div className="andy-header-content">
          <WorkspaceTabsComp />
          <MainToolbarComp id={`${$.main.ids.extra}-andy`} className="andy-header-actions" />
        </div>
      ) : <TabList subitems={items} />}
      body={<> </>}
      id={$.floatViewer.containerId}
      data-mode={mode}
    />
  )
})
