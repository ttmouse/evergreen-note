export function removeElement(el: HTMLElement) {
  if (el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

export function removeMatchedElement(el: HTMLElement, selector: string) {
  const matched = el.querySelectorAll(selector);
  for (const m of matched) {
    removeElement(m as HTMLElement);
  }
}
