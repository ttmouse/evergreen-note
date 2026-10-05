// Get previous sibling element
export function previous(
  el: HTMLElement,
  selector: string
): HTMLElement | null {
  const prev = el.previousElementSibling as HTMLElement;
  if (!prev) {
    return null;
  }
  if (selector) {
    return prev.matches(selector)
      ? prev
      : previous(prev as HTMLElement, selector);
  }
  return prev;
}
