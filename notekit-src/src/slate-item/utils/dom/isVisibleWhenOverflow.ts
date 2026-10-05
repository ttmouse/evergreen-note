export function getClosestOverflowParent(
  element: HTMLElement,
  vals = ['scroll', 'auto']
): HTMLElement | null {
  let parent = element.parentElement
  while (parent) {
    const { overflowY, overflow } = window.getComputedStyle(parent)
    if (vals.includes(overflowY) || vals.includes(overflow)) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

function getAllOverflowParents(
  element: HTMLElement,
  vals = ['scroll', 'auto']
) {
  const parents: HTMLElement[] = []
  let parent = element?.parentElement
  while (parent) {
    const { overflowY, overflow } = window.getComputedStyle(parent)
    if (vals.includes(overflowY) || vals.includes(overflow)) {
      parents.push(parent)
    }
    parent = parent.parentElement
  }
  return parents
}

/**
 * Check if element is visible in scrollable parent
 */
export function isVisibleWhenOverflow(
  el: HTMLElement,
  overflowValues = ['scroll', 'auto']
) {
  const parent = getClosestOverflowParent(el, overflowValues)
  if (!parent) {
    return true
  }
  const rect = el.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  return (
    rect.top >= parentRect.top &&
    rect.left >= parentRect.left &&
    rect.bottom <= parentRect.bottom &&
    rect.right <= parentRect.right
  )
}

/**
 * 一个元素可能有多个overflow的父元素，这个方法用来判断是否在全部父级容器中可见
 * @param el
 * @param overflowValues
 * @returns
 */
export function isAllVisibleWhenOverflow(
  el: HTMLElement,
  overflowValues = ['scroll', 'auto']
) {
  const parents = getAllOverflowParents(el, overflowValues)
  if (parents.length < 1) {
    return true
  }
  const rect = el.getBoundingClientRect()
  return parents.every((parent) => {
    const parentRect = parent.getBoundingClientRect()
    return (
      rect.top >= parentRect.top &&
      rect.left >= parentRect.left &&
      rect.bottom <= parentRect.bottom &&
      rect.right <= parentRect.right
    )
  })
}
