import React from 'react'
import type { GraphData } from './GraphDataIndex'
import { SigmaGraph } from './SigmaGraph'
import { useAddons } from '../../hooks/useAddons'

export function NetworkGraphCompSigma({ data, scope, onUnavailable }: { data: GraphData; scope: string; onUnavailable: () => void }) {
  const { topic } = useAddons()
  const container = React.useRef<HTMLDivElement>(null)
  const runtime = React.useRef<SigmaGraph>()
  const dataRef = React.useRef(data); dataRef.current = data
  const [filters, setFilters] = React.useState({ leaves: false, isolated: false, query: '', minDegree: 0, local: '', hops: 1 })
  const filtersRef = React.useRef(filters); filtersRef.current = filters
  const [empty, setEmpty] = React.useState(data.nodes.length === 0)
  const [notice, setNotice] = React.useState('')
  React.useEffect(() => {
    let disposed = false
    SigmaGraph.create(container.current!, dataRef.current, id => topic.route(id), scope)
      .then(graph => {
        if (disposed) { graph.kill(); return }
        runtime.current = graph
        graph.update(dataRef.current); graph.filter(filtersRef.current)
        // Read-only diagnostics also let the benchmark verify the shipped engine.
        ;(container.current as any).__networkGraph = graph
      }).catch(error => {
        if (!disposed) { console.warn('WebGL 图谱不可用，切换兼容模式', error); onUnavailable() }
      })
    const status = setInterval(() => {
      if (runtime.current) {
        setEmpty(!runtime.current.graph.order)
        const state = runtime.current.metrics.layoutState
        setNotice(state === 'main-thread-fallback' ? '后台布局不可用，已切换低频兼容布局。' : state === 'layout-error' ? '布局计算失败；已保留当前节点位置。' : '')
      }
    }, 1000)
    return () => { disposed = true; clearInterval(status); runtime.current?.kill(); runtime.current = undefined }
  }, [])
  React.useEffect(() => { runtime.current?.update(data); setEmpty(!data.nodes.length) }, [data])
  React.useEffect(() => { runtime.current?.filter({ ...filters, local: filters.local ? topic.refine(filters.local) : undefined }) }, [filters])
  const inputStyle: React.CSSProperties = { color: 'var(--nk-ink)', background: 'var(--nk-surface)', border: '1px solid var(--nk-line-strong)', padding: '4px 6px', font: 'inherit', verticalAlign: 'middle' }
  const labelStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, height: 28 }
  const checkStyle: React.CSSProperties = { width: 14, height: 14, margin: 0, accentColor: 'var(--nk-ink)' }
  return <>
    <div ref={container} data-network-graph="sigma" style={{ position: 'absolute', inset: 0 }} />
    <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 8, color: 'var(--nk-ink)', background: 'var(--nk-surface)', border: '1px solid var(--nk-line-strong)', fontSize: 12 }}>
      <input aria-label="搜索图谱" placeholder="搜索并高亮" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} style={{ ...inputStyle, width: 130, height: 28, boxSizing: 'border-box' }} />
      <label style={labelStyle}><input type="checkbox" style={checkStyle} checked={filters.leaves} onChange={e => setFilters({ ...filters, leaves: e.target.checked })} /> 显示叶子节点</label>
      <label style={labelStyle}><input type="checkbox" style={checkStyle} checked={filters.isolated} onChange={e => setFilters({ ...filters, isolated: e.target.checked })} /> 显示孤立节点</label>
      <label style={labelStyle}>最小连接数 <input aria-label="最小连接数" type="number" min="0" value={filters.minDegree} onChange={e => setFilters({ ...filters, minDegree: Math.max(0, Number(e.target.value)) })} style={{ ...inputStyle, width: 42, height: 28, boxSizing: 'border-box' }} /></label>
      <input aria-label="局部图谱主题" placeholder="局部图谱：主题名称" value={filters.local} onChange={e => setFilters({ ...filters, local: e.target.value })} style={{ ...inputStyle, width: 160, height: 28, boxSizing: 'border-box' }} />
      <select aria-label="邻域跳数" value={filters.hops} onChange={e => setFilters({ ...filters, hops: Number(e.target.value) })} style={{ ...inputStyle, height: 28, boxSizing: 'border-box' }}>
        <option value="1">1 跳</option><option value="2">2 跳</option><option value="3">3 跳</option>
      </select>
    </div>
    {(empty || notice) && <div role="status" style={{ position: 'absolute', top: '45%', left: 20, right: 20, textAlign: 'center', color: 'var(--nk-muted)', pointerEvents: 'none' }}>{notice || '暂无主题节点'}</div>}
  </>
}
