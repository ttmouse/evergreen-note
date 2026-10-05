import React from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { cls, colorBase } from '../../styles'

export type MermaidGraphViewerProps = {
  children: React.ReactNode
  className?: string
  freePanning?: boolean
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

const viewerStyle = cls`
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  min-height: 100px;
`

const viewerFullscreenStyle = cls`
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
`

const viewerWrapStyle = cls`
  width: 100% !important;
  height: 100% !important;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const viewerWrapDocStyle = cls`
  width: 100% !important;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const toolbarStyle = cls`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 10;
  background: ${[colorBase.slate, 0]};
  border: 1px solid ${[colorBase.slate, 200]};
  border-radius: 6px;
  padding: 2px;
`

const toolbarBtnStyle = cls`
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  color: ${[colorBase.slate, 700]};
  
  &:hover {
    background: ${[colorBase.slate, 100]};
    color: ${[colorBase.slate, 900]};
  }

  @media (pointer: coarse) {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
`

const separatorStyle = cls`
  width: 1px;
  background: ${[colorBase.slate, 200]};
  margin: 4px 2px;
`

export function MermaidGraphViewer(props: MermaidGraphViewerProps) {
  const { children, className, freePanning, isFullscreen, onToggleFullscreen } =
    props

  return (
    <TransformWrapper
      initialScale={1}
      minScale={0.1}
      maxScale={5}
      centerOnInit
      doubleClick={{ mode: 'reset', step: 0.5 }}
      wheel={
        freePanning
          ? { step: 0.1 }
          : { step: 0.1, activationKeys: ['Control', 'Meta'] }
      }
      panning={{ allowLeftClickPan: true }}
    >
      {({ zoomIn, zoomOut, resetTransform, centerView }) => (
        <div
          className={`${isFullscreen ? viewerFullscreenStyle : viewerStyle} ${className || ''}`}
        >
          <div className={toolbarStyle}>
            <button
              className={toolbarBtnStyle}
              onClick={() => zoomIn(0.2)}
              title="放大"
            >
              +
            </button>
            <button
              className={toolbarBtnStyle}
              onClick={() => zoomOut(0.2)}
              title="缩小"
            >
              −
            </button>
            <div className={separatorStyle} />
            <button
              className={toolbarBtnStyle}
              onClick={() => {
                resetTransform()
                centerView(1)
              }}
              title="重置"
            >
              ⟳
            </button>
            {onToggleFullscreen && (
              <>
                <div className={separatorStyle} />
                <button
                  className={toolbarBtnStyle}
                  onClick={onToggleFullscreen}
                  title={isFullscreen ? '退出全屏' : '全屏查看'}
                >
                  {isFullscreen ? 'x' : '⤢'}
                </button>
              </>
            )}
          </div>
          <TransformComponent
            wrapperClass={isFullscreen ? viewerWrapStyle : viewerWrapDocStyle}
          >
            {children}
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  )
}
