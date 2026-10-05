import React from 'react'
import { MemoizedExtra } from './ItemView'
import { ElementComponentProps } from '../../addons/EditorView/EditorView'
import { useIsTop } from '../../hooks/useIsTop'
import { useItemLayoutStyle } from '../../hooks/useItemLayoutStyle'
import { isEmpty } from '../../utils/isEmpty'
import { useItemDOM } from '../../hooks/useItemDOM'
import { useEditorProps } from '../../addons/EditorView/useEditorProps'
import { ContextEditorInline } from '../../addons/EditorView/EditorViewContexts'
import { nodeStyleTop } from '../../addons/LayoutFactory/default.style'
import { useAddons } from '../../hooks/useAddons'
import { LoadedAddons } from '../../../main'
import { ItemStyle } from '../../addons/LayoutFactory/LayoutFactory'
import { ITEM_CHANGED } from '../../addons/EditorFactory/EditorFactory'
import { Item } from '@/slate-item'
import { useSlateRef } from '../../hooks/useSlateRef'

type CtxVars = {
  isInline: boolean
  isTop: boolean
  itemStyle: ItemStyle
  $: LoadedAddons
}

export const TopHead = (props: ElementComponentProps<any>) => {
  const { attributes, children, item } = props
  const isInline = React.useContext(ContextEditorInline)
  const $ = useAddons()

  return (
    <header className={`${nodeStyleTop.head} node-head`} {...attributes}>
      {isInline ? null : (
        <MemoizedExtra item={item} subitems={$.editorView.extraItems} />
      )}
      {children}
    </header>
  )
}

export const ItemHead = (
  props: ElementComponentProps<any> & { ctxVars: CtxVars }
) => {
  const { attributes, children, item, ctxVars } = props
  const { ref: slateRef, ...restAttrs } = attributes
  const [domRef, mergedRef] = useSlateRef(slateRef)
  const { isInline, isTop, itemStyle, $ } = ctxVars

  useItemDOM(domRef)

  const editable = !item.$isTmp && !item.$readonly
  if (!editable) {
    restAttrs.contentEditable = editable
  }

  const p = useEditorProps()

  if (isTop) {
    if (!p.titleVisible) {
      return null
    }
    if (!isInline && !isEmpty(item.topic)) {
      return <TopHead {...props} />
    }
  }

  return (
    <div
      className={[itemStyle.head, 'node-head'].join(' ')}
      {...(restAttrs as any)}
      ref={mergedRef}
    >
      <MemoizedExtra item={item} subitems={$.editorView.extraItems} />
      {children}
    </div>
  )
}

export const Head = (props: ElementComponentProps<any>) => {
  const { item } = props
  const isInline = React.useContext(ContextEditorInline)
  const isTop = useIsTop()
  const itemStyle = useItemLayoutStyle()
  const $ = useAddons()
  /*
  For the reason of performance, we use useMemo() to memoize the <ItemHead /> component.
  and lift the context variable out of the <ItemHead /> component to avoid re-rendering.
  */
  const memo = React.useMemo(() => {
    return <ItemHead {...props} ctxVars={{ isInline, isTop, itemStyle, $ }} />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ITEM_CHANGED[item.$id]])
  return memo
}
