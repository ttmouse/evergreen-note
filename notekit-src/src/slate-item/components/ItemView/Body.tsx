import React from 'react'
import {
  EDITOR_INVOKER,
  ElementComponentProps,
} from '../../addons/EditorView/EditorView'
import { nodeStyleTop } from '../../addons/LayoutFactory/default.style'
import { useIsTop } from '../../hooks/useIsTop'
import { useItemLayoutStyle } from '../../hooks/useItemLayoutStyle'
import { Item, ItemNode } from '../../interfaces/item'
import { cls } from '../../styles'
import { ContextEditorInfo } from '../../addons/EditorView/EditorViewContexts'
import { useSlateRef } from '../../hooks/useSlateRef'

const displayNone = cls`display: none;`

export function Body(props: ElementComponentProps<ItemNode>) {
  const { element, children, attributes, item } = props
  const isTop = useIsTop()
  const itemStyle = useItemLayoutStyle()
  const { ref: slateRef, ...restAttrs } = attributes
  const [domRef, mergedRef] = useSlateRef(slateRef)
  const editorInfo = React.useContext(ContextEditorInfo)

  if (
    item.foldup &&
    (!isTop || editorInfo.props.invoker === EDITOR_INVOKER.WHITEBOARD_NODE) &&
    !domRef.current // 在折叠状态下，如果组件未渲染过，直接返回 null
  ) {
    return null
  }

  const cssClass: string[] = []
  if (isTop) {
    cssClass.push(nodeStyleTop.body)
  } else {
    cssClass.push(itemStyle.body)
  }
  cssClass.push('node-body')

  const [c] = element.children
  if (
    (c.children.length === 1 && c.children[0].type !== Item.partTypes.outer) ||
    element.foldup
  ) {
    cssClass.push(displayNone)
  }

  return (
    <main
      className={cssClass.join(' ')}
      {...(restAttrs as any)}
      ref={mergedRef}
    >
      {children}
    </main>
  )
}
