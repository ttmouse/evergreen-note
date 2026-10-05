import React from 'react'
import { ContextItem } from './ItemView'
import { ElementComponentProps } from '../../addons/EditorView/EditorView'
import { useAddons } from '../../hooks/useAddons'
import { useItemLayoutStyle } from '../../hooks/useItemLayoutStyle'
import { useHideEmptyNodeBtn } from '../../hooks/useHideEmptyNodeBtn'
import { useSlateRef } from '../../hooks/useSlateRef'
import { appendStyle } from '../../utils/dom/appendStyle'
import { isEmpty } from '../../utils/isEmpty'

appendStyle(`
  .node-empty-text > .node-head .node-text {
    position: relative;
  }
  .node-empty-text > .node-head .node-text::before {
    position: absolute;
    left: 0;
    color: var(--placeholder);
    content: attr(placeholder);
  }
  /* IME 组合输入期间占位符不隐藏，会和组合串叠成两行（空标题草稿打字时必现）。
     本仓 Slate 0.126 无 data-slate-composed 标记，用组合事件在节点上切类名。 */
  .node-empty-text.ime-composing > .node-head .node-text::before {
    content: none;
  }
`)

// compositionstart/end 捕获阶段全局监听一次，给组合所在节点挂 ime-composing 类
if (typeof document !== 'undefined' && !(window as any).__imeComposingHook) {
  ;(window as any).__imeComposingHook = true
  const toggle = (e: Event, on: boolean) => {
    const node = (e.target as HTMLElement)?.closest?.('.node-empty-text')
    node?.classList.toggle('ime-composing', on)
  }
  document.addEventListener('compositionstart', (e) => toggle(e, true), true)
  document.addEventListener('compositionend', (e) => toggle(e, false), true)
}

export const Text = (props: ElementComponentProps<any>) => {
  const { children, attributes, element, item } = props

  const { ref: slateRef, ...restAttrs } = attributes

  const [domRef, mergedRef] = useSlateRef(slateRef)

  useHideEmptyNodeBtn(domRef, element)

  // useWhenItemActive(
  //   ref,
  //   () => {
  //     const classList = ref.current.closest('.node')?.classList
  //     if (classList?.contains('node-active') === false) {
  //       pub.emit(pub.evt.itemFocus, { editor, item })
  //     }
  //     classList?.add('node-active')
  //   },
  //   () => {
  //     const itemDom = ref.current.closest('.node') as HTMLElement
  //     const { classList } = itemDom
  //     if (classList?.contains('node-active')) {
  //       pub.emit(pub.evt.itemBlur, { editor, item, itemDom })
  //     }
  //     classList?.remove('node-active')
  //   }
  // )

  const itemStyle = useItemLayoutStyle()
  const { router } = useAddons()
  // 点击反向链接的主题标题, 跳到该主题页面
  const handleClick = () => {
    if (item.$groupKy) {
      router.to({ ky: item.$groupKy })
    }
  }

  const classList = [itemStyle.text, 'node-text']

  const attrs: any = {
    ...restAttrs,
    ref: mergedRef,
  }

  if (!isEmpty(item.placeholder)) {
    attrs.placeholder = item.placeholder || (item as any).$placeholder
  }

  return (
    <div className={classList.join(' ')} onMouseUp={handleClick} {...attrs}>
      {children}
    </div>
  )
}
