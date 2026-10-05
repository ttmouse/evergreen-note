import React from 'react'
import { cls } from '../../../styles'
import { NPart } from '../NPart/NPart'
import { useTopZIndex } from '@/slate-item/hooks/useTopZIndex'
import { browser } from '@/slate-item/utils/browser'
import { atLater } from '@/slate-item/utils/atLater'

const targetStyle = cls`
  *:not(.nui-resize-handle) {
    pointer-events: none;
  }
`

const helperStyle = cls`
  opacity: ${browser.isMobile ? '0.3' : '0'};
  position: absolute;
  transition: opacity 0.2s ease-in-out;

  &:hover {
    opacity: 1;

    ~ * {
      pointer-events: none;
    }
  }
`

const helperStyleX = cls`
  width: ${browser.isMobile ? '10px' : '4px'};
  top: 0px;
  right: 0px;
  height: 100%;
  cursor: ew-resize;
  border-right: ${browser.isMobile ? '6px' : '2px'} solid rgb(170, 170, 255);
`

const helperStyleXY = cls`
  bottom: 0px;
  right: 0px;
  width: ${browser.isMobile ? '3em' : '1em'};
  height: ${browser.isMobile ? '3em' : '1em'};
  cursor: nwse-resize;
  border-right: ${browser.isMobile ? '6px' : '2px'} solid rgb(170, 170, 255);
  border-bottom: ${browser.isMobile ? '6px' : '2px'} solid rgb(170, 170, 255);
`

const rootStyle = cls`
  * {
    user-select: none;
  }

  .${targetStyle} > .nui-resize-handle {
    opacity: 1;
  }
`

type Size = {
  width: number
  height: number
}
export type ResizeParams = { size: Size }
export type ResizeHelperProps = {
  axis?: 'x' | 'y' | 'both'
  onStart?: (e: MouseEvent, params: ResizeParams) => void
  onResize?: (
    e: MouseEvent,
    params: ResizeParams & { dx: number; dy: number }
  ) => void
  onEnd?: (e: MouseEvent, params: ResizeParams) => void
  min?: { width?: number; height?: number }
  max?: { width?: number; height?: number }

  /**
   * Calculate the delta of the size according to the mouse move distance,
   * for example, if the element is centered,
   * when resizing, the width of box will increase by 2 times of the mouse move distance.
   * then delta = (n) => n * 2
   * @param n
   * @returns
   */
  delta?: (n: number) => number
}

const chooseSize = (
  size: Size,
  min?: ResizeHelperProps['min'],
  max?: ResizeHelperProps['max']
) => {
  const nextSize = {} as Size
  if (min?.width && size.width < min.width) {
    nextSize.width = min.width
  }
  if (min?.height && size.height < min.height) {
    nextSize.height = min.height
  }
  if (max?.width && size.width > max.width) {
    nextSize.width = max.width
  }
  if (max?.height && size.height > max.height) {
    nextSize.height = max.height
  }
  return {
    ...size,
    nextSize,
  }
}

let oriSize: Size = {} as any
let newSize: Size = {} as any

