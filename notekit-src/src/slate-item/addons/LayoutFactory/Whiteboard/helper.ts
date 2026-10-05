/* eslint-disable @typescript-eslint/no-use-before-define */
import { Graph, Node as X6Node, Edge } from '@antv/x6'
import { Snapline } from '@antv/x6-plugin-snapline'
import { Selection } from '@antv/x6-plugin-selection'
import { Scroller } from '@antv/x6-plugin-scroller'
import { Transform } from '@antv/x6-plugin-transform'
import { Keyboard } from '@antv/x6-plugin-keyboard'
import { History } from '@antv/x6-plugin-history'
import { Clipboard } from '@antv/x6-plugin-clipboard'
import { getColor, colorBase } from '../../../styles'
import { WhiteboardProps } from './WhiteboardComp'

import { isEmpty } from 'lodash'
import React from 'react'
import { useAddons } from '../../../hooks/useAddons'
import { Item, ItemNode } from '../../../interfaces/item'
import { pub } from '../../../utils/pub'
import { KyString } from '../../../interfaces/unit'
import { atLater } from '../../../utils/atLater'
import { ReactEditor, Transforms } from '../../../slate.inc'
import { siblings } from '../../../utils/dom/siblings'
import { findRangeFromDomPoint, getInnerEditor } from '../../EditorView/helper'
import { sleep } from '../../../utils/sleep'
import throttle from 'lodash/fp/throttle'
import { ItemWithWhiteboardNode } from './Whiteboard'
import { appendStyle } from '../../../utils/dom/appendStyle'
import { triggerEvent } from '../../../utils/dom/triggerEvent'
import { ItemDOM } from '../../../components/ItemView'
import { browser } from '@/slate-item/utils/browser'
import { $t } from '@/i18n'

export const defaultOptions = {
  node: {
    width: 400,
    height: 42,
  },

  edge: {
    attrs: {
      line: {
        stroke: getColor(colorBase.slate, 400),
        targetMarker: 'classic',
        strokeWidth: 2,
      },
    },
  },

  port: {
    attrs: {
      width: 6,
    },
  },
}

export function edgeHighlight(edge: Edge, graph: Graph) {
  // const edgeView = graph.findViewByCell(edge)!;
  // Highlight the line of the edge
  // edgeView.highlight();
  // edge.attr('line/strokeWidth', defaultOptions.edge.attrs.line.strokeWidth + 1);
  // edge.attr('line/stroke', getColor(colorBase.primary, 400));
}

export function edgeRestore(edge: Edge, graph: Graph) {
  graph.findViewByCell(edge)?.unhighlight()

  // edge.attr('line/strokeWidth', defaultOptions.edge.attrs.line.strokeWidth);
  // edge.attr('line/stroke', defaultOptions.edge.attrs.line.stroke);
}

export function edgePky(ky: KyString) {
  return `${ky}-edges`
}

export function edgeWrapItem(ky: KyString) {
  return Item.newItem({
    ky: edgePky(ky),
    pky: ky,
    ori: 'Whiteboard connections',
    weight: 1,
    foldup: true,
    whiteboard: {
      edgeParent: true,
    },
  } as any)
}

export function loadPlugins(graph: Graph) {
  graph
    // .use(new Export())
    .use(new Snapline())
    .use(
      new Scroller({
        enabled: true,
        pannable: true,
        modifiers: browser.isMobile ? null : ['meta', 'ctrl'],
      })
    )
    .use(
      new Selection({
        enabled: true,
        multiple: true,
        rubberband: true,
        movable: true,
        modifiers: browser.isMobile ? ['meta', 'ctrl'] : null,
        // showNodeSelectionBox: true,
        pointerEvents: 'none',
      })
    )
    .use(
      new Transform({
        resizing: {
          enabled: true,
          minWidth: 1,
          maxWidth: 1000,
          minHeight: 1,
          // maxHeight: 150,
          // orthogonal: true,
          restrict: false,
          preserveAspectRatio: false,
        },
        // rotating: {
        //   enabled: true,
        //   grid: 15,
        // },
      })
    )
    .use(new History())
    .use(new Clipboard())
    .use(new Keyboard())
}

