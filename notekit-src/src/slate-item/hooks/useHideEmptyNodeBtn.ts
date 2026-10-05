import React from 'react'
import { ItemDOM } from '../components/ItemView'
import { Element, Node } from '../slate.inc'
import { cls } from '../styles'

let appended = false

/**
 * 将无文本的空白节点的小圆点隐藏掉
 * @param ref
 * @param element
 */
export function useHideEmptyNodeBtn(
  ref: React.MutableRefObject<HTMLElement>,
  element: Element
) {
  if (!appended) {
    document.body.classList.add(cls`
      .node-empty-text:not(.node-active):not(.only-child):not(:first-child):not(:last-child) > .node-tools .node-btn {
        opacity: 0;
        transition: 0.3 opacity;
      }

      .node-empty-text > .node-tools .node-btn:hover {
        opacity: 1;
      }
    `)
    appended = true
  }

  React.useEffect(() => {
    const str = Node.string(element)
    const itemDom = ref.current?.closest('.node')! as ItemDOM
    if (str.trim().length < 1 && element.children.length < 2) {
      itemDom.classList.add('node-empty-text')
    } else {
      itemDom.classList.remove('node-empty-text')
    }
  })
}
