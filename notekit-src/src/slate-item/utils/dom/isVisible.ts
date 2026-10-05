/**
 * Check if a DOM element is visible.
 */
export function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}
