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
     本仓 Slate 0.126 无 data-slate-composed 标记，用组合事件在 body 上切类
     （不能挂在 .node 上——React 重渲染会重置 className 把外加类清掉）。 */
  body.ime-composing .node-empty-text > .node-head .node-text::before {
    content: none;
  }
`)

// compositionstart/end 捕获阶段全局监听一次，组合期间给 body 挂 ime-composing 类
if (typeof document !== 'undefined' && !(window as any).__imeComposingHook) {
  ;(window as any).__imeComposingHook = true
  document.addEventListener('compositionstart', () => document.body.classList.add('ime-composing'), true)
  document.addEventListener('compositionend', () => document.body.classList.remove('ime-composing'), true)
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
