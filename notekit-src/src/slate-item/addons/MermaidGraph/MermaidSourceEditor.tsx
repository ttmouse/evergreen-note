import React from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { initEditor } from './vendor/monacoExtra'

// Bundle the editor and worker locally instead of the wrapper's default CDN.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })
initEditor(monaco)

export default function MermaidSourceEditor({ value, onChange, night, onBlur, entryEdge = 'start', onExit }: {
  value: string; onChange: (value: string) => void; night: boolean; onBlur?: () => void
  entryEdge?: 'start' | 'end'
  onExit?: (direction: 'up' | 'down' | 'left' | 'right') => boolean
}) {
  const blurHandler = React.useRef(onBlur)
  blurHandler.current = onBlur
  const exitHandler = React.useRef(onExit)
  exitHandler.current = onExit
  const subscriptions = React.useRef<monaco.IDisposable[]>([])
  React.useEffect(() => () => subscriptions.current.forEach(subscription => subscription.dispose()), [])
  return <Editor height="100%" language="mermaid" value={value}
    theme={night ? 'mermaid-dark' : 'mermaid'}
    onChange={text => onChange(text ?? '')}
    onMount={editor => {
      if (blurHandler.current) {
        subscriptions.current.push(editor.onDidBlurEditorWidget(() => blurHandler.current?.()))
      }
      if (exitHandler.current) {
        subscriptions.current.push(editor.onKeyDown(event => {
          // Monaco owns editing keys; only hand off unmodified arrows at its boundary.
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.browserEvent.isComposing || !editor.getSelection()?.isEmpty()) return
          const model = editor.getModel()
          const position = editor.getPosition()
          if (!model || !position) return
          const lastLine = model.getLineCount()
          const lastColumn = model.getLineMaxColumn(lastLine)
          const top = editor.getTopForPosition(position.lineNumber, position.column)
          let direction: 'up' | 'down' | 'left' | 'right' | undefined
          if (event.keyCode === monaco.KeyCode.UpArrow && top === editor.getTopForPosition(1, 1)) direction = 'up'
          if (event.keyCode === monaco.KeyCode.DownArrow && top === editor.getTopForPosition(lastLine, lastColumn)) direction = 'down'
          if (event.keyCode === monaco.KeyCode.LeftArrow && position.lineNumber === 1 && position.column === 1) direction = 'left'
          if (event.keyCode === monaco.KeyCode.RightArrow && position.lineNumber === lastLine && position.column === lastColumn) direction = 'right'
          if (direction && exitHandler.current?.(direction)) {
            event.preventDefault()
            event.stopPropagation()
          }
        }))
      }
      const model = editor.getModel()
      if (model && entryEdge === 'end') editor.setPosition({lineNumber: model.getLineCount(), column: model.getLineMaxColumn(model.getLineCount())})
      editor.focus()
    }}
    loading={<div className="mermaid-loading">正在加载编辑器…</div>}
    options={{
      ariaLabel: 'Mermaid 源码编辑器', automaticLayout: true,
      minimap: { enabled: false }, fontSize: 14, tabSize: 2,
      wordWrap: 'on', scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 }, renderLineHighlight: 'line',
      fixedOverflowWidgets: true,
    }} />
}
