import React from 'react';

/**
 * 添加全局CSS样式
 * @param css
 * @param id 
 * @returns 
 */
export function appendStyle(css: string, id?: string) {
  if (/:|\{|\}/.test(css) === false) {
    document.body.classList.add(css);
    return;
  }
  id ??= `style-${Math.random().toString(36).slice(2, 9)}`;
  let dom = document.getElementById(id) as HTMLStyleElement;
  if (!dom) {
    dom = document.createElement('style');
    dom.setAttribute('appended-style', 'true');
    dom.id = id;
    document.head.appendChild(dom);
  }
  dom.innerHTML = css;
}

// export function GlobalStyle(props: { children }) {
//   const { children } = props;
//   const cssString = children?.toString();
//   if (cssString) {
//     appendStyle(cssString);
//   }
//   return null;
// }