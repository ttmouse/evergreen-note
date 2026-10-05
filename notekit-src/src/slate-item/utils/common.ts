import { createRoot, type Root } from 'react-dom/client';

// 同一个容器重复调用 reactRender 时复用已创建的 root：
// createRoot 对同一容器重复调用会告警并丢弃第二次渲染，
// 这里保留旧 ReactDOM.render 的“可重复渲染同一容器”语义。
const roots = new WeakMap<HTMLElement, Root>();

export function reactRender(el: HTMLElement, component: JSX.Element) {
  let root = roots.get(el);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }
  root.render(component);
}
