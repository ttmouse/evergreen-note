import React from 'react'
import { ElementComponentProps } from '../EditorView/EditorView'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { MermaidGraphElement } from './MermaidGraph'
import { MermaidGraphComp } from './MermaidGraphComp'
import { MermaidGraphViewer } from './MermaidGraphViewer'
import { Editor, Node, Range, ReactEditor, Text, Transforms, useFocused, useReadOnly, useSlateSelector } from '../../slate.inc'
import { useEditor } from '../../hooks/useEditor'
import { ItemDOM } from '../../components/ItemView'
import { useAddons } from '../../hooks/useAddons'
import { Button } from '@mui/material'
import { useMermaidTheme } from './useMermaidTheme'

const SourceEditor = React.lazy(() => import('./MermaidSourceEditor'))

export type MermaidGraphElementProps = {
  value: string
}

export function MermaidGraphElementComp(
  props: ElementComponentProps<MermaidGraphElement>
) {
  const { element } = props
  const { value } = element
  const editor = useEditor()
  const $ = useAddons()
  const [editing, setEditing] = React.useState(false)
  const [preview, setPreview] = React.useState(value)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const host = React.useRef<HTMLDivElement>(null)
  const pointerDown = React.useRef(false)
  const night = useMermaidTheme()
  const focused = useFocused()
  const readOnly = useReadOnly()
  const [entryEdge, setEntryEdge] = React.useState<'start' | 'end'>('start')
  React.useEffect(() => {
    const timer = window.setTimeout(() => setPreview(value), 250)
    return () => window.clearTimeout(timer)
  }, [value])
  const closeIfOutside = () => {
    if (!host.current?.contains(document.activeElement)) setEditing(false)
  }
  React.useEffect(() => {
    if (!editing) return
    let timer: number | undefined
    const down = () => { pointerDown.current = true }
    const up = () => {
      pointerDown.current = false
      // Let mouseup establish the destination caret before changing block height.
      window.clearTimeout(timer)
      timer = window.setTimeout(closeIfOutside, 0)
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    return () => {
      pointerDown.current = false
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
    }
  }, [editing])
  const caretEdge = useSlateSelector(ed => {
    if (!ed.selection || !Range.isCollapsed(ed.selection)) return null
    const { path, offset } = ed.selection.anchor
    const graph = Editor.above(ed, { at: path, match: n => $.mermaidGraph.verify(n) && n.iky === element.iky })
    if (graph) return 'start'
    const node = Node.get(ed, path)
    if ($.mermaidGraph.verify(node) && node.iky === element.iky) return 'start'
    // Item navigation parks the caret on the empty text beside a void block.
    if (!Text.isText(node) || node.text.replace(/\u200b/g, '') !== '' || offset !== 0) return null
    const parent = Node.parent(ed, path)
    const index = path[path.length - 1]
    const next = parent.children[index + 1]
    const prev = parent.children[index - 1]
    if ($.mermaidGraph.verify(next) && next.iky === element.iky) return 'start'
    if ($.mermaidGraph.verify(prev) && prev.iky === element.iky) return 'end'
    return null
  }, undefined, { deferred: true })

  React.useEffect(() => {
    if (focused && caretEdge && !readOnly) {
      setEntryEdge(caretEdge)
      setEditing(true)
    }
  }, [focused, caretEdge, readOnly])

  const leaveSource = (direction: 'up' | 'down' | 'left' | 'right') => {
    const backward = direction === 'up' || direction === 'left'
    const path = ReactEditor.findPath(editor as any, element)
    if (direction === 'left' || direction === 'right') {
      const point = backward ? Editor.before(editor, path) : Editor.after(editor, path)
      if (point && Text.isText(Node.get(editor, point.path)) && Node.string(Node.get(editor, point.path)).replace(/\u200b/g, '') !== '') {
        setEditing(false)
        Transforms.select(editor, point)
        ReactEditor.focus(editor as any)
        return true
      }
    }
    const current = host.current?.closest('.node')
    const root = ReactEditor.toDOMNode(editor as any, editor as any)
    const nodes = Array.from(root.querySelectorAll('.node')).filter((node): node is ItemDOM =>
      (node as ItemDOM).$editor === editor && !!(node as ItemDOM).$item?.ky &&
      (node as HTMLElement).offsetParent !== null && !node.closest('.inline-content'))
    const index = nodes.indexOf(current as ItemDOM)
    const target = index >= 0 ? nodes[index + (backward ? -1 : 1)] : undefined
    if (!target) return false
    setEditing(false)
    if (backward) editor.itemFocusEnd(target.$item.ky)
    else editor.itemFocus(target.$item.ky)
    return true
  }

  React.useEffect(() => {
    const el = host.current!
    const edit = () => setEditing(true)
    el.addEventListener('mermaid-edit', edit)
    return () => el.removeEventListener('mermaid-edit', edit)
  }, [])

  return (
    <InlineOuterComp
      {...props}
      cssInlineBlock
      noFocusRing
      inner={
        <div ref={host} data-mermaid-block={element.iky} className="mermaid-inline-block"
          onBlurCapture={event => {
            if (editing && !pointerDown.current && !event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setEditing(false)
          }}
          onDoubleClick={event => {
            if (!editing && (event.target as HTMLElement).closest('.mermaid-canvas')) setEditing(true)
          }}>
          {editing ? <div className="mermaid-inline-source" onMouseUp={event => event.stopPropagation()}>
            <div className="mermaid-inline-source-toolbar">
              <span>Mermaid 源码</span>
              <Button size="small" onClick={() => setEditing(false)}>完成编辑</Button>
            </div>
            <div className="mermaid-editor-host" style={{height: Math.min(420, Math.max(140, (value.split('\n').length + 1) * 21 + 24))}}>
              <React.Suspense fallback={<div className="mermaid-loading">正在加载编辑器…</div>}>
                <SourceEditor value={value} night={night} entryEdge={entryEdge}
                  onChange={next => $.mermaidGraph.setSource(element, editor, next)}
                  onExit={leaveSource}
                  onBlur={() => {
                    if (!pointerDown.current) closeIfOutside()
                  }} />
              </React.Suspense>
            </div>
            <div className="mermaid-inline-source-hint">更改自动保存 · 下方实时预览</div>
            <section className="mermaid-inline-preview" aria-label="流程图实时预览"
              onMouseDownCapture={event => event.preventDefault()}
              onMouseDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}>
              <MermaidGraphViewer
                onToggleFullscreen={() => $.mermaidGraph.inlinesBarForm({ element, editor }, false)}>
                <MermaidGraphComp value={preview} keepLastValid onStatus={setPreviewError} />
              </MermaidGraphViewer>
              {previewError && <div role="alert" className="mermaid-preview-error">{previewError}</div>}
            </section>
          </div> : <MermaidGraphViewer
            onToggleFullscreen={() => $.mermaidGraph.inlinesBarForm({ element, editor }, false)}
            onEdit={() => setEditing(true)}
            isFullscreen={false}
          >
            <MermaidGraphComp value={value} />
          </MermaidGraphViewer>}
        </div>
      }
    />
  )
}
