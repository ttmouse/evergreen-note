import React from 'react'
import type { GraphData } from './GraphDataIndex'
import { useAddons } from '../../hooks/useAddons'
import { cls } from '../../styles'
import { PartOuter } from '../../components/UnitView/Parts'
import { EleBody, EleSubitems } from '../../components/Ele'

const Modern = React.lazy(() => import('./NetworkGraphCompSigma').then(module => ({ default: module.NetworkGraphCompSigma })))
const boxStyle = cls`flex-basis: 100%; height: 100%; min-height: 0;`

export function NetworkGraphView({ data }: { data: GraphData }) {
  const { libAdmin, dbDisk } = useAddons()
  const outer = React.useRef<HTMLElement>(null)
  const [height, setHeight] = React.useState<number>()
  React.useLayoutEffect(() => {
    const element = outer.current
    if (!element) return
    const bounds = element.closest('.nui-dialog') || element.closest('.main-area') || element.parentElement!
    const resize = () => {
      const top = element.getBoundingClientRect().top
      const bottom = Math.min(window.innerHeight, bounds.getBoundingClientRect().bottom)
      setHeight(Math.max(100, bottom - top))
    }
    const observer = new ResizeObserver(resize)
    observer.observe(bounds)
    if (bounds.firstElementChild) observer.observe(bounds.firstElementChild)
    window.addEventListener('resize', resize)
    resize()
    return () => { observer.disconnect(); window.removeEventListener('resize', resize) }
  }, [])
  const scope = String(libAdmin.current?.ky || dbDisk.primaryId || 'home')
  return <PartOuter ref={outer} classOuter={boxStyle} styleOuter={{ height, overflow: 'hidden', width: '100%' }}><EleBody classBody={boxStyle}><EleSubitems classChild={boxStyle}>
    <div style={{ position: 'relative', flex: '1 1 100%', minHeight: 0, height: '100%', width: '100%', background: 'var(--nk-canvas)' }}>
      <React.Suspense fallback={<div role="status">正在载入图谱…</div>}>
        <Modern key={scope} scope={scope} data={data} onUnavailable={() => {}} />
      </React.Suspense>
    </div>
  </EleSubitems></EleBody></PartOuter>
}
