/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { ElementComponentProps } from '../../EditorView/EditorView'
import { ItemDOM, Subitems } from '../../../components/ItemView'
import { useItem } from '../../../hooks/useItem'
import { useSlateRef } from '../../../hooks/useSlateRef'
import {
  ContextParams,
  ContextWhiteboard,
  WhiteboardComp,
} from './WhiteboardComp'
import { Edge, Graph, Node } from '@antv/x6'
import { pick } from '../../../utils/object/pick'
import { useAddons } from '../../../hooks/useAddons'
import { Item } from '../../../interfaces/item'
import { atLater } from '../../../utils/atLater'
import { register, Portal } from '@antv/x6-react-shape'
import {
  getEdges,
  getNodes,
  ports,
  edgePky,
  edgeWrapItem,
  defaultOptions,
  isGraphTarget,
  setNodeData,
} from './helper'
import { useIsTop } from '../../../hooks/useIsTop'
import { ItemWithWhiteboardNode } from './Whiteboard'
import {
  ZoomFitIcon,
  ZoomHotkey,
  ZoomMinusIcon,
  ZoomPercentIcon,
  ZoomPlusIcon,
} from './icons'
import { WhiteboardToolbarComp } from './WhiteboardToolbarComp'
import { WhiteboardNode } from './WhiteboardNode'
import { ItemMap } from '../../DbMemory/DbMemory'
import { deepClone } from '../../../utils/object/deepClone'

const MemoDiagrqamNode = React.memo(WhiteboardNode)

export const ContextWhiteboardLayout = React.createContext(false)

// 可以使用 Portal 模式来渲染 React 组件
// 使得 React 组件已经处于正常的渲染文档树中
// 让组件内部可以获取外部 Context 内容
const X6ReactPortalProvider = Portal.getProvider()

register({
  shape: 'custom-react-node',
  width: defaultOptions.node.width,
  height: defaultOptions.node.height,
  component: MemoDiagrqamNode,
})

const deletedItems: ItemMap = {}

