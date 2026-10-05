import React, { useContext, useLayoutEffect, useMemo } from 'react'
import { ContextItem, ItemDOM } from './ItemView'
import { ItemEditor } from '../../addons/EditorFactory/ItemEditor'
import {
  EDITOR_INVOKER,
  ElementComponentProps,
} from '../../addons/EditorView/EditorView'
import {
  ContextLayoutDepth,
  ContextLayoutItem,
  ContextLayoutName,
} from '../../addons/LayoutFactory/LayoutContexts'
import { useAddons } from '../../hooks/useAddons'
import { useIsTop } from '../../hooks/useIsTop'
import { isEmpty } from '../../utils/isEmpty'
import { pub } from '../../utils/pub'
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary'
import { useCreateItemOnClick } from '../../hooks/useCreateItemOnClick'
import {
  ContextEditor,
  ContextEditorInfo,
  ContextEditorInline,
  EditorInfo,
} from '../../addons/EditorView/EditorViewContexts'
import { ContextPkyList } from './ItemViewContexts'
import { NodeTools } from './NodeTools'
import { nodeStyleTop } from '../../addons/LayoutFactory/default.style'
import { Crumbs } from './Crumbs'
import { Item, ItemNode } from '../../interfaces/item'
import { ITEM_CHANGED } from '../../addons/EditorFactory/EditorFactory'
import { LoadedAddons } from '../../../main'
import { App } from '../../engine/App'
import { useSlateRef } from '../../hooks/useSlateRef'
import { useHighlightItem } from '../../hooks/useHighlightItem'
import { useScrollLoad } from '../../notekit-ui/components/ScrollLoad/useScrollLoad'
import { useHookable } from '../../hooks/useApp'
import { ResizeHelper } from '../../notekit-ui/components/Dialog/ResizeHelper'
import { nodeString } from '@/slate-item/utils/string/nodeString'
import { updateItemProxyElement } from '../../utils/dom/createItemProxy'

export type CtxVars = {
  editor: ItemEditor
  editorInfo: EditorInfo
  parentItem: ItemNode
  ctxPkyList: string[]
  isInlineEditor: boolean
  ctxLayout: string
  ctxDepth: number
  isTop: boolean
  addons: LoadedAddons & { app: App }
}

