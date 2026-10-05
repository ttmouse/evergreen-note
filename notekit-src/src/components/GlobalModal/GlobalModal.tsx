import React, { createContext, useContext, useState } from 'react'
import Backdrop from '@mui/material/Backdrop'
import Box from '@mui/material/Box'
import Modal from '@mui/material/Modal'
import Fade from '@mui/material/Fade'
import { cls } from '../../slate-item/styles'

const modalStyle = cls`
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  margin: 4px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
`

export interface GlobalModalContent {
  type: 'image'
  src: string
  alt?: string
}

interface GlobalModalContextType {
  showModal: (content: GlobalModalContent) => void
  hideModal: () => void
  isOpen: boolean
  content: GlobalModalContent | null
}

const GlobalModalContext = createContext<GlobalModalContextType | null>(null)

export function useGlobalModal() {
  const context = useContext(GlobalModalContext)
  if (!context) {
    throw new Error('useGlobalModal must be used within a GlobalModalProvider')
  }
  return context
}

// 全局变量存储 Modal 控制函数
let globalModalControl: GlobalModalContextType | null = null

// 全局函数用于在任何地方调用 Modal
export function showGlobalImageModal(src: string, alt?: string) {
  if (globalModalControl) {
    globalModalControl.showModal({ type: 'image', src, alt })
  } else {
    console.warn('Global modal not initialized yet')
  }
}

export function hideGlobalModal() {
  if (globalModalControl) {
    globalModalControl.hideModal()
  }
}

export function GlobalModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState<GlobalModalContent | null>(null)

  const showModal = (content: GlobalModalContent) => {
    setContent(content)
    setIsOpen(true)
  }

  const hideModal = () => {
    setIsOpen(false)
    setContent(null)
  }

  const handleModalClick = () => {
    hideModal()
  }

  const contextValue: GlobalModalContextType = {
    showModal,
    hideModal,
    isOpen,
    content,
  }

  // 将控制函数存储到全局变量
  React.useEffect(() => {
    globalModalControl = contextValue
    return () => {
      globalModalControl = null
    }
  }, [contextValue])

  const renderContent = () => {
    if (!content) return null

    switch (content.type) {
      case 'image':
        return (
          <img
            src={content.src}
            alt={content.alt}
            style={{
              maxWidth: 'calc(100vw - 8px)',
              maxHeight: 'calc(100vh - 8px)',
              objectFit: 'contain',
            }}
          />
        )
      default:
        return null
    }
  }

  return (
    <GlobalModalContext.Provider value={contextValue}>
      {children}
      <Modal
        aria-labelledby="global-modal-title"
        aria-describedby="global-modal-description"
        open={isOpen}
        onClose={hideModal}
        closeAfterTransition
        BackdropComponent={Backdrop}
        onClick={handleModalClick}
        disableScrollLock={true}
        disableEnforceFocus={true}
        disableAutoFocus={true}
        disableRestoreFocus={true}
        BackdropProps={{
          timeout: 500,
        }}
      >
        <Fade in={isOpen}>
          <Box className={modalStyle}>
            {renderContent()}
          </Box>
        </Fade>
      </Modal>
    </GlobalModalContext.Provider>
  )
}
