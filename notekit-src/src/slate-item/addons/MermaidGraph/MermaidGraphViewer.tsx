import React from 'react'
import svgPanZoom from 'svg-pan-zoom'
import { Button, IconButton, Tooltip } from '@mui/material'
import { PlusIcon, MinusIcon, ArrowsOutIcon, CornersOutIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import './mermaid-graph.css'

export type MermaidGraphViewerProps = {
  children: React.ReactNode
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  onEdit?: () => void
}

// The same SVG navigation engine used by Mermaid Live Editor.
export function MermaidGraphViewer({ children, isFullscreen, onToggleFullscreen, onEdit }: MermaidGraphViewerProps) {
  const canvas = React.useRef<HTMLDivElement>(null)
  const instance = React.useRef<ReturnType<typeof svgPanZoom>>()
  React.useEffect(() => {
    const el = canvas.current!
    let current: SVGSVGElement | null = null
    const attach = () => {
      const svg = el.querySelector('svg')
      if (svg === current) return
      instance.current?.destroy()
      instance.current = undefined
      current = svg
      if (!svg) return
      svg.style.width = '100%'
      svg.style.height = '100%'
      instance.current = svgPanZoom(svg, {
        fit: true, center: true, minZoom: 0.1, maxZoom: 20,
        zoomScaleSensitivity: 0.25, dblClickZoomEnabled: false,
        // Scrolling a note must continue scrolling the note.
        mouseWheelZoomEnabled: Boolean(isFullscreen),
      })
    }
    const mutation = new MutationObserver(attach)
    mutation.observe(el, { childList: true, subtree: true })
    const resize = new ResizeObserver(() => {
      instance.current?.resize()
      instance.current?.fit()
      instance.current?.center()
    })
    resize.observe(el)
    attach()
    return () => {
      mutation.disconnect()
      resize.disconnect()
      instance.current?.destroy()
      instance.current = undefined
    }
  }, [isFullscreen])

  return <div className={`mermaid-viewer ${isFullscreen ? 'mermaid-viewer-expanded' : ''}`}>
    <div className="mermaid-viewer-toolbar">
      {onEdit && <Button size="small" startIcon={<PencilSimpleIcon size={16} />} onClick={onEdit}>编辑源码</Button>}
      <Tooltip title="放大"><IconButton size="small" aria-label="放大" onClick={() => instance.current?.zoomIn()}><PlusIcon size={18} /></IconButton></Tooltip>
      <Tooltip title="缩小"><IconButton size="small" aria-label="缩小" onClick={() => instance.current?.zoomOut()}><MinusIcon size={18} /></IconButton></Tooltip>
      <Tooltip title="适应窗口"><IconButton size="small" aria-label="适应窗口" onClick={() => { instance.current?.fit(); instance.current?.center() }}><CornersOutIcon size={18} /></IconButton></Tooltip>
      {onToggleFullscreen && <Tooltip title="展开查看"><IconButton size="small" aria-label="展开查看" onClick={onToggleFullscreen}><ArrowsOutIcon size={18} /></IconButton></Tooltip>}
    </div>
    <div ref={canvas} className="mermaid-canvas">{children}</div>
  </div>
}
