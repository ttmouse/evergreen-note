// Get the index of an element within its parent
export function findDOMIndex(el: HTMLElement, selector = '*') {
  const { parentNode } = el;
  if (!parentNode) {
    return -1;
  }
  const children = parentNode.childNodes;
  for (let i = 0; i < children.length; ) {
    if (children[i] === el) {
      return i;
    }
    if ((children[i] as HTMLElement).matches(selector)) {
      i++;
    }
  }
  return -1;
}

// export function findDOMIndex(el: HTMLElement, selector = '*') {
//   return Array.prototype.indexOf.call(
//     el.parentElement!.querySelectorAll(`:scope > ${selector}`),
//     el
//   );
// }
