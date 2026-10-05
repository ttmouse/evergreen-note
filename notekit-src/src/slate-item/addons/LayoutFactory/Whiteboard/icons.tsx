/* eslint-disable promise/no-nesting */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { Tip } from '../../../components/Tip/Tip'
import { EleHead, EleIcon, EleOuter } from '../../../components/Ele'
import { Icon } from '../../../../components/MaterialIcon'
import { cls, preset } from '../../../styles'
import { useItem } from '../../../hooks/useItem'
import { Graph } from '@antv/x6'
import { $t } from '../../../../i18n'
import { animate, zoomIt, zoomToFit } from './helper'
import { sleep } from '../../../utils/sleep'
import { ContextWhiteboard } from './WhiteboardComp'
import { until } from '../../../utils/until'
import { useAwait } from '../../../hooks/useAwait'
import { key2symbol } from '../../Hotkey/helper'

export function useIsWhiteboard() {
  const item = useItem()
  return item.layout === 'whiteboard'
}

const placement = 'left'

export type ToolbarItemProps = {
  graph: Graph
}

export function ZoomPlusIcon(props: ToolbarItemProps) {
  const context = React.useContext(ContextWhiteboard)
  if (!useIsWhiteboard()) {
    return null
  }
  const { graph } = props
  const handleClick = async () => {
    if (graph.zoom() >= 2) {
      return
    }
    await zoomIt(graph, 0.2)
    context.setContext({ ...context, zoom: graph.zoom() })
  }

  return (
    <Tip
      title={`${$t`whiteboard.zoom_in`} (${key2symbol('ctrl +')})}`}
      placement={placement}
    >
      <EleOuter onClick={handleClick}>
        <EleIcon classIcon={cls(preset.icon.basic)}>
          <Icon name="svg_add" size={16} />
        </EleIcon>
      </EleOuter>
    </Tip>
  )
}

export function ZoomMinusIcon(props: ToolbarItemProps) {
  const context = React.useContext(ContextWhiteboard)
  if (!useIsWhiteboard()) {
    return null
  }
  const { graph } = props
  const handleClick = async () => {
    if (graph.zoom() <= 0.2) {
      return
    }
    await zoomIt(graph, -0.2)
    context.setContext({ ...context, zoom: graph.zoom() })
  }

  return (
    <Tip
      title={`${$t`whiteboard.zoom_out`} (${key2symbol('ctrl -')})`}
      placement={placement}
    >
      <EleOuter onClick={handleClick}>
        <EleIcon classIcon={cls(preset.icon.basic)}>
          <Icon name="svg_minus" size={16} />
        </EleIcon>
      </EleOuter>
    </Tip>
  )
}

export function ZoomFitIcon(props: ToolbarItemProps) {
  const context = React.useContext(ContextWhiteboard)
  if (!useIsWhiteboard()) {
    return null
  }
  const { graph } = props
  const handleClick = async () => {
    // 以下之所以写得这么繁琐, 是为是实现 zoomToFit 的动画效果
    await zoomToFit(graph)
    context.setContext({ ...context, zoom: graph.zoom() })
  }

  return (
    <Tip
      title={`${$t`whiteboard.zoom_fit`} (${key2symbol('ctrl 9')})`}
      placement={placement}
    >
      <EleOuter onClick={handleClick}>
        <EleIcon classIcon={cls(preset.icon.basic)}>
          <Icon name="svg_zoom_fit" size={16} />
        </EleIcon>
      </EleOuter>
    </Tip>
  )
}

export function ZoomPercentIcon(props: ToolbarItemProps) {
  const { graph } = props

  const context = React.useContext(ContextWhiteboard)
  const { zoom = 1 } = context
  const z = Math.round(zoom * 100)

  if (!useIsWhiteboard()) {
    return null
  }

  const handleClick = async () => {
    // graph.zoomTo(1);
    await zoomIt(graph, 1 - graph.zoom())
    context.setContext({ ...context, zoom: 1 })
  }

  let title = $t('whiteboard.zoom_current', { zoom: z })
  if (zoom !== 1) {
    title += `, ${$t`whiteboard.zoom_reset`}`
  }

  return (
    <Tip title={`${title} (${key2symbol('ctrl 0')})`} placement={placement}>
      <EleOuter
        onClick={handleClick}
        styleOuter={{
          width: 30,
          height: 30,
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <EleHead styleHead={{ fontSize: 10, cursor: 'pointer' }}>{z}%</EleHead>
      </EleOuter>
    </Tip>
  )
}

export function ZoomHotkey(props: ToolbarItemProps) {
  const { graph } = props
  const context = React.useContext(ContextWhiteboard)

  React.useEffect(() => {
    until(() => graph, 30000).then(() => {
      graph.bindKey(['meta+=', 'ctrl+=', 'meta+4', 'ctrl+4'], () => {
        zoomIt(graph, 0.2).then(() => {
          context.setContext({ ...context, zoom: graph.zoom() })
        })
        return false
      })
      graph.bindKey(['meta+-', 'ctrl+=', 'meta+3', 'ctrl+3'], () => {
        zoomIt(graph, -0.2).then(() => {
          context.setContext({ ...context, zoom: graph.zoom() })
        })

        return false
      })
      graph.bindKey(['meta+0', 'ctrl+0', 'meta+2', 'ctrl+2'], () => {
        zoomIt(graph, 1 - graph.zoom()).then(() => {
          context.setContext({ ...context, zoom: graph.zoom() })
        })
        return false
      })
      graph.bindKey(['meta+9', 'ctrl+9', 'meta+1', 'ctrl+1'], () => {
        zoomToFit(graph).then(() => {
          context.setContext({ ...context, zoom: graph.zoom() })
        })
        return false
      })
    })
  }, [graph])
  return null
}