export function handleEvents(graph: Graph, props: WhiteboardProps) {
  const {
    saveNode,
    createNode = (p) => p,
    removeNode,
    removeEdge,
    saveEdge,
  } = props

  // 当点击节点时, 提升它的 z-index
  graph.on('node:click', ({ node }) => {
    node.toFront()
  })

  // 当 graph 的节点或边发生任意变化时，保存该节点或边的数据
  graph.on('node:changed', ({ node }) => {
    if (isChangedEventPrevented()) {
      return
    }
    atLater(() => saveNode?.(node), 'node:changed', 100)
  })

  graph.on('node:removed', ({ node }) => {
    removeNode?.(node)
  })

  graph.on('edge:removed', ({ edge }) => {
    removeEdge?.(edge.toJSON())
  })

  // 当点击画布空白处, 在该位置添加一个节点
  // graph.on('blank:dblclick', ({ x, y, e }) => {
  //   const newNode = graph.addNode(
  //     createNode({
  //       shape: 'custom-react-node',
  //       x: x - defaultOptions.node.width / 2,
  //       y: y - defaultOptions.node.height / 2,
  //     })
  //   );
  //   graph.select(newNode);
  //   saveNode?.(newNode);
  // });

  let x0 = 0
  let y0 = 0
  graph.on('edge:mousedown', (d) => {
    const { x, y } = d.edge.target as any
    x0 = x
    y0 = y
  })

  // 当鼠标从 port 开始拖动, mouseup 解发时, 添加一个节点
  graph.on('edge:mouseup', (d) => {
    if ('x' in d.edge.target && 'y' in d.edge.target) {
      const { x, y } = d.edge.target

      let np = ''
      let nx = 0
      let ny = 0
      const { port } = d.edge.toJSON().source
      const borderWidth = 4
      const w = defaultOptions.port.attrs.width / 2 + borderWidth
      if (port === 'port-top') {
        np = 'port-bottom'
        nx = x - defaultOptions.node.width / 2
        ny = y - defaultOptions.node.height - w
        if (y - y0 < 2) {
          ny -= 60
        }
      } else if (port === 'port-bottom') {
        np = 'port-top'
        nx = x - defaultOptions.node.width / 2
        ny = y + w
        if (y - y0 < 2) {
          ny += 60
        }
      } else if (port === 'port-left') {
        np = 'port-right'
        nx = x - defaultOptions.node.width - w
        ny = y - defaultOptions.node.height / 2
        if (x - x0 < 2) {
          nx -= 60
        }
      } else if (port === 'port-right') {
        np = 'port-left'
        nx = x + w
        ny = y - defaultOptions.node.height / 2
        if (x - x0 < 2) {
          nx += 60
        }
      }

      const newNode = graph.addNode(
        createNode({
          shape: 'custom-react-node',
          x: nx,
          y: ny,
        })
      )
      saveNode?.(newNode)
      graph.addEdge({
        source: d.edge.source,
        target: {
          cell: newNode.id,
          port: np,
        },
        shape: 'edge',
        attrs: defaultOptions.edge.attrs,
      })
    }
  })

  // 当添加了一条边时, 保存它
  graph.on('edge:added', ({ edge }) => {
    saveEdge?.(edge)
  })

  // 当修改了一条边时, 保存它
  graph.on('edge:changed', ({ edge }) => {
    saveEdge?.(edge)
  })

  graph.on('edge:contextmenu', ({ edge }) => {
    if (window.confirm($t`Are you sure you want to delete this edge?`)) {
      edge.remove();
      // removeEdge?.(edge.toJSON())
    }
  });

  let focusEdge: Edge | null = null
  graph.on('edge:click', ({ edge }) => {
    focusEdge = edge
    edgeHighlight(edge, graph)
  })

  graph.on('blank:click', () => {
    if (focusEdge) {
      edgeRestore(focusEdge, graph)
      focusEdge = null
    }
  })

  graph.on('cell:click', ({ cell }) => {
    if (focusEdge && cell !== focusEdge) {
      edgeRestore(focusEdge, graph)
      focusEdge = null
    }
  })

  graph.on('edge:move', ({ edge }) => {
    console.log(edge)
  })

  // 当鼠标经过 edge 时, 加粗它
  graph.on('edge:mouseenter', ({ edge }) => {
    edgeHighlight(edge, graph)
  })

  // 当鼠标离开 edge 时, 恢复它
  graph.on('edge:mouseleave', ({ edge }) => {
    if (!focusEdge || focusEdge !== edge) {
      edgeRestore(edge, graph)
    }
  })

  // 允许拖动箭头
  graph.on('edge:mouseenter', ({ cell }) => {
    cell.addTools([
      {
        name: 'target-arrowhead',
        args: {
          attrs: {
            fill: `var(--cl-slate-500)`,
          },
        },
      },
    ])
  })

  graph.on('edge:mouseleave', ({ cell }) => {
    cell.removeTools()
  })

  // graph.on('node:mouseenter', ({ node }) => {
  //   graph.createTransformWidget(node);
  // });
  // graph.on('node:mouseleave', ({ node }) => {
  //   graph.clearTransformWidgets();
  // });
}

