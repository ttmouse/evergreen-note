import React from 'react'
import { Graph, Node as X6Node, Edge } from '@antv/x6'
import { handleEvents, handleHotkeys, loadPlugins, useEnabledTrackpadNatualScrolling } from './helper'

import './white-board.less'

export type ContextParams = {
  zoom: number
  setContext: React.Dispatch<React.SetStateAction<ContextParams>>
}

export const ContextWhiteboard = React.createContext<ContextParams>({} as any)

export type WhiteboardProps = {
  saveNode?: (node: X6Node, extra?: Object) => boolean
  saveEdge?: (edge: Edge, extra?: Object) => boolean
  removeNode?: (node: X6Node) => boolean
  removeEdge?: (edge: Edge.Properties) => boolean
  createNode?: (meta: X6Node.Metadata) => X6Node.Metadata
  nodes?: X6Node.Metadata[]
  edges?: Edge.Metadata[]
  canvasHeight?: number
  initialize?: (graph: Graph) => void
}
export function WhiteboardComp(props: WhiteboardProps) {
  const { nodes = [], edges = [], canvasHeight = 500, initialize } = props
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const graph = new Graph({
      container: ref.current!,
      autoResize: true,

      interacting(view) {
        // const sel = window.getSelection();
        // return !!sel && view.container.contains(sel.anchorNode as Node);
        return !view.container.classList.contains('x6-node-focused')
      },

      // highlighting: {
      //   // 当连接桩可以被链接时，在连接桩外围渲染一个 2px 宽的红色矩形框
      //   magnetAvailable: {
      //     name: "stroke",
      //     args: {
      //       padding: 4,
      //       attrs: {
      //         "stroke-width": 2,
      //         stroke: "red",
      //       },
      //     },
      //   },
      // },

      // // 平移
      // panning: {
      //   enabled: true,
      //   modifiers: ['ctrl', 'meta'],
      // },

      // 缩放
      // mousewheel 也支持很多其他的配置，比如修饰键（按下修饰键才能触发相应的行为）、缩放因子(速率)等等，
      // 我们可以通过 [API](https://x6.antv.antgroup.com/zh/docs/api/graph/mousewheel) 了解更多内容。
      mousewheel: {
        enabled: true,
        modifiers: ['ctrl', 'meta'],
        factor: 1.14, // 缩放因子
      },

      // 设置画布背景颜色
      // background: {
      //   color: 'rgba(241, 245, 249, 0.37)',
      // },

      grid: {
        size: 10,
        visible: true,
        type: 'fixedDot', // 'dot' | 'fixedDot' | 'mesh'
        args: {
          color: 'rgba(0, 0, 0, 0.2)', // 网格线/点颜色
          thickness: 1, // 网格线宽度/网格点大小
        },
      },
    })

    graph.fromJSON({
      nodes,
      edges,
    })

    graph.centerContent() // 居中显示
    ;[loadPlugins, handleHotkeys, handleEvents].forEach((fn) =>
      fn(graph, props)
    )

    initialize?.(graph)
    ;(ref.current as any)!.$graph = graph

    useEnabledTrackpadNatualScrolling(ref)

    return () => {
      // graph.dispose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="whiteboard-canvas"
      style={{ height: canvasHeight }}
      ref={ref}
    />
  )
}

export const MemoWhiteBoardComp = React.memo(WhiteboardComp)
