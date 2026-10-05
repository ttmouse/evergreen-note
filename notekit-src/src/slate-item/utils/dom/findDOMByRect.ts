import { isVisible } from './isVisible';

export function getCenterOfRect(rect: DOMRect): DOMPoint {
  return new DOMPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

export function calcDistance(point1: DOMPoint, point2: DOMPoint): number {
  return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}

export function calcDistanceOfRect(rect1: DOMRect, rect2: DOMRect): number {
  const point1 = getCenterOfRect(rect1);
  const point2 = getCenterOfRect(rect2);
  return calcDistance(point1, point2);
}

/**
 * Find the DOM element below the given element according to the given selector and their offset.
 */
export function findDOMBelow(
  element: HTMLElement,
  selector: string,
  parent: HTMLElement = document.body
): HTMLElement | null {
  const rect = element.getBoundingClientRect();
  let found: HTMLElement | null = null;
  let distance = Infinity;
  for (const ele of parent.querySelectorAll(selector)) {
    if (!isVisible(ele as HTMLElement)) {
      continue;
    }
    const rect2 = ele.getBoundingClientRect();
    const d =
      ((rect2.top - rect.bottom) ** 2 + (rect2.left - rect.left) ** 2) **
      (1 / 2);
    if (
      rect2.top >= rect.bottom &&
      rect2.left < rect.right && //
      rect2.right > rect.left && //
      d < distance &&
      !ele.contains(element) &&
      !element.contains(ele) &&
      ele !== element
    ) {
      found = ele as HTMLElement;
      distance = d;
    }
  }
  return found;
}

export function findDOMAbove(
  element: HTMLElement,
  selector: string,
  parent: HTMLElement = document.body
): HTMLElement | null {
  const rect = element.getBoundingClientRect();
  let found: HTMLElement | null = null;
  let distance = Infinity;
  for (const ele of parent.querySelectorAll(selector)) {
    const rect2 = ele.getBoundingClientRect();
    const d =
      ((rect2.bottom - rect.top) ** 2 + (rect2.left - rect.left) ** 2) **
      (1 / 2);
    if (
      rect2.bottom <= rect.top &&
      rect2.left < rect.right && //
      rect2.right > rect.left && //
      d < distance &&
      !ele.contains(element) &&
      !element.contains(ele) &&
      ele !== element
    ) {
      found = ele as HTMLElement;
      distance = d;
    }
  }
  return found;
}

export function findDOMLeft(
  element: HTMLElement,
  selector: string,
  parent: HTMLElement = document.body
): HTMLElement | null {
  const rect = element.getBoundingClientRect();
  let found: HTMLElement | null = null;
  let distance = Infinity;
  for (const ele of parent.querySelectorAll(selector)) {
    const rect2 = ele.getBoundingClientRect();
    const d =
      ((rect2.top - rect.top) ** 2 + (rect2.right - rect.left) ** 2) ** (1 / 2);
    if (
      rect2.left <= rect.right &&
      rect2.top < rect.bottom && //
      rect2.bottom > rect.top && //
      d < distance &&
      !ele.contains(element) &&
      !element.contains(ele) &&
      ele !== element
    ) {
      found = ele as HTMLElement;
      distance = d;
    }
  }
  return found;
}

export function findDOMRight(
  element: HTMLElement,
  selector: string,
  parent: HTMLElement = document.body
): HTMLElement | null {
  const rect = element.getBoundingClientRect();
  let found: HTMLElement | null = null;
  let distance = Infinity;
  for (const ele of parent.querySelectorAll(selector)) {
    const rect2 = ele.getBoundingClientRect();
    const d =
      ((rect2.top - rect.top) ** 2 + (rect2.left - rect.right) ** 2) ** (1 / 2);
    if (
      rect2.left >= rect.right &&
      rect2.top < rect.bottom && //
      rect2.bottom > rect.top && //
      d < distance &&
      !ele.contains(element) &&
      !element.contains(ele) &&
      ele !== element
    ) {
      found = ele as HTMLElement;
      distance = d;
    }
  }
  return found;
}

export function findDOMAt(
  left: number,
  top: number,
  selector: string
): HTMLElement | null {
  const ele = document.elementFromPoint(left, top);
  let found: HTMLElement | null = null;
  if (ele) {
    found = ele.closest(selector);
    if (!found) {
      found = ele.querySelector(selector);
    }
  }
  return found;
}

export function findDOMBelowCaret(
  selector: string,
  distance = 14
): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel) {
    return null;
  }
  if (sel.rangeCount === 0) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return findDOMAt(rect.left, rect.bottom + distance, selector);
}

export function findDOMAboveCaret(
  selector: string,
  distance = 14
): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel) {
    return null;
  }
  if (sel.rangeCount === 0) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return findDOMAt(rect.left, rect.top - distance, selector);
}
