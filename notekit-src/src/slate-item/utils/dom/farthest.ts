export const farthest = (
  ele: HTMLElement,
  selector: string | ((parent: HTMLElement) => boolean)
) => {
  let parent = ele.parentElement;
  let target: HTMLElement | null = null;
  while (parent) {
    if (typeof selector === 'string') {
      if (parent.matches(selector)) {
        target = parent;
      }
    } else if (selector(parent)) {
      target = parent;
    }
    parent = parent.parentElement;
  }
  return target;
};
