export function domSetAttr(el: Element, attr: string, value: string) {
  const val = el.getAttribute(attr) ?? '';
  const arr = val.split(' ').filter((v) => v !== value);
  arr.push(value);
  el.setAttribute(attr, arr.join(' ').trim());
}

export function domUnsetAttr(el: Element, attr: string, value: string) {
  const val = el.getAttribute(attr) ?? '';
  const arr = val.split(' ').filter((v) => v !== value);
  const newVal = arr.join(' ').trim();
  if (newVal.length < 1) {
    el.removeAttribute(attr);
  } else {
    el.setAttribute(attr, `${newVal}`);
  }
}

export function domFindLastVisible(container: HTMLElement, selector: string) {
  let found: HTMLElement | null = null;
  for (const el of container.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) {
      found = el as HTMLElement;
    }
  }
  return found;
}