// 避免在 <ItemOuter /> 组件中使用 useState()、useContext()，
// 因为这些函数会在每次渲染时都被调用，会导致组件重新渲染
const ItemOuter = (
  props: ElementComponentProps<ItemNode> & { ctxVars: CtxVars }
) => {
  const { element: item, attributes, children, ctxVars } = props

  const { ref: slateRef, ...restAttrs } = attributes
  const [domRef, mergedRef] = useSlateRef(slateRef)
  const {
    editor,
    isTop,
    editorInfo,
    parentItem,
    ctxPkyList,
    isInlineEditor,
    ctxLayout,
    ctxDepth,
    addons,
  } = ctxVars

  const editorProps = editorInfo.props

  // const editorInfo = useContext(ContextEditorInfo);
  editor.itemCache(item)
  // const parentItem = useContext(ContextItem);
  // useRefresh(item, ref);

  useLayoutEffect(() => {
    if (!domRef.current) {
      return
    }
    updateItemProxyElement(domRef.current as ItemDOM, item, editor, addons.app)
  })

  useLayoutEffect(() => {
    // // FIXED: As the consequence of the animation witnin handleClickBtn(),
    // // the collapsed node-body element could not display while undo
    // if (!item.foldup) {
    //   const nodeBody = ref.current.querySelector('.node-body');
    //   if (nodeBody) {
    //     // foldupAnimation(ref.current, !!item.foldup);
    //   }
    // }

    pub.emit(pub.evt.editorItemMounted, {
      editor,
      item,
      ky: item.ky,
      ref: domRef,
      itemDom: domRef.current as ItemDOM,
      attributes,
    })

    return () => {
      pub.emit(pub.evt.editorItemUnmounted, {
        editor,
        ky: item.ky,
        item,
        ref: domRef,
        itemDom: domRef.current as ItemDOM,
        attributes,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useCreateItemOnClick(domRef)
  // useSaveItem(item);

  // const ctxPkyList = (useContext(ContextPkyList) || []).slice(0);
  const pkyList = React.useMemo(() => {
    if (!ctxPkyList.includes(item.ky)) {
      return [...ctxPkyList, item.ky]
    }
    return ctxPkyList
  }, [ctxPkyList, item.ky])

  const { layoutFactory } = addons
  // const isInlineEditor = useContext(ContextEditorInline);
  // const ctxLayout = useContext(ContextLayoutName);
  // const ctxDepth = useContext(ContextLayoutDepth);
  const selfLayoutDepth = item.layout ? 0 : ctxDepth + 1

  const selfLevelNames = layoutFactory?.getLevelNames(item.layout ?? '')
  const ctxLevelNames = layoutFactory?.getLevelNames(ctxLayout)

  const classes = useMemo(() => {
    const cssClass: string[] = []
    item.selected && cssClass.push('selected')
    cssClass.push('node', 'note-block')

    if (!isTop || editorProps.invoker === EDITOR_INVOKER.WHITEBOARD_NODE) {
      cssClass.push(item.foldup ? 'node-foldup' : '')
    }
    if (isTop) {
      cssClass.push(nodeStyleTop.outer)
      if (!isInlineEditor) {
        cssClass.push('node-top')
      }
    } else {
      const layoutName = item.layout ?? 'default'
      const itemStyle = layoutFactory?.getStyle(layoutName)[0]
      cssClass.push(itemStyle.outer)
    }
    if (item.blockType) {
      cssClass.push(item.blockType as string)
    }
    if (!isEmpty(ctxLayout) && !isTop) {
      cssClass.push(`node-layout-${ctxLayout}-${ctxDepth + 1}`)
    }
    if (typeof item.layout === 'string') {
      cssClass.push(`node-layout-${item.layout}`)
      if (!isEmpty(item.layout)) {
        attributes.layout = item.layout
      }
    }
    if (!isEmpty(item.topic)) {
      cssClass.push('node-topic')
    }
    if (addons.mirrorItem?.isMirror(item)) {
      cssClass.push('node-mirror')
    }
    if (selfLevelNames) {
      cssClass.push(`layout-${selfLevelNames[0]}`)
    }
    if (ctxLevelNames && ctxLevelNames[ctxDepth + 1]) {
      cssClass.push(`layout-${ctxLevelNames[ctxDepth + 1]}`)
    }
    if (item.status && item.status < 0) {
      cssClass.push('node-deleted')
    }
    return cssClass
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ctxLayout,
    isTop,
    item.blockType,
    item.foldup,
    item.layout,
    item.selected,
  ])

  const hookParams = {
    attributes,
    classList: classes,
    item,
    parentItem,
    ctxDepth,
    isTop,
    ctxPkyList: pkyList,
  }

  const classList = useHookable('outerClassList', hookParams, () => classes)

  useHighlightItem(item, domRef)

  // const isBadRecur = useCheckBadRecur(item.ky);
  // if (isBadRecur) {
  //   return <ErrorMsg>Bad recursion for item: {Item.headString(item)}</ErrorMsg>;
  // }

  const sliceIndex = parentItem.$crumbsContext === 'group' ? 1 : 0
  const crumbs = addons.crumbs.getCrumbs(item)?.slice(sliceIndex)
  const crumbsVisible =
    !isEmpty(crumbs) &&
    ((isTop && editorProps.crumbsVisible) ||
      !isEmpty(parentItem.$crumbsContext))

  if (!isEmpty(item.layout)) {
    attributes.layout = item.layout
  }
  const layoutInfo = useHookable('outerLayoutInfo', hookParams, () => {
    const info: any = isTop
      ? {}
      : {
          'ctx-depth': ctxDepth + 1,
        }
    if (!isEmpty(ctxLayout)) {
      info['ctx-layout'] = ctxLayout
    }
    return info
  })

  const newAttrs = useHookable('outerAttributes', hookParams, () => attributes)
  const newChildren = useHookable('outerChildren', hookParams, () => children)

  const canResize = ['kanban'].includes(parentItem.layout)
  const handleResize = (newWidth: number) => {
    const widths = item.widths ?? {}
    item.DoModify({
      widths: {
        ...widths,
        [ctxLayout]: newWidth,
      },
    })
  }
  const outerWidth = item.widths?.[ctxLayout] ?? ''

  const content = (
    <ContextPkyList.Provider value={pkyList}>
      <ContextItem.Provider value={item}>
        <section
          id={item.$id}
          {...newAttrs}
          ref={mergedRef}
          {...layoutInfo}
          absolute-depth={pkyList.length}
          contentEditable={isEmpty(item.lock?.locked) ? undefined : false}
          data-ky={item.ky}
          className={classList.join(' ')}
          style={{ minWidth: outerWidth }}
          key={item.ky}
        >
          {canResize && (
            <ResizeHelper
              onResize={(_, { size }) => handleResize(size.width)}
            />
          )}
          {!crumbsVisible || !crumbs ? null : <Crumbs crumbs={crumbs} />}
          <NodeTools {...props} />
          {newChildren}
        </section>
        {/* </DragComp> */}
      </ContextItem.Provider>
    </ContextPkyList.Provider>
  )

  // console.log(Item.headString(item), '...')

  return (
    <ErrorBoundary>
      {isEmpty(item.layout) ? (
        <ContextLayoutDepth.Provider value={selfLayoutDepth}>
          {content}
        </ContextLayoutDepth.Provider>
      ) : (
        <ContextLayoutItem.Provider value={item}>
          <ContextLayoutName.Provider value={item.layout}>
            <ContextLayoutDepth.Provider value={0}>
              {content}
            </ContextLayoutDepth.Provider>
          </ContextLayoutName.Provider>
        </ContextLayoutItem.Provider>
      )}
    </ErrorBoundary>
  )
}

export const Outer = (props: ElementComponentProps<ItemNode>) => {
  const { element: item } = props

  // 由于需要通过 memo 来优化性能，
  // 而 useContext()、useState() 会导致每次都重新渲染，
  // 所以需要把这些变量提取出来
  const ctxVars: CtxVars = {
    parentItem: useContext(ContextItem),
    editor: useContext(ContextEditor),
    isTop: useIsTop(item),
    editorInfo: useContext(ContextEditorInfo),
    ctxPkyList: (useContext(ContextPkyList) || []).slice(0),
    isInlineEditor: useContext(ContextEditorInline),
    ctxLayout: useContext(ContextLayoutName),
    ctxDepth: useContext(ContextLayoutDepth),
    addons: useAddons(),
  }

  const outer = React.useMemo(() => {
    return <ItemOuter {...props} ctxVars={ctxVars} />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ITEM_CHANGED[item.$id]])

  return outer
}
