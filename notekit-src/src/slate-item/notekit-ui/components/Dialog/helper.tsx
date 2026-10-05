import { cls } from '../../../styles'
import { BoxInfo, getRect } from '../../../utils/calcSnap'
import { isPartiallyInViewport } from '../../../utils/dom/isElementInViewport'
import { isEmpty } from '../../../utils/isEmpty'

type MovableParams = {
  left: number
  top: number
  deltaX: number
  deltaY: number
}
type MovableOptions = {
  onMove?: (e: MouseEvent, data: MovableParams) => void
  onStart?: (e: MouseEvent, data: MovableParams) => void
  onEnd?: (e: MouseEvent, data: MovableParams) => void
  handle?: string
  axis?: 'x' | 'y' | 'both' | 'none'
  constrain?:
    | BoxInfo
    | HTMLElement
    | typeof window
    | typeof document
    // 函数形式在每次移动时实时计算约束区域，
    // 用于元素尺寸 / 视口随拖动过程变化的场景（如 Dialog 拖动约束）。
    | (() => BoxInfo)
}

const movingStyle = cls`
  user-select: none;
  cursor: grab;
  /*
    Make sure not to use transition,
    if the element is in a transition that affects left or top,
    it will slow down the movement.
  */
  transition: none !important;
`

const getConstrainBox = (
  constrain: NonNullable<MovableOptions['constrain']>
): BoxInfo => {
  if (typeof constrain === 'function') {
    return constrain()
  }
  return constrain as BoxInfo
}

export const movable = (ele: HTMLElement, options: MovableOptions = {}) => {
  const { onMove, onStart, onEnd, axis = 'x', handle = '*' } = options
  let { constrain } = options
  if (constrain instanceof HTMLElement) {
    constrain = getRect(constrain)
  } else if (constrain === window) {
    constrain = {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  } else if (constrain === document) {
    constrain = {
      left: 0,
      top: 0,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }
  }

  let start = false
  let down = false
  let downPos = { x: 0, y: 0 }
  let original = { left: 0, top: 0 }
  // 最近一次（已夹取约束后的）位置，mouseup 时回传给 onEnd，
  // 避免约束生效后 onEnd 又把元素写回未夹取的位置。
  let lastConstrainedPos: { left: number; top: number } | null = null
  const elHandle = ele.querySelector(handle)

  // 获取坐标的辅助函数
  const getCoords = (e: MouseEvent | TouchEvent) => {
    if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
      const touch = e.touches[0] || e.changedTouches[0]
      return { x: touch.clientX, y: touch.clientY }
    }
    return { x: e.clientX, y: e.clientY }
  }

  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    // 检查鼠标按键状态（仅对鼠标事件）
    if (e instanceof MouseEvent && e.buttons !== 1) {
      down = false
    }

    if (down) {
      const coords = getCoords(e)
      const deltaX = coords.x - downPos.x
      const deltaY = coords.y - downPos.y
      let newPos = {} as any
      if (axis === 'x') {
        newPos = {
          left: original.left + deltaX,
          top: original.top,
        }
      } else if (axis === 'y') {
        newPos = {
          left: original.left,
          top: original.top + deltaY,
        }
      } else if (axis === 'both') {
        newPos = {
          left: original.left + deltaX,
          top: original.top + deltaY,
        }
      }

      // calc constrain
      if (constrain) {
        const rect2 = getConstrainBox(constrain)
        // 夹取位置；当约束区域小于元素本身（退化情况）时，
        // 优先保证不小于左/上边界（例如标题栏留在视口内）。
        newPos.left = Math.max(
          rect2.left,
          Math.min(newPos.left, rect2.left + rect2.width - ele.offsetWidth)
        )
        newPos.top = Math.max(
          rect2.top,
          Math.min(newPos.top, rect2.top + rect2.height - ele.offsetHeight)
        )
        lastConstrainedPos = { left: newPos.left, top: newPos.top }
      }

      if (!isEmpty(newPos)) {
        const params = {
          left: newPos.left,
          top: newPos.top,
          deltaX,
          deltaY,
        }
        if (!start) {
          start = true
          onStart?.(e as MouseEvent, params)
          ele.classList.add(movingStyle)
        }
        onMove?.(e as MouseEvent, params)
      }
    }
  }

  const handlePointerUp = (e: MouseEvent | TouchEvent) => {
    down = false
    if (start) {
      start = false
      const coords = getCoords(e)
      const deltaX = coords.x - downPos.x
      const deltaY = coords.y - downPos.y
      // left/top 必须是夹取约束后的最终位置，否则约束中的拖动
      // 在松开鼠标瞬间会被 onEnd 写回越界位置。
      const finalPos = lastConstrainedPos ?? {
        left: original.left + deltaX,
        top: original.top + deltaY,
      }
      lastConstrainedPos = null
      onEnd?.(e as MouseEvent, {
        left: finalPos.left,
        top: finalPos.top,
        deltaX,
        deltaY,
      })
      ele.classList.remove(movingStyle)
    }
    const coords = getCoords(e)
    downPos = { x: coords.x, y: coords.y }
    
    // 动态移除触摸事件监听器
    if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
      window.removeEventListener('touchmove', handlePointerMove as EventListener)
      window.removeEventListener('touchend', handlePointerUp as EventListener)
    }
  }

  const handlePointerDown = (e: MouseEvent | TouchEvent) => {
    const el = e.target as HTMLElement

    if (el.closest(handle) || (elHandle && !isPartiallyInViewport(elHandle))) {
      down = true
      const coords = getCoords(e)
      downPos = { x: coords.x, y: coords.y }
      const rect = ele.getBoundingClientRect()
      if (rect) {
        original = { left: rect.left, top: rect.top }
      }
      // 阻止触摸事件的默认行为，避免页面滚动
      if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
        // e.preventDefault()
        // 动态添加触摸事件监听器
        window.addEventListener('touchmove', handlePointerMove as EventListener, { passive: false })
        window.addEventListener('touchend', handlePointerUp as EventListener)
      }
    }
  }
  
  // Capture on the dialog root so nested title-bar controls/components cannot
  // stop propagation before the draggable handle sees the pointer down.
  ele.addEventListener('mousedown', handlePointerDown as EventListener, true)
  ele.addEventListener('touchstart', handlePointerDown as EventListener, { capture: true, passive: false })
  window.addEventListener('mousemove', handlePointerMove as EventListener)
  window.addEventListener('mouseup', handlePointerUp as EventListener)

  return () => {
    window.removeEventListener('mousemove', handlePointerMove as EventListener)
    window.removeEventListener('mouseup', handlePointerUp as EventListener)
    window.removeEventListener('touchmove', handlePointerMove as EventListener)
    window.removeEventListener('touchend', handlePointerUp as EventListener)
    ele.removeEventListener('mousedown', handlePointerDown as EventListener, true)
    ele.removeEventListener('touchstart', handlePointerDown as EventListener, true)
  }
}