export function ResizeHelper(props: ResizeHelperProps) {
  const {
    axis = 'x',
    onStart,
    onResize,
    onEnd,
    min,
    max,
    delta = (n) => n,
  } = props
  const ref = React.useRef<HTMLDivElement>(null)
  useTopZIndex(ref)
  const isDraggingRef = React.useRef(false)
  const startPositionRef = React.useRef({ x: 0, y: 0 })
  const moveListenerAddedRef = React.useRef(false)
  
  // 使用 ref 存储最新的 props，避免闭包问题
  const propsRef = React.useRef({ axis, onStart, onResize, onEnd, min, max, delta })
  React.useEffect(() => {
    propsRef.current = { axis, onStart, onResize, onEnd, min, max, delta }
  }, [axis, onStart, onResize, onEnd, min, max, delta])

  // 使用 ref 存储事件处理函数，这样它们的引用永远不变
  const handlersRef = React.useRef({
    handleMove: (e: any) => {
      if (browser.isMobile) {
        e.preventDefault()
      }
      const clientX = browser.isMobile ? e.touches?.[0]?.clientX ?? e.clientX : e.clientX
      const clientY = browser.isMobile ? e.touches?.[0]?.clientY ?? e.clientY : e.clientY
      // There is a delay for mouseup event in 3-finger-drag operation,
      // so we need to check if the mouse button is still pressed,
      // to avoid the bug that the dialog is still resizing after mouseup.
      if (!browser.isMobile && e.buttons !== 1) {
        isDraggingRef.current = false
        return
      }
      if (!isDraggingRef.current) {
        return
      }
      const { axis, delta, min, max, onResize } = propsRef.current
      const deltaX = delta(clientX - startPositionRef.current.x)
      const deltaY = delta(clientY - startPositionRef.current.y)
      if (axis === 'x') {
        newSize.width = oriSize!.width + deltaX
      } else if (axis === 'y') {
        newSize.height = oriSize!.height + deltaY
      } else {
        newSize = {
          width: oriSize!.width + deltaX,
          height: oriSize!.height + deltaY,
        }
      }

      onResize?.(e, {
        size: {
          dx: deltaX,
          dy: deltaY,
          ...chooseSize({ ...newSize } as Size, min, max),
        },
      } as any)
    },

    handleEnd: (e: any) => {
      isDraggingRef.current = false
      document.body.classList.remove(rootStyle)
      ref.current?.parentElement?.classList.remove(targetStyle)
      const { min, max, onEnd } = propsRef.current
      onEnd?.(e, {
        size: chooseSize(newSize as Size, min, max),
      })

      // 在移动设备上，结束后移除 move 和 end 事件
      if (browser.isMobile && moveListenerAddedRef.current) {
        window.removeEventListener('touchmove', handlersRef.current.handleMove)
        window.removeEventListener('touchend', handlersRef.current.handleEnd)
        moveListenerAddedRef.current = false
      }
    },

    handleStart: (e: any) => {
      if (browser.isMobile) {
        e.preventDefault()
      }
      isDraggingRef.current = true
      const clientX = browser.isMobile ? e.touches?.[0]?.clientX ?? e.clientX : e.clientX
      const clientY = browser.isMobile ? e.touches?.[0]?.clientY ?? e.clientY : e.clientY
      startPositionRef.current = { x: clientX, y: clientY }
      document.body.classList.add(rootStyle)
      const parent = ref.current?.parentElement
      parent?.classList.add(targetStyle)
      const rect = parent?.getBoundingClientRect()
      if (rect) {
        oriSize = {
          width: rect.width,
          height: rect.height,
        }
      }
      const { min, max, onStart } = propsRef.current
      onStart?.(e, {
        size: chooseSize(rect!, min, max),
      })

      // 在移动设备上，只在开始拖拽后才添加 move 和 end 事件（非 passive）
      if (browser.isMobile && !moveListenerAddedRef.current) {
        window.addEventListener('touchmove', handlersRef.current.handleMove, { passive: false })
        window.addEventListener('touchend', handlersRef.current.handleEnd, { passive: false })
        moveListenerAddedRef.current = true
      }
    }
  })

  React.useEffect(() => {
    const currentRef = ref.current
    if (!currentRef) return

    const startEvent = browser.isMobile ? 'touchstart' : 'mousedown'
    const { handleStart, handleMove, handleEnd } = handlersRef.current

    if (browser.isMobile) {
      currentRef.addEventListener(startEvent, handleStart, { passive: false })
    } else {
      currentRef.addEventListener(startEvent, handleStart)
    }
    
    // 在桌面设备上，始终监听 move 和 up 事件
    if (!browser.isMobile) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleEnd)
    }

    return () => {
      currentRef.removeEventListener(startEvent, handleStart)
      if (!browser.isMobile) {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleEnd)
      } else {
        // 清理可能残留的移动设备事件监听器
        if (moveListenerAddedRef.current) {
          window.removeEventListener('touchmove', handleMove)
          window.removeEventListener('touchend', handleEnd)
          moveListenerAddedRef.current = false
        }
      }
    }
  }, []) // 空依赖数组，只在 mount/unmount 时运行

  React.useEffect(() => {
    if (!ref.current) return
    const parent = ref.current.parentElement
    if (!parent) return
    parent.addEventListener('scroll', () => {
      atLater(() => {
        ref.current!.style.top = `${parent.scrollTop}px`
      }, 'resize-helper-scroll')
    })
  }, [])

  return <NPart ref={ref} className={`${helperStyle} ${axis=='both'?helperStyleXY:helperStyleX} nui-resize-handle`} />
}

export function ResizeBox(
  props: { children: any; width: number; height: number } & Omit<
    ResizeHelperProps,
    'setTargetSize'
  >
) {
  const { children, min, max, width, height, onResize, ...rest } = props
  const niceSize = chooseSize({ width, height }, min, max)

  const [size, setSize] = React.useState<Size>(niceSize)

  React.useEffect(() => {
    setSize({ width, height })
  }, [width, height])

  return (
    <NPart
      style={{
        ...size,
        position: 'relative',
        minWidth: min?.width,
        minHeight: min?.height,
        maxWidth: max?.width,
        maxHeight: max?.height,
      }}
    >
      {/* Put ResizeHelper ahead of children, so that we can use the css "~" rule to control some styles */}
      <ResizeHelper
        {...rest}
        min={min}
        max={max}
        onResize={(e, params) => {
          setSize(params.size)
          onResize?.(e, params)
        }}
      />
      {children}
    </NPart>
  )
}