export function isGraphTarget(e: Event) {
  const target = e.target as HTMLElement
  return target && target.classList.contains('x6-graph-scroller')
}

export function handleHotkeys(graph: Graph, props: WhiteboardProps) {
  const { saveNode, saveEdge } = props
  graph.bindKey(['meta+c', 'ctrl+c'], (e) => {
    if (!isGraphTarget(e)) {
      return
    }
    const cells = graph.getSelectedCells()
    if (cells.length) {
      graph.copy(cells)
    }
    return false
  })
  graph.bindKey(['meta+x', 'ctrl+x'], (e) => {
    if (!isGraphTarget(e)) {
      return
    }
    const cells = graph.getSelectedCells()
    if (cells.length) {
      graph.cut(cells)
    }
    return false
  })
  graph.bindKey(['meta+v', 'ctrl+v'], (e) => {
    if (!isGraphTarget(e)) {
      return
    }
    if (!graph.isClipboardEmpty()) {
      const cells = graph.paste({ offset: 32 })
      graph.cleanSelection()
      graph.select(cells)
    }
    return false
  })

  // select all
  graph.bindKey(['meta+a', 'ctrl+a'], (e) => {
    e.preventDefault()
    if (!isGraphTarget(e)) {
      return
    }
    const nodes = graph.getNodes()
    if (nodes) {
      graph.select(nodes)
    }
  })

  // delete
  graph.bindKey('backspace', (e) => {
    if (!isGraphTarget(e)) {
      return
    }

    // antv x6 在全选删除时, 反应太慢了, 所以这里先 DOM 层面隐藏掉
    const selector =
      ':scope > svg > .x6-graph-svg-viewport > .x6-graph-svg-stage > .x6-node-selected'
    graph.container.querySelectorAll(selector).forEach((el) => {
      Object.assign((el as HTMLElement).style, {
        display: 'none',
      })
    })

    const cells = graph.getSelectedCells()
    if (cells.length) {
      graph.removeCells(cells)
    }
  })

  // zoom
  graph.bindKey(['ctrl+1', 'meta+1'], (e) => {
    if (!isGraphTarget(e)) {
      return
    }
    const zoom = graph.zoom()
    if (zoom < 1.5) {
      graph.zoom(0.1)
    }
  })
  graph.bindKey(['ctrl+2', 'meta+2'], (e) => {
    if (!isGraphTarget(e)) {
      return
    }
    const zoom = graph.zoom()
    if (zoom > 0.5) {
      graph.zoom(-0.1)
    }
  })
}

/**
 * 让 Whiteboard 节点中的大纲节点进入编辑模式,
 * 协调 x6 的拖动操作与Focus冲突, 避免大纲节点因 x6 的事件处理而失焦
 * @param ref 指向 `.whiteboard-node` 的 DOM 元素
 */
