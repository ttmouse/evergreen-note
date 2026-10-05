import { getClosestOverflowParent, isVisibleWhenOverflow } from './isVisibleWhenOverflow'

/**
 *
 * @param element
 * @param container
 * @param distance 与边界还有多少距离时触发滚动
 * @returns
 */
export function scrollIntoView(
  element: HTMLElement,
  container?: HTMLElement,
  distance = 0
): void {
  if (!element) {
    return
  }
  if (!container) {
    container = getClosestOverflowParent(element) ?? document.body
  }
  const rect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  if (rect.top - distance < containerRect.top) {
    container.scrollTop -= containerRect.top - (rect.top - distance)
  } else if (rect.bottom + distance > containerRect.bottom) {
    container.scrollTop += rect.bottom + distance - containerRect.bottom
  }
}

export function scrollIntoViewSmoothly(
  el: HTMLElement,
  container?: HTMLElement,
  checkNeeded = false
): void {
  if (checkNeeded && isVisibleWhenOverflow(el)) {
    return
  }

  container ??= getClosestOverflowParent(el) ?? document.body

  const containerRect = container.getBoundingClientRect()
  const elementRect = el.getBoundingClientRect()

  const offsetTop = elementRect.top - containerRect.top
  const offsetLeft = elementRect.left - containerRect.left

  // 预留的空白
  const space = 5

  container.scrollTo({
    left: offsetLeft + container.scrollLeft - space,
    top: offsetTop + container.scrollTop - space,
    behavior: 'smooth',
  })
}
