import React, { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react'
import { FileTextIcon, XIcon } from '@phosphor-icons/react'
import { useAddons } from '../../hooks/useAddons'
import { useAppStates } from '../../hooks/useAppStates'

/** Both layouts navigate the same open notes; only the content presentation changes. */
export const WorkspaceTabsComp = observer(() => {
  const { main } = useAddons()
  const { floatViewerMode } = useAppStates()
  const listRef = useRef<HTMLDivElement>(null)
  const dragKeyRef = useRef<string | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const activeKey = main.workspaceActiveKey
  const single = floatViewerMode !== 'andy' && main.workspaceTabs.length <= 1

  useEffect(() => {
    main.trackWorkspaceRoute()
  }, [main])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey, main.workspaceTabs.length])

  if (single) {
    const title = main.workspaceTabs[0]?.title || main.pageTitle || 'Evergreen note'
    return <div className="workspace-header-title" title={title}>
      <FileTextIcon size={18} aria-hidden="true" /><span>{title}</span>
    </div>
  }

  return <div ref={listRef} className="workspace-tabs" role="tablist" aria-label="已打开的笔记"
    onWheel={event => {
      // The strip hides its scrollbar, so give mouse wheels the same horizontal
      // scrolling precise trackpads get: vertical wheel delta pans the tabs.
      if (event.deltaX !== 0) return
      const el = event.currentTarget
      if (el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += event.deltaY
    }}
  >
    {main.workspaceTabs.map((tab, index) => <div
      key={tab.key}
      draggable
      onDragStart={event => {
        dragKeyRef.current = tab.key
        setDraggingKey(tab.key)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', tab.key)
      }}
      onDragOver={event => {
        if (dragKeyRef.current === null || dragKeyRef.current === tab.key) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={event => {
        event.preventDefault()
        event.stopPropagation()
        if (dragKeyRef.current !== null && dragKeyRef.current !== tab.key) {
          main.moveWorkspaceTab(dragKeyRef.current, index)
        }
        dragKeyRef.current = null
      }}
      onDragEnd={() => { dragKeyRef.current = null; setDraggingKey(null) }}
      className={`workspace-tab${tab.key === activeKey ? ' is-active' : ''}${draggingKey === tab.key ? ' is-dragging' : ''}`}
      role="tab"
      aria-selected={tab.key === activeKey}
      tabIndex={tab.key === activeKey ? 0 : -1}
      title={tab.title}
      onClick={() => main.selectWorkspaceTab(tab.key)}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        let next = index
        if (event.key === 'ArrowRight') next = (index + 1) % main.workspaceTabs.length
        else if (event.key === 'ArrowLeft') next = (index - 1 + main.workspaceTabs.length) % main.workspaceTabs.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = main.workspaceTabs.length - 1
        else if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        main.selectWorkspaceTab(main.workspaceTabs[next].key)
        ;(listRef.current?.children[next] as HTMLElement)?.focus()
      }}
    >
      <span className="workspace-tab-title">{tab.title}</span>
      <button type="button" className="workspace-tab-close" draggable={false} aria-label={`关闭 ${tab.title}`} title="关闭标签页"
        onClick={event => { event.stopPropagation(); main.closeWorkspaceTab(tab.key) }}>
        <XIcon size={12} weight="light" aria-hidden="true" />
      </button>
    </div>)}
  </div>
})