export const useWhiteboardTypingMode = (
  ref: React.RefObject<HTMLDivElement>
) => {
  React.useEffect(() => {
    const el = ref.current as HTMLElement
    const x6el = el.closest('.x6-node')! as HTMLElement
    // const editor = getInnerEditor(el)

    let mousedown = 0
    // let mousemove = false
    const handler = async (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLDivElement
      if (el.matches('.x6-node-focused *')) {
        // First, if it is a focused notekit node, do nothing and prevent x6
        e.stopPropagation() // prevent x6 from handling the event
        return
      }
      if (new Date().getTime() - mousedown < 500) { // focus this
        if (!target.matches('.whiteboard-node-mask')) return;

        x6el.classList.add('x6-node-focused')
        siblings(x6el).forEach((x) => x.classList.remove('x6-node-focused'))
      }

      mousedown = new Date().getTime()
    }
    el?.addEventListener('mousedown', handler)
    el?.addEventListener('touchstart', handler)

    // el?.addEventListener('mousemove', () => {
    //   mousemove = mousedown
    // })

    // el?.addEventListener('mouseup', async (e) => {
    //   const target = e.target as HTMLDivElement
    //   if (
    //     !mousemove &&
    //     target.matches('.x6-node-selected .whiteboard-node-mask')
    //   ) {
    //     target.style.display = 'none' // 隐藏掉遮罩层, 以便通过 document.elementFromPoint() 找到页面元素
    //     const htmlEl = document.elementFromPoint(
    //       e.clientX,
    //       e.clientY
    //     ) as HTMLElement

    //     // 找到真正被点击了的编辑器
    //     const { $editor: clickedEditor } = htmlEl.closest('.node') as ItemDOM
    //     const theEditor = clickedEditor ?? editor

    //     const range = findRangeFromDomPoint(
    //       theEditor as any,
    //       htmlEl,
    //       e.clientX,
    //       e.clientY
    //     )
    //     target.style.display = 'block'
    //     if (range) {
    //       await sleep(50)
    //       ReactEditor.focus(theEditor as any)
    //       Transforms.select(theEditor, range)
    //       siblings(x6el).forEach((x) => x.classList.remove('x6-node-focused'))
    //       x6el.classList.add('x6-node-focused')
    //     }
    //   }
    //   mousedown = false
    //   mousemove = false
    // })

    el.addEventListener('editorBlur', () => {
      // 之所以设一个延时，
      // 是因为编辑器的 focus 状态会被 Antv x6 的事件处理影响，
      // 从而导致失焦
      // const sel = window.getSelection()
      // if (!sel || el.contains(sel!.anchorNode as Node) === false) {
      x6el.classList.remove('x6-node-focused')
      // }
    })
  }, [ref])
}

export function centerNode(node: X6Node, graph: Graph) {
  const { x, y } = node.getPosition()
  const { width, height } = node.getSize()
  const x2 = x + width / 2
  const y2 = y + height / 2
  graph.centerPoint(x2, y2)
}

// 这个函数用来修正节点的高度，使其与其内容的高度相匹配
// 函数参数 node 是要修正的节点，ref 是该节点对应的 React 组件的引用
// 首先获取节点内容的 DOM，计算出其高度并加上 padding，得到新的高度值 newHeight
// 然后获取节点当前的大小 size，如果新的高度值不等于当前值，则调用节点的 resize 方法修改节点大小
export function fixSize(node: X6Node, ref: React.RefObject<HTMLDivElement>) {
  const editorDom = ref.current!.querySelector(
    ':scope > .editor-view > .node-body > .node-child > .node-top'
  )!
  const rect = editorDom.getBoundingClientRect()
  const padding = 0 // paddingTop + paddingBottom = 16
  const newHeight = Math.min(rect.height + padding, (visualViewport?.height ?? 1080) * .6)
  const size = node.getSize()
  if (newHeight !== size.height) {
    node.resize(size.width, newHeight)
  }
}

/**
 * 当大纲节点的 item 内容更新时, 自动调整对应的 whiteboard node 的宽与高
 * @param node
 * @param ref
 */
