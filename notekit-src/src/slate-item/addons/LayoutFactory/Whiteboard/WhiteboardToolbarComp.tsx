import { Icon } from '@mui/material'
import React from 'react'
import { FeatureItem } from '../../EditorView/EditorView'
import { Graph } from '@antv/x6'
import { cls } from '../../../styles'
import { ContextWhiteboard } from './WhiteboardComp'

export type WhiteboardToolbarProps = {
  subitems: { [k: string]: FeatureItem }
}

export type ContextParams = {
  zoom: number
  setContext: React.Dispatch<React.SetStateAction<ContextParams>>
}

export const ContextWhiteboardToolbar = React.createContext<ContextParams>(
  {} as any
)

const style = cls`
  position: absolute;
  right: 5px;
  top: 60px;
  zIndex: 1000;
  background-color: var(--bg-color);
  border-radius: 4px;
`

export function WhiteboardToolbarComp(props: WhiteboardToolbarProps) {
  const { subitems, ...rest } = props
  const ref = React.useRef<HTMLDivElement>(null)
  const [graph, setGraph] = React.useState<Graph | null>(null)
  React.useEffect(() => {
    const canvasDom = ref.current?.parentElement?.querySelector(
      '.whiteboard-canvas'
    ) as any
    setGraph(canvasDom?.$graph)
  }, [])
  const [context, setContext] = React.useState<ContextParams>({} as any)

  return (
    <ContextWhiteboard.Provider value={{ ...context, setContext }}>
      <div ref={ref} className={style}>
        {Object.entries(subitems).map(([k, Comp]: any) => {
          if (typeof Comp === 'function') {
            return <Comp key={k} graph={graph} {...rest} />
          }
          return <Icon key={k} {...Comp} size={12} />
        })}
      </div>
    </ContextWhiteboard.Provider>
  )
}
