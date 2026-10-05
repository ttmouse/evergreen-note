import React from 'react'
import { ElementComponentProps } from '../EditorView/EditorView'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { MermaidGraphElement } from './MermaidGraph'
import { MermaidGraphComp } from './MermaidGraphComp'
import { MermaidGraphViewer } from './MermaidGraphViewer'
import { MermaidGraphModal } from './MermaidGraphModal'

export type MermaidGraphElementProps = {
  value: string
}

export function MermaidGraphElementComp(
  props: ElementComponentProps<MermaidGraphElement>
) {
  const { element } = props
  const { value } = element
  const [modalOpen, setModalOpen] = React.useState(false)

  return (
    <InlineOuterComp
      {...props}
      inner={
        <>
          <MermaidGraphViewer
            onToggleFullscreen={() => setModalOpen(true)}
            isFullscreen={false}
          >
            <MermaidGraphComp value={value} />
          </MermaidGraphViewer>
          <MermaidGraphModal
            value={value}
            open={modalOpen}
            onClose={() => setModalOpen(false)}
          />
        </>
      }
    />
  )
}