let resizing = 0
export function useAutoResizeWhiteboardNode(
  node: X6Node,
  graph: Graph,
  ref: React.RefObject<HTMLDivElement>
) {
  const $ = useAddons()
  React.useEffect(() => {
    const theItem = node.getData() as ItemWithWhiteboardNode

    graph.on('node:resizing', ({ node: n }) => {
      const view = n.findView(graph)!
      resizing = Date.now()
    })

    graph.on('node:resized', fixSize)

    pub.on(pub.evt.itemChanged, ({ originalData, newer }) => {
      if (Date.now() - resizing < 1000) {
        return
      }
      if (
        originalData.ky === theItem.ky ||
        $.crumbs.getPath(originalData.ky).includes(theItem.ky) ||
        (Array.isArray(theItem.referBlock) &&
          (theItem.referBlock.includes(originalData.ky) ||
            $.crumbs
              .getPath(originalData.ky)
              .some((ky) => theItem.referBlock!.includes(ky))))
      ) {
        if (!Item.isNormalStatus(newer)) {
          graph.removeCell(node)
          return
        }
        atLater(() => {
          fixSize(node, ref)
          if(new Date().getTime() - (theItem.aiAssistant?.question ?? 0) <= 60000) centerNode(node, graph)
        }, `whiteboard-resize-${theItem.ky}`, 10)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useDisableMouseWhiteboardNode(
  ref: React.RefObject<HTMLDivElement>
) {
  React.useEffect(() => {
    ref.current?.addEventListener('mousedown', (e) => {
      const el = e.target as HTMLElement
      if (el.matches('.node-btn, .node-btn *')) {
        e.stopPropagation()
      }
    })
  }, [ref])
}

export function useEnabledTrackpadNatualScrolling(
  ref: React.RefObject<HTMLDivElement>
) {
  const el = ref.current as HTMLElement
  const scroller = el.closest('.x6-graph-scroller')
  if (scroller) {
    scroller.addEventListener("wheel", (event: Event) => {
      event.preventDefault(); // Prevent default scrolling behavior
      if ((event as WheelEvent).ctrlKey || (event as WheelEvent).metaKey) return;
      scroller.scrollLeft += (event as WheelEvent).deltaX; // Horizontal scrolling
      scroller.scrollTop += (event as WheelEvent).deltaY; // Vertical scrolling
    }, { passive: false });
  }
}

export const setNodeData = (node: X6Node, data: any) => {
  node.setData(data)
}

/**
 * preventChangedEvent 函数用来防止事件变化，记录时间戳，isChangedEventPrevented 函数用于判断事件是否被防止。
 *
 * 使用方法:
 * 1. 调用 preventChangedEvent 函数防止事件变化。
 * 2. 在需要判断事件是否被防止时调用 isChangedEventPrevented 函数。
 *
 * preventTime 变量记录防止事件的时间戳，isChangedEventPrevented 函数在当前时间和 preventTime 变量的时间差小于 100ms 时，判断事件被防止。
 */
let preventTime = 0
export function preventChangedEvent() {
  preventTime = Date.now()
}
export function isChangedEventPrevented() {
  return Date.now() - preventTime < 100
}

// 当大纲节点的 item 更新时, 将对应的 whiteboard node 中的 data 也更新
export const useUpdateWhiteboardNode = (
  node: X6Node
): ItemWithWhiteboardNode => {
  const nodeData = node.getData()
  const updatedRef = React.useRef(nodeData.updated)
  React.useEffect(() => {
    pub.on(pub.evt.editorNormalized, (_, entry) => {
      const [item] = entry
      if (nodeData.ky === item.ky) {
        updatedRef.current = new Date().getTime()

        // 当 Slate Editor 编辑一个 item 时，X6 并不能自动接收到这个 item 的更新，
        // 于是在 X6 中的节点组件更新时使用的是旧数据，
        // 所以这里手动更新一下
        preventChangedEvent() // 用于阻止 node:changed 的事件处理，避免坏循环
        setNodeData(node, item)
      }
    })
  }, [node, nodeData.ky])
  const $ = useAddons()
  return React.useMemo(() => {
    const theItem = $.dbMemory.getItem(nodeData.ky, { isRecur: true })
    return isEmpty(theItem) ? nodeData : theItem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedRef.current])
}

const portAttrs = {
  circle: {
    r: defaultOptions.port.attrs.width,
    magnet: true,
    stroke: '#31d0c6',
    fill: '#fff',
    strokeWidth: 1,
  },
}

export const ports = {
  groups: {
    top: {
      position: 'top',
      attrs: portAttrs,
    },
    right: {
      position: 'right',
      attrs: portAttrs,
    },
    bottom: {
      position: 'bottom',
      attrs: portAttrs,
    },
    left: {
      position: 'left',
      attrs: portAttrs,
    },
  },
  items: [
    { id: 'port-top', group: 'top' },
    { id: 'port-right', group: 'right' },
    { id: 'port-bottom', group: 'bottom' },
    { id: 'port-left', group: 'left' },
  ],
}

export function itemToWhiteboardNode(item: ItemNode) {
  const meta = item.whiteboard?.node ?? {}
  return {
    id: item.ky,
    shape: 'custom-react-node',
    x: meta.position?.x ?? 0,
    y: meta.position?.y ?? 0,
    width: meta.size?.width ?? 100,
    height: meta.size?.height ?? 40,
    zIndex: meta.zIndex ?? 0,
    ports,
    data: item,
  }
}

export function itemToWhiteboardEdge(item: ItemNode) {
  const meta = item.whiteboard?.edge ?? {}
  return {
    id: item.ky,
    source: meta.source,
    target: meta.target,
    data: item,
    // connector: { name: 'smooth' },
    attrs: defaultOptions.edge?.attrs ?? {},
    labels: meta.labels ?? [],
  }
}

export function getNodes(item: ItemNode) {
  return ((item.subitems as ItemNode[]) ?? [])
    .filter((one) => !one.whiteboard?.edgeParent)
    .map(itemToWhiteboardNode)
}

export function getEdges(item: ItemNode) {
  const edPky = edgePky(item.ky)
  const edgeParent = item.subitems?.find((one) => one.ky === edPky) as ItemNode
  return (edgeParent?.subitems as ItemNode[])
    ?.filter((one) => one.whiteboard?.edge)
    .map(itemToWhiteboardEdge)
}

export function animate(
  from: number,
  to: number,
  step: number,
  callback: (value: number) => void,
  duration = 1000 / 60
) {
  if (from === to) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const s = from > to ? -1 : 1
    let current = from
    const timer = setInterval(() => {
      current += step * s
      callback(current)
      if (current * s > to * s) {
        clearInterval(timer)
        resolve(true)
      }
    }, duration)
  })
}

export async function centerTo(
  graph: Graph,
  x: number,
  y: number,
  toX: number,
  toY: number
) {
  let xc = x
  let yc = y
  animate(x, toX, 10, (value) => {
    graph.centerPoint(value, yc)
    xc = value
  })
  await animate(y, toY, 10, (value) => {
    graph.centerPoint(xc, value)
    yc = value
  })
}

export function zoomTo(graph: Graph, targetZoom: number) {
  return animate(graph.zoom(), targetZoom, 0.03, (value) => {
    graph.zoomTo(value)
  })
}

export function setEditable(dom: HTMLElement, status: boolean) {
  // 将节点内的编辑器的 contenteditable 属性设置为 false
  // 以避免用户在框选节点的时候, 误选中节点内的文本
  dom.querySelectorAll('[contenteditable]')?.forEach((el) => {
    el.setAttribute('contenteditable', status.toString())
    el.classList.add('editable-control')
  })
}

export function zoomIt(graph: Graph, z: number) {
  const z1 = graph.zoom()
  const z2 = z1 + z
  const step = Math.abs(z / 20)
  return animate(
    z1,
    z2,
    step,
    (v) => {
      graph.zoomTo(v)
    },
    5
  )
}

export async function zoomToFit(graph: Graph) {
  // 以下之所以写得这么繁琐, 是为是实现 zoomToFit 的动画效果
  const z0 = graph.zoom()
  graph.zoomToFit()
  const z1 = graph.zoom()
  const z = z1 - z0
  graph.zoomTo(z0)
  return zoomIt(graph, z)
}
