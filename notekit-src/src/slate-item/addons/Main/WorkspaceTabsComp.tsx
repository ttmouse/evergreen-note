import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const tabNodesRef = useRef(new Map<string, HTMLDivElement>())
  const tabRectsRef = useRef(new Map<string, DOMRect>())
  const activeKey = main.workspaceActiveKey
  const single = floatViewerMode !== 'andy' && main.workspaceTabs.length <= 1

  useEffect(() => {
    main.trackWorkspaceRoute()
  }, [main])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey, main.workspaceTabs.length])

  // FLIP 平滑让位：顺序变化后，把每个 Tab（含被拖 Tab 的虚线占位槽）从旧位置补间到新位置。
  // 用 offsetLeft 取布局位置，避免 rect 被上一次动画未释放的 transform 污染。
  const tabOrder = main.workspaceTabs.map(tab => tab.key).join('|')
  useLayoutEffect(() => {
    if (dragKeyRef.current === null) return // 只在拖拽期间补帧，其余重排不做动画
    const first = tabRectsRef.current
    for (const [key, el] of tabNodesRef.current) {
      const prev = first.get(key)
      const now = el.offsetLeft
      if (prev !== undefined && Math.abs(prev - now) > 1) {
        el.style.transition = 'none'
        el.style.transform = `translateX(${prev - now}px)`
        void el.offsetWidth
        el.style.transition = ''
        el.style.transform = ''
      }
      first.set(key, now)
    }
  }, [tabOrder])

  // 拖拽开始时基线化各 Tab 位置（保证第一次换位也有动画），结束时清表
  useEffect(() => {
    if (draggingKey === null) { tabRectsRef.current.clear(); return }
    if (tabRectsRef.current.size === 0) {
      for (const [key, el] of tabNodesRef.current) tabRectsRef.current.set(key, el.offsetLeft)
    }
  }, [draggingKey])

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
      ref={el => {
        if (el) tabNodesRef.current.set(tab.key, el)
        else tabNodesRef.current.delete(tab.key)
      }}
      draggable
      onDragStart={event => {
        dragKeyRef.current = tab.key
        setDraggingKey(tab.key)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', tab.key)
      }}
      onDragOver={event => {
        const dragKey = dragKeyRef.current
        if (dragKey === null || dragKey === tab.key) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        // 让位触发：指针一越过该 Tab 边缘就重排；按悬停在哪半边决定插到前/后
        const rect = event.currentTarget.getBoundingClientRect()
        const after = event.clientX > rect.left + rect.width / 2
        main.moveWorkspaceTab(dragKey, after ? index + 1 : index)
      }}
      onDrop={event => {
        event.preventDefault()
        event.stopPropagation()
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
