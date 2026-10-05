/**
 * 获取当前元素的所有兄弟节点
 */
export function siblings(element: HTMLElement): HTMLElement[] {
  const parent = element.parentElement;
  if (!parent) {
    return [];
  }
  const children = parent.children;
  const result: HTMLElement[] = [];
  for (const child of children) {
    if (child !== element) {
      result.push(child as HTMLElement);
    }
  }
  return result;
}