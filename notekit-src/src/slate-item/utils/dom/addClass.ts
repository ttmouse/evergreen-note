import { removeClass } from './removeClass';

// Add some className to the element
export function addClass(
  element: HTMLElement | null | undefined,
  className: string,
  timeout?: number // timeout for removeClass
) {
  if (!element) {
    return;
  }
  if (element.classList) {
    element.classList.add(className);
  } else {
    element.className += ` ${className}`;
  }
  if (timeout) {
    setTimeout(() => {
      removeClass(element, className);
    }, timeout);
  }
}
