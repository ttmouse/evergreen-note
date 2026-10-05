/**
 * Remove some className from the element
 * @param element
 * @param className
 * @returns
 */
export function removeClass(
  element: HTMLElement | null | undefined,
  className: string
) {
  if (!element) {
    return;
  }
  if (element.classList) {
    element.classList.remove(className);
  } else {
    element.className = element.className.replace(
      new RegExp(`(^|\\b)${className.split(' ').join('|')}(\\b|$)`, 'gi'),
      ' '
    );
  }
}
