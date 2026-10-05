// Get style of element
export function getStyle(element: HTMLElement, style: string): string {
  return window.getComputedStyle(element, null).getPropertyValue(style);
}

/**
 * Get the closest scrollable parent of an element
 * @param ele
 * @returns
 */
export const getScrollableParentByCss = (ele: Element) => {
  let parent = ele.parentElement;
  const arr = ['auto', 'scroll'];
  while (parent) {
    if (
      arr.includes(getStyle(parent, 'overflowY')) ||
      arr.includes(getStyle(parent, 'overflow'))
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
};