export function WhiteboardCanvasComp(props: ElementComponentProps<any>) {
  const item = useItem()
  const $ = useAddons()
  const isTop = useIsTop()
  const { attributes } = props
  const { ref: slateRef, ...restAttrs } = attributes
  const [domRef, mergedRef] = useSlateRef(slateRef)
  const edPky = edgePky(item.ky)

  const saveNode = React.useCallback((node: Node) => {
    const nodeJson = node.toJSON()
    const theItem = nodeJson.data
    theItem.whiteboard ??= {}
    theItem.whiteboard.node = pick(nodeJson, ['position', 'size', 'zIndex'])
    theItem.status = 1
    $.dbMemory.saveItem(theItem)
    return true
  }, [])

  const createNode = React.useCallback(
    (x6meta: Node.Metadata, itemProps: Partial<UnitPersist> = {}) => {
      const newItem = Item.newItem({
        pky: item.ky,
        ori: '',
        ...itemProps,
      })
      setTimeout(() => {
        const { $editor, $item } = domRef.current?.querySelector(
          `[data-cell-id="${newItem.ky}"] .node-top[data-ky="${newItem.ky}"]`
        ) as ItemDOM
        $editor.itemFocusEnd($item.GetSlPath())
      }, 300)
      return {
        ...x6meta,
        id: newItem.ky,
        ports,
        data: newItem,
      }
    },
    []
  )

  const removeNode = React.useCallback((node: Node) => {
    const nodeJson = node.toJSON()
    setNodeData(node, {
      ...nodeJson,
      status: -1,
    })
    const theItem = {
      ...node.data,
      status: -1,
    }
    theItem.whiteboard ??= {}
    theItem.whiteboard.node = pick(nodeJson, ['position', 'size', 'zIndex'])
    $.dbMemory.saveItem(theItem)

    deletedItems[theItem.ky] = deepClone(theItem)
    $.dbMemory.deleteItem(theItem.ky, { isRecur: true })

    return true
  }, [])

  const saveEdge = React.useCallback((edge: Edge) => {
    atLater(
      () => {
        const edgeJson = edge.toJSON()
        if (!$.dbMemory.itemExist(edPky)) {
          const edgeParent = edgeWrapItem(item.ky)
          ;(edgeParent as ItemWithWhiteboardNode).whiteboard = {
            edgeParent: true,
          }
          $.dbMemory.saveItem(edgeParent)
        }
        const ed = pick(edgeJson, ['source', 'target', 'zIndex', 'labels'])
        if (!ed.target.cell) {
          return
        }
        const label = ed.labels?.[0] ?? ''
        const edgeItem = edgeJson.data ?? Item.newItem({ pky: edPky, ori: '' })
        edgeItem.ky = edgeJson.id
        edgeItem.pky ??= item.ky
        edgeItem.whiteboard ??= {}
        edgeItem.whiteboard.edge = ed
        edgeItem.referText = [ed.source.cell, ed.target.cell]
        edgeItem.leaves = [
          { text: '' },
          $.refer.createElement({ ky: ed.source.cell }),
          { text: ` --${label}--> `, edge: ed },
          $.refer.createElement({ ky: ed.target.cell }),
          { text: '' },
        ]
        $.dbMemory.saveItem(edgeItem)
      },
      `save-edge-${edge.id}`,
      100
    )
    return true
  }, [])

  const removeEdge = React.useCallback((edgeJson: Edge.Properties) => {
    atLater(
      () => {
        $.dbMemory.deleteItem(edgeJson.id!)
      },
      `save-edge-${edgeJson.id}`,
      100
    )
    return true
  }, [])

  const nodes = getNodes(item)
  const edges = getEdges(item)

  const sysbarHeight = 32 // 顶部工具栏高度
  const canvasHeight = !isTop ? 500 : document.body.clientHeight - sysbarHeight

  const initialize = React.useCallback((graph: Graph) => {
    graph.on('edge:click', ({ e, edge }) => {
      const { pageX, pageY } = e
      const labels = edge.getLabels()
      const label = labels[0] ? labels[0].attrs?.label.text : ''
      $.form.popup({
        initialValues: {
          edgeLabel: label,
        },
        subitems: {
          edgeLabel: {
            type: 'text',
            placeholder: 'Label',
            autoFocus: true,
          },
        },
        SnapProps: {
          targetBox: {
            left: pageX,
            top: pageY,
            width: 1,
            height: 1,
          },
          place: ['center', 'bottom-out'],
        },
        onChange(values) {
          edge.setLabels(values.edgeLabel as string)
        },
      })
    })

    graph.on('blank:dblclick', ({ x, y, e }) => {
      if (e.pageX + defaultOptions.node.width > window.innerWidth) {
        graph.centerPoint(x, y)
      }
      const p = graph.localToPage({ x, y })
      $.whiteboard.showDialog({
        createNode,
        saveNode,
        x,
        y,
        pky: item.ky,
        keyword: '',
        graph,
        SnapProps: {
          targetBox: {
            left: p.x,
            top: p.y,
            width: 1,
            height: 1,
          },
          place: ['right-out', 'bottom-out'],
        },
      })
    })

    // graph.zoomToFit({ maxScale: 1 });
    // graph.zoom(-0.02);

    graph.bindKey(['meta+p', 'ctrl+p'], () => {
      $.search.showDialog()
      return false
    })

    // // undo redo
    graph.bindKey(['meta+z', 'ctrl+z'], (e) => {
      if (isGraphTarget(e) && graph.canUndo()) {
        graph.undo()
        graph.getCells().forEach((cell) => {
          if (cell.isNode()) {
            saveNode?.(cell)
          } else if (cell.isEdge()) {
            saveEdge?.(cell)
          }
        })
      }
      return false
    })
    graph.bindKey(['meta+shift+z', 'ctrl+shift+z'], (e) => {
      if (isGraphTarget(e) && graph.canRedo()) {
        graph.redo()
        graph.getCells().forEach((cell) => {
          if (cell.isNode()) {
            saveNode?.(cell)
            // const data = cell.getData();
          } else if (cell.isEdge()) {
            saveEdge?.(cell)
          }
        })
      }
      return false
    })
  }, [])

  const memoWhiteboard = React.useMemo(
    () => (
      <WhiteboardComp
        edges={edges}
        nodes={nodes}
        saveEdge={saveEdge}
        saveNode={saveNode}
        removeNode={removeNode}
        removeEdge={removeEdge}
        createNode={createNode}
        canvasHeight={canvasHeight}
        initialize={initialize}
      />
    ),
    [item.$id]
  )

  return (
    <div
      className="node-subitems node-child whiteboard-wrap"
      {...(restAttrs as any)}
      ref={mergedRef}
    >
      <ContextWhiteboardLayout.Provider value>
        <X6ReactPortalProvider />
        {memoWhiteboard}

        {isTop && (
          <WhiteboardToolbarComp
            subitems={{
              ZoomPercentIcon,
              ZoomPlusIcon,
              ZoomMinusIcon,
              ZoomFitIcon,
              ZoomHotkey,
            }}
          />
        )}
      </ContextWhiteboardLayout.Provider>
    </div>
  )
}

export function WhiteboardCanvas(props: ElementComponentProps<any>) {
  const item = useItem()
  if (item.layout === 'whiteboard') {
    return <WhiteboardCanvasComp {...props} />
  }
  return <Subitems {...props} />
}

export const MemoWhiteboardCanvas = React.memo(WhiteboardCanvas)
