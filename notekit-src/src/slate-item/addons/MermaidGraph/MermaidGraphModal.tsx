import React from 'react'
import { createPortal } from 'react-dom'
import { cls, colorBase } from '../../styles'
import { MermaidGraphComp } from './MermaidGraphComp'
import { MermaidGraphViewer } from './MermaidGraphViewer'

export type MermaidGraphModalProps = {
  value: string
  open: boolean
  onClose: () => void
}

const overlayStyle = cls`
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
`

const bodyStyle = cls`
  flex: 1;
  overflow: hidden;
  padding: 12px;
`

const innerStyle = cls`
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 8px;
  overflow: hidden;
`

export function MermaidGraphModal(props: MermaidGraphModalProps) {
  const { value, open, onClose } = props

  React.useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className={overlayStyle}>
      <div className={bodyStyle}>
        <div className={innerStyle}>
          <MermaidGraphViewer
            freePanning
            isFullscreen
            onToggleFullscreen={onClose}
          >
            <MermaidGraphComp value={value} />
          </MermaidGraphViewer>
        </div>
      </div>
    </div>,
    document.body
  )
}
