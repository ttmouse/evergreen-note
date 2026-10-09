import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { observer } from 'mobx-react'
import { FileTextIcon, XIcon } from '@phosphor-icons/react'
import { useAddons } from '../../hooks/useAddons'
import { useAppStates } from '../../hooks/useAppStates'

const TAB_GAP = 4 // 必须与 .workspace-tabs 的 CSS gap 保持一致
const DRAG_THRESHOLD = 4 // 位移超过该值才进入拖拽态，否则视为点击
const FLIP_MS = 120

/** Both layouts navigate the same open notes; only the content presentation changes. */
export const WorkspaceTabsComp = observer(() => {
  const { main } = useAddons()
  const { floatViewerMode } = useAppStates()
  const listRef = useRef<HTMLDivElement>(null)
  const activeKey = main.workspaceActiveKey
  const single = floatViewerMode !== 'andy' && main.workspaceTabs.length <= 1

  // —— 拖拽 ref 组：判定逻辑一律读 ref（同步、不受渲染落后影响），渲染只跟 state 走 ——
  const tabNodesRef = useRef(new Map<string, HTMLDivElement>())
  const dragKeyRef = useRef<string | null>(null) // 同步拖拽态（state 只负责触发渲染）
  const pressedKeyRef = useRef<string | null>(null)
  const startXRef = useRef(0)
  const originXRef = useRef(0) // 标签条视口左缘
  const ghostLeftRef = useRef(0) // 浮层初始视口 X（position:fixed 用）
  const ghostTopRef = useRef(0)
  const ghostWRef = useRef(0) // 冻结宽度
  const baseRef = useRef(new Map<string, number>()) // 各标签内容相对 left（越界判定坐标表）
  const baseWRef = useRef(new Map<string, number>())
  const lastXRef = useRef<number | null>(null) // 上一次指针的内容相对 X（判穿越）
  const offsetXRef = useRef(0)
  const rafRef = useRef(0)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const prevLeftRef = useRef(new Map<string, number>()) // FLIP 基线（offsetLeft）
  const flipRafRef = useRef(new Map<HTMLDivElement, number>())
  const suppressClickRef = useRef(false)
  const moveHandlerRef = useRef<(e: PointerEvent) => void>(() => {})
  const upHandlerRef = useRef<(e: PointerEvent) => void>(() => {})
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  useEffect(() => {
    main.trackWorkspaceRoute()
  }, [main])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeKey, main.workspaceTabs.length])

  const contentX = (clientX: number) => {
    const rect = listRef.current?.getBoundingClientRect()
    return rect ? clientX - rect.left + listRef.current!.scrollLeft : 0
  }

  // 按下瞬间测量：每个标签相对标签条内容原点的 left 与宽度（宽度冻结，重排后只重算 left）
  const measureBase = () => {
    const rect = listRef.current?.getBoundingClientRect()
    baseRef.current.clear()
    baseWRef.current.clear()
    if (!rect) return
    const scrollLeft = listRef.current?.scrollLeft ?? 0
    for (const [key, el] of tabNodesRef.current) {
      const r = el.getBoundingClientRect()
      baseRef.current.set(key, r.left - rect.left + scrollLeft)
      baseWRef.current.set(key, el.offsetWidth)
    }
  }

  // 重排后用新顺序 + 冻结宽度重算坐标表（渲染未提交也用正确坐标判定下一帧）
  const recomputeBase = () => {
    let x = 0
    for (const tab of main.workspaceTabs) {
      baseRef.current.set(tab.key, x)
      x += (baseWRef.current.get(tab.key) ?? 0) + TAB_GAP
    }
  }

  const baselineFlip = () => {
    prevLeftRef.current.clear()
    for (const [key, el] of tabNodesRef.current) prevLeftRef.current.set(key, el.offsetLeft)
  }

  // 让位核心：只有本次移动越过了某邻居的左/右缘才换位；一次至多让一位，方向看下标
  const maybeReorder = (pointerX: number, previousX: number) => {
    const dragKey = dragKeyRef.current
    if (!dragKey) return
    const order = main.workspaceTabs.map(tab => tab.key)
    const dragIndex = order.indexOf(dragKey)
    for (let i = 0; i < order.length; i++) {
      const key = order[i]
      if (key === dragKey) continue
      const left = baseRef.current.get(key)
      const right = left + (baseWRef.current.get(key) ?? 0)
      const crossed = (previousX >= right && pointerX < right) || (previousX <= left && pointerX > left)
      if (!crossed) continue
      const side = dragIndex > i ? 'left' : 'right'
      // 幂等预演：这次穿越若不改变顺序（缝隙抖动）就不提交
      const without = order.filter(k => k !== dragKey)
      const insertAt = without.indexOf(key) + (side === 'right' ? 1 : 0)
      const predicted = [...without]
      predicted.splice(insertAt, 0, dragKey)
      const toIndex = predicted.indexOf(dragKey)
      if (toIndex === dragIndex) return
      main.moveWorkspaceTab(dragKey, toIndex) // 顺序先行，动画只负责补帧
      recomputeBase()
      return
    }
  }

  const clearDrag = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    window.removeEventListener('pointercancel', handleUp)
    pressedKeyRef.current = null
    dragKeyRef.current = null
    lastXRef.current = null
    prevLeftRef.current.clear()
    setDraggingKey(null)
  }, [])

  // 监听挂在 window（被拖标签已退化为占位槽，元素上的监听不可靠）；转发 ref 保持闭包新鲜
  const handleMove = useCallback((e: PointerEvent) => { moveHandlerRef.current(e) }, [])
  const handleUp = useCallback((e: PointerEvent) => { upHandlerRef.current(e) }, [])

  useEffect(() => {
    moveHandlerRef.current = (e: PointerEvent) => {
      const key = pressedKeyRef.current
      if (!key) return
      const dx = e.clientX - startXRef.current
      if (!dragKeyRef.current) {
        if (Math.abs(dx) <= DRAG_THRESHOLD) return // 阈值内视为点击
        dragKeyRef.current = key
        offsetXRef.current = dx
        lastXRef.current = contentX(e.clientX)
        baselineFlip() // 进入拖拽态先基线化，第一次换位也有动画
        main.selectWorkspaceTab(key) // 进入拖拽态的同时激活该标签
        setDraggingKey(key)
        return
      }
      // 跟手：只写 ref + rAF 直写 transform，不触发渲染
      offsetXRef.current = dx
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${offsetXRef.current}px, 0, 0)`
        })
      }
      const px = contentX(e.clientX)
      const prev = lastXRef.current
      lastXRef.current = px
      if (prev !== null) maybeReorder(px, prev)
    }
    upHandlerRef.current = () => {
      const wasDragging = dragKeyRef.current !== null
      clearDrag()
      if (wasDragging) {
        suppressClickRef.current = true // 吞掉松手后紧跟的那次 click
        setTimeout(() => { suppressClickRef.current = false }, 0)
      }
    }
  })

  // 卸载兜底：取消所有 rAF、清掉 pinned transform 与 window 监听
  useEffect(() => () => {
    for (const [el, raf] of flipRafRef.current) {
      cancelAnimationFrame(raf)
      el.style.transition = ''
      el.style.transform = ''
    }
    flipRafRef.current.clear()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    window.removeEventListener('pointercancel', handleUp)
  }, [handleMove, handleUp])

  // FLIP 补帧：只给被让位的标签（占位槽/浮层不参与）；可被下一次让位打断
  const tabOrder = main.workspaceTabs.map(tab => tab.key).join('|')
  useLayoutEffect(() => {
    if (!dragKeyRef.current) return
    for (const [key, el] of tabNodesRef.current) {
      const prev = prevLeftRef.current.get(key)
      const now = el.offsetLeft
      prevLeftRef.current.set(key, now)
      if (prev === undefined || Math.abs(prev - now) <= 1) continue
      const pending = flipRafRef.current.get(el)
      if (pending) cancelAnimationFrame(pending)
      el.style.transition = 'none'
      el.style.transform = `translateX(${prev - now}px)`
      const raf = requestAnimationFrame(() => {
        flipRafRef.current.delete(el)
        el.style.transition = ''
        el.style.transform = ''
      })
      flipRafRef.current.set(el, raf)
    }
  }, [tabOrder])

  // 浮层首帧对齐：setDraggingKey 的渲染提交后、绘制前补上初始 transform，避免先闪原位
  useLayoutEffect(() => {
    if (draggingKey && ghostRef.current) {
      ghostRef.current.style.transform = `translate3d(${offsetXRef.current}px, 0, 0)`
    }
  }, [draggingKey])

  const onTabPointerDown = (event: React.PointerEvent<HTMLDivElement>, key: string) => {
    // 只响应左键与触控板；触屏、右键、中键不进入拖拽
    if (event.button !== 0 || event.pointerType === 'touch') return
    if (dragKeyRef.current || suppressClickRef.current) return
    event.preventDefault()
    pressedKeyRef.current = key
    startXRef.current = event.clientX
    const rect = listRef.current?.getBoundingClientRect()
    originXRef.current = rect ? rect.left : 0
    const elRect = event.currentTarget.getBoundingClientRect()
    ghostLeftRef.current = elRect.left
    ghostTopRef.current = elRect.top
    ghostWRef.current = event.currentTarget.offsetWidth
    measureBase()
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  if (single) {
    const title = main.workspaceTabs[0]?.title || main.pageTitle || 'Evergreen note'
    return <div className="workspace-header-title" title={title}>
      <FileTextIcon size={18} aria-hidden="true" /><span>{title}</span>
    </div>
  }

  const dragTab = draggingKey ? main.workspaceTabs.find(tab => tab.key === draggingKey) : null

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
    {main.workspaceTabs.map((tab, index) => draggingKey === tab.key
      ? <div key={tab.key} className="workspace-tab-slot" style={{ width: ghostWRef.current }} aria-hidden="true" />
      : <div
      key={tab.key}
      ref={el => {
        if (el) tabNodesRef.current.set(tab.key, el)
        else tabNodesRef.current.delete(tab.key)
      }}
      onPointerDown={event => onTabPointerDown(event, tab.key)}
      className={`workspace-tab${tab.key === activeKey ? ' is-active' : ''}`}
      role="tab"
      aria-selected={tab.key === activeKey}
      tabIndex={tab.key === activeKey ? 0 : -1}
      title={tab.title}
      onClick={() => {
        if (suppressClickRef.current) return
        main.selectWorkspaceTab(tab.key)
      }}
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
      <button type="button" className="workspace-tab-close" aria-label={`关闭 ${tab.title}`} title="关闭标签页"
        onClick={event => { event.stopPropagation(); main.closeWorkspaceTab(tab.key) }}>
        <XIcon size={12} weight="light" aria-hidden="true" />
      </button>
    </div>)}
    {dragTab && createPortal(
      <div ref={ghostRef} className="workspace-tab workspace-tab--floating is-active"
        style={{ left: ghostLeftRef.current, top: ghostTopRef.current, width: ghostWRef.current }}>
        <span className="workspace-tab-title">{dragTab.title}</span>
        <span className="workspace-tab-close" aria-hidden="true"><XIcon size={12} weight="light" /></span>
      </div>,
      document.body
    )}
  </div>
})
