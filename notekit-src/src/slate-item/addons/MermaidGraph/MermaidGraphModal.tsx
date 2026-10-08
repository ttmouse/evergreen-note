import React from 'react'
import { Button, Dialog, DialogActions, DialogTitle, IconButton } from '@mui/material'
import { XIcon } from '@phosphor-icons/react'
import { MermaidGraphComp } from './MermaidGraphComp'
import { MermaidGraphViewer } from './MermaidGraphViewer'
import { useMermaidTheme } from './useMermaidTheme'
import './mermaid-graph.css'

const SourceEditor = React.lazy(() => import('./MermaidSourceEditor'))

export type MermaidGraphModalProps = {
  value: string
  open: boolean
  onClose: () => void
  onSave?: (value: string) => void
  editing?: boolean
}

export function MermaidGraphModal({ value, open, onClose, onSave, editing = false }: MermaidGraphModalProps) {
  const [draft, setDraft] = React.useState(value)
  const [preview, setPreview] = React.useState(value)
  const [showSource, setShowSource] = React.useState(editing)
  const [error, setError] = React.useState<string | null>(null)
  const night = useMermaidTheme()
  const hasEditableDraft = Boolean(onSave) && (showSource || draft !== value)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setPreview(draft), 250)
    return () => window.clearTimeout(timer)
  }, [draft])
  if (!open) return null
  return <Dialog open fullWidth maxWidth={false} className="app-modal mermaid-dialog"
    aria-labelledby="mermaid-dialog-title" onClose={(_event, reason) => {
      // A click outside the editor should not discard an unfinished draft.
      if (reason === 'escapeKeyDown') onClose()
    }}>
    <DialogTitle id="mermaid-dialog-title" className="mermaid-dialog-title">
      <span>{showSource ? '编辑 Mermaid 流程图' : 'Mermaid 流程图'}</span>
      <span className="mermaid-dialog-title-actions">
        {onSave && <Button size="small" onClick={() => setShowSource(!showSource)}>{showSource ? '只看流程图' : '编辑源码'}</Button>}
        <IconButton size="small" aria-label="关闭流程图" onClick={onClose}><XIcon size={20} /></IconButton>
      </span>
    </DialogTitle>
    <div className={`mermaid-workspace ${showSource ? 'mermaid-workspace-split' : ''}`}>
      {showSource && <section className="mermaid-source-pane" aria-label="Mermaid 源码">
        <div className="mermaid-pane-label">Mermaid 源码</div>
        <div className="mermaid-editor-host">
          <React.Suspense fallback={<div className="mermaid-loading">正在加载编辑器…</div>}>
            <SourceEditor value={draft} onChange={setDraft} night={night} />
          </React.Suspense>
        </div>
      </section>}
      <section className="mermaid-preview-pane" aria-label="流程图预览">
        {showSource && <div className="mermaid-pane-label">实时预览</div>}
        <MermaidGraphViewer isFullscreen><MermaidGraphComp value={preview} keepLastValid onStatus={setError} /></MermaidGraphViewer>
        {error && <div role="alert" className="mermaid-preview-error">{error}</div>}
      </section>
    </div>
    <DialogActions className="mermaid-dialog-actions">
      <span className="mermaid-dialog-hint">{showSource ? '修改后自动预览，保存后写入笔记' : '拖动平移 · 滚轮缩放'}</span>
      <Button onClick={onClose}>{hasEditableDraft ? '取消' : '关闭'}</Button>
      {hasEditableDraft && <Button variant="contained" disabled={draft === value} onClick={() => { onSave?.(draft); onClose() }}>保存</Button>}
    </DialogActions>
  </Dialog>
}
