import { Graph, Node } from '@antv/x6'
import React from 'react'
import { useAddons } from '../../../hooks/useAddons'
import {
  useWhiteboardTypingMode,
  useDisableMouseWhiteboardNode,
  useAutoResizeWhiteboardNode,
  centerTo,
  zoomTo,
  useUpdateWhiteboardNode,
  setEditable,
  fixSize,
} from './helper'
import { EDITOR_INVOKER } from '../../EditorView/EditorView'
import { getInnerEditor } from '../../EditorView/helper'
import { ReactEditor } from 'slate-react'

export const WhiteboardNode = (props: { node: Node; graph: Graph }) => {
  const { node, graph } = props
  const ref = React.useRef<HTMLDivElement>(null)
  useWhiteboardTypingMode(ref)
  useDisableMouseWhiteboardNode(ref)
  useAutoResizeWhiteboardNode(node, graph, ref)

  React.useEffect(() => {
    // 双击节点时, 让画布缩放回原始大小
    let editor: HTMLDivElement | null = null;
    // ref.current?.addEventListener('mousedown', async (e) => {
    //   if (graph.zoom() < 1 && ref.current?.matches('.x6-node-selected *')) {
    //     // const { x, y } = node.getPosition();
    //     const { x, y } = graph.pageToLocal(e.pageX, e.pageY)
    //     const { width } = node.getSize()
    //     const x2 = x + width / 2
    //     const y2 = y + 100
    //     await centerTo(graph, x, y, x2, y2)
    //     zoomTo(graph, 1)
    //   }
    // })

    ref.current?.addEventListener('wheel', async (e) => {
      if (!ref.current!.matches('.x6-node-focused *')) return;
      if (!editor) editor = ref.current!.querySelector('article.editor-view');
      if (!editor) return;
      if (e.ctrlKey && e.metaKey) return;
      e.stopPropagation();
      e.preventDefault();
      editor.scrollLeft += e.deltaX;
      editor.scrollTop += e.deltaY;
    }, { passive: false });

    fixSize(node, ref)

    // 当节点的文本内容为空时, 按下退格键, 删除节点
    // ref.current?.addEventListener('keydown', (e) => {
    //   if (
    //     e.key === 'Backspace' &&
    //     ref.current?.contains(document.activeElement)
    //   ) {
    //     const editor = getInnerEditor(ref.current);
    //     if (editor.itemHasNothing()) {
    //       graph.removeCell(node);
    //     }
    //   }
    // });

    // setEditable(ref.current!, false);
  }, [graph, node])

  const theItem = useUpdateWhiteboardNode(node)
  const $ = useAddons()
  const EditorComp = $.editorView.createComponent()
  const classNames = [
    'whiteboard-node',
    theItem.whiteboard?.node?.fixedHeight ? 'fixed-height' : '',
  ]

  if (Array.isArray(theItem.referBlock) && theItem.referBlock.length === 1) {
    // Use `.whiteboard-node-mirror` to mark if the node is a mirror node
    classNames.push('whiteboard-node-mirror')
  }

  return (
    <div className={classNames.join(' ')} contentEditable={false} ref={ref}>
      {/** we use a mask layer to control the click and focus behviours */}
      <div className="whiteboard-node-mask" />
      <EditorComp
        item={theItem}
        fromRouter={false}
        invoker={EDITOR_INVOKER.WHITEBOARD_NODE}
        backlink={false}
        topNodeToolVisible
        placeholderForTitle=""
      />
    </div>
  )
}
