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
import './topic-dup.css'

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

  // 主题标题重名的持续状态：重名期间标题显示为危险色并常驻提示，
  // 直到冲突解除（保存拦截见 Topic.addonRun 的 saveItem cover）。
  // 与 Head 的 memo 依赖保持一致，随内容输入实时刷新。
  const dupTopic = React.useMemo(() => {
    if (isInline || isEmpty(item?.topic)) return null
    try {
      const refined = $.topic?.refine?.(Item.headString(item))
      if (!refined) return null
      const existed: any = $.dbMemory?.indexed?.topic?.[refined]
      if (existed && existed.ky !== item.ky) return existed
    } catch {
      return null
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ITEM_CHANGED[item.$id]])

  return (
    <header
      className={`${nodeStyleTop.head} node-head${dupTopic ? ' topic-dup-title' : ''}`}
      {...attributes}
    >
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
    // 草稿主题（⌘N 新建、标题为空、topic 身份未建立）也用大标题渲染，
    // 否则未命名页面没有加粗标题样式；输入标题转正后自然走同一分支。
    if (!isInline && (!isEmpty(item.topic) || (item as any).draft)) {
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
