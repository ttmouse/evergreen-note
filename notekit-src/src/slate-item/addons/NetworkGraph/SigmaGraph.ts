import { UndirectedGraph } from 'graphology'
import Sigma from 'sigma'
import { EdgeLineProgram } from 'sigma/rendering'
import iterate from 'graphology-layout-forceatlas2/iterate'
import { graphToByteArrays } from 'graphology-layout-forceatlas2/helpers'
import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2'
import type { GraphData, NetNode, NetEdge } from './GraphDataIndex'
import { readPositions, writePositions, Positions } from './GraphPositions'

type Filters = { leaves: boolean; isolated: boolean; query: string; minDegree: number; local?: string; hops: number }
const defaults: Filters = { leaves: false, isolated: false, query: '', minDegree: 0, hops: 1 }
function seed(id: string, scale: number) {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2
  const radius = scale * (0.1 + Math.sqrt(((Math.imul(hash, 1664525) >>> 0) / 4294967296)) * 0.9)
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/** Rendering is independent of the app, so the benchmark uses the real engine. */
export class SigmaGraph {
  readonly graph = new UndirectedGraph({ allowSelfLoops: false })
  readonly renderer: Sigma
  readonly metrics = { ticks: 0, layoutMs: 0, layoutState: 'idle', worker: false, restored: 0, updates: 0, hoverMs: 0 }
  private filters = { ...defaults }
  private visible = new Set<string>()
  private hovered: string | null = null
  private neighbors = new Set<string>()
  private hoveredEdges = new Set<string>()
  private drag: { id: string; x: number; y: number; moved: boolean } | null = null
  private suppressClickUntil = 0
  private data: GraphData
  private worker?: Worker
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private running = false
  private disposed = false
  private started = 0
  private stableTicks = 0
  private matrices?: { nodes: Float32Array; edges: Float32Array }
  private keys: string[] = []
  private layoutNodes?: Set<string>
  private layoutOffset = { x: 0, y: 0 }
  private settings: ForceAtlas2Settings = {
    linLogMode: false, outboundAttractionDistribution: false, adjustSizes: false,
    edgeWeightInfluence: 1, scalingRatio: 10, strongGravityMode: true,
    gravity: 1, slowDown: 5, barnesHutOptimize: true, barnesHutTheta: 0.6,
  }
  private movingUntil = 0
  private positionDirty = false
  private theme = { node: '#888888', edge: '#dddddd', accent: '#0a84ff', text: '#666666' }
  private resizeObserver: ResizeObserver
  private themeObserver: MutationObserver
  private pageHide = () => this.persist()

  constructor(private container: HTMLElement, data: GraphData, private route: (id: string) => void, private scope: string, positions: Positions = {}) {
    this.data = data
    this.readTheme()
    for (const node of data.nodes) this.addNode(node, positions[node.id])
    for (const edge of data.edges) this.addEdge(edge)
    this.computeVisibility()
    this.renderer = new Sigma(this.graph, container, {
      labelDensity: 0.35, labelGridCellSize: 120, labelRenderedSizeThreshold: 6,
      labelFont: 'system-ui, sans-serif', labelSize: 12, labelColor: { color: this.theme.text },
      hideLabelsOnMove: true, enableEdgeEvents: false, zIndex: false,
      allowInvalidContainer: true,
      itemSizesReference: 'screen', minCameraRatio: 0.02, maxCameraRatio: 20,
      defaultEdgeType: 'line', edgeProgramClasses: { line: EdgeLineProgram },
      nodeReducer: (id, attrs) => ({ ...attrs, hidden: !this.visible.has(id),
        color: id === this.hovered || this.neighbors.has(id) || (!!this.filters.query && String(attrs.label).toLowerCase().includes(this.filters.query)) ? this.theme.accent : this.theme.node,
        highlighted: id === this.hovered,
        forceLabel: id === this.hovered || (!!this.filters.query && String(attrs.label).toLowerCase().includes(this.filters.query)),
      }),
      edgeReducer: (id, attrs) => ({ ...attrs,
        hidden: !this.visible.has(this.graph.source(id)) || !this.visible.has(this.graph.target(id)),
        color: this.hoveredEdges.has(id) ? this.theme.accent : this.theme.edge,
      }),
    })
    this.renderer.on('enterNode', ({ node }) => this.hover(node))
    this.renderer.on('leaveNode', () => this.hover(null))
    this.renderer.on('clickNode', ({ node }) => {
      if (performance.now() <= this.suppressClickUntil) return
      this.route(node)
    })
    this.renderer.on('downNode', ({ node, event }) => {
      if ('button' in event.original && event.original.button !== 0) return
      const a = this.graph.getNodeAttributes(node)
      this.drag = { id: node, x: event.x, y: event.y, moved: false }
      this.positionDirty = true
      this.graph.setNodeAttribute(node, 'fixed', true)
      // Freeze normalization, otherwise moving a boundary node moves the canvas.
      this.renderer.setCustomBBox(this.renderer.getBBox())
      this.heat(node)
      a.fixed = true
      event.preventSigmaDefault()
    })
    this.renderer.getMouseCaptor().on('mousemovebody', event => {
      if (!this.drag) return
      if (Math.hypot(event.x - this.drag.x, event.y - this.drag.y) > 4) this.drag.moved = true
      const pos = this.renderer.viewportToGraph(event)
      this.graph.mergeNodeAttributes(this.drag.id, pos)
      event.preventSigmaDefault(); event.original.preventDefault(); event.original.stopPropagation()
    })
    this.renderer.getMouseCaptor().on('mouseup', () => this.endDrag())
    window.addEventListener('blur', this.endDrag)
    this.renderer.getCamera().on('updated', () => { this.movingUntil = performance.now() + 140 })
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.disposed && container.clientWidth && container.clientHeight) {
        this.renderer.resize(); this.renderer.scheduleRender()
      }
    })
    this.resizeObserver.observe(container)
    this.themeObserver = new MutationObserver(() => {
      if (!this.readTheme()) return
      this.renderer.setSetting('labelColor', { color: this.theme.text }); this.renderer.refresh()
    })
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('pagehide', this.pageHide)
    // The first paint always precedes layout work.
    this.timer = setTimeout(() => { if (!this.disposed && this.metrics.restored < this.graph.order) this.heat() }, 32)
  }

  static async create(container: HTMLElement, data: GraphData, route: (id: string) => void, scope: string) {
    const pending = readPositions(scope)
    let timedOut = false
    const positions = await Promise.race([pending, new Promise<Positions>(resolve => setTimeout(() => { timedOut = true; resolve({}) }, 50))])
    const runtime = new SigmaGraph(container, data, route, scope, positions)
    if (timedOut) void pending.then(late => runtime.restorePositions(late))
    return runtime
  }

  private restorePositions(positions: Positions) {
    if (this.disposed || this.positionDirty || this.metrics.ticks > 1) return
    let restored = 0
    for (const [id, position] of Object.entries(positions)) {
      if (!this.graph.hasNode(id) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue
      this.graph.mergeNodeAttributes(id, position); restored++
    }
    if (!restored) return
    this.pause(false)
    this.metrics.restored = restored
    this.renderer.refresh()
    if (restored < this.graph.order) this.timer = setTimeout(() => this.heat(), 32)
    else this.metrics.layoutState = 'restored'
  }

  private readTheme() {
    const style = getComputedStyle(this.container)
    const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const next = { node: color('--nk-muted', '#888888'), edge: color('--nk-line-strong', '#dddddd'), accent: color('--nk-accent', '#0a84ff'), text: color('--nk-ink', '#333333') }
    const changed = Object.keys(next).some(key => next[key as keyof typeof next] !== this.theme[key as keyof typeof next])
    this.theme = next
    return changed
  }
  private addNode(node: NetNode, position?: { x: number; y: number }) {
    const valid = position && Number.isFinite(position.x) && Number.isFinite(position.y)
    if (valid) this.metrics.restored++
    this.graph.addNode(node.id, { ...node, ...(valid ? position : seed(node.id, Math.sqrt(this.data.nodes.length) * 10)), size: this.nodeSize(node.size), fixed: false })
  }
  private nodeSize(size: number) { return Math.min(14, Math.max(2, Math.sqrt(size) * 0.9)) }
  private addEdge(edge: NetEdge) {
    if (edge.source === edge.target || !this.graph.hasNode(edge.source) || !this.graph.hasNode(edge.target)) return
    this.graph.addUndirectedEdgeWithKey(edge.id, edge.source, edge.target, { size: 0.5, weight: Math.min(edge.size, 4) })
  }

  private seedNearNeighbors(id: string) {
    const neighbors = this.graph.neighbors(id)
    if (!neighbors.length) return
    let x = 0, y = 0
    for (const neighbor of neighbors) {
      const attrs = this.graph.getNodeAttributes(neighbor)
      x += attrs.x; y += attrs.y
    }
    const offset = seed(id, Math.max(2, Math.sqrt(neighbors.length) * 2))
    this.graph.mergeNodeAttributes(id, { x: x / neighbors.length + offset.x, y: y / neighbors.length + offset.y })
  }

  update(data: GraphData) {
    if (data === this.data) return
    const previous = this.data
    this.data = data
    let delta = data.delta
    if (data.revision !== previous.revision + 1 || !delta) {
      const nodeIds = new Set(data.nodes.map(node => node.id))
      const edgeIds = new Set(data.edges.map(edge => edge.id))
      delta = { nodes: data.nodes, edges: data.edges,
        dropNodes: this.graph.nodes().filter(id => !nodeIds.has(id)),
        dropEdges: this.graph.edges().filter(id => !edgeIds.has(id)) }
    }
    let topology = false
    const touched = new Set<string>()
    const touchedEdges = new Set<string>()
    const addedNodes: string[] = []
    for (const id of delta.dropEdges) if (this.graph.hasEdge(id)) {
      touched.add(this.graph.source(id)); touched.add(this.graph.target(id))
      this.graph.dropEdge(id); topology = true
    }
    for (const id of delta.dropNodes) if (this.graph.hasNode(id)) {
      for (const neighbor of this.graph.neighbors(id)) touched.add(neighbor)
      this.graph.dropNode(id); topology = true
    }
    for (const node of delta.nodes) {
      touched.add(node.id)
      if (!this.graph.hasNode(node.id)) { this.addNode(node); addedNodes.push(node.id); topology = true }
      else this.graph.mergeNodeAttributes(node.id, { label: node.label, size: this.nodeSize(node.size) })
    }
    for (const edge of delta.edges) {
      touched.add(edge.source); touched.add(edge.target)
      touchedEdges.add(edge.id)
      if (!this.graph.hasEdge(edge.id)) { this.addEdge(edge); topology = true }
      else this.graph.setEdgeAttribute(edge.id, 'weight', Math.min(edge.size, 4))
    }
    for (const id of addedNodes) if (this.graph.hasNode(id)) this.seedNearNeighbors(id)
    if (topology) {
      this.computeVisibility(); this.hover(this.hovered); this.renderer.refresh()
    } else {
      this.renderer.refresh({ partialGraph: {
        nodes: [...touched].filter(id => this.graph.hasNode(id)),
        edges: [...touchedEdges].filter(id => this.graph.hasEdge(id)),
      }, schedule: true })
    }
    if (topology || delta.edges.length) this.heat([...touched])
    this.metrics.updates++
  }

  filter(filters: Partial<Filters>) {
    this.filters = { ...this.filters, ...filters, query: (filters.query ?? this.filters.query).trim().toLowerCase() }
    this.computeVisibility(); this.hover(null); this.renderer.refresh()
  }
  private computeVisibility() {
    const f = this.filters
    let local: Set<string> | undefined
    if (f.local && this.graph.hasNode(f.local)) {
      local = new Set([f.local]); let frontier = [f.local]
      for (let hop = 0; hop < Math.min(3, f.hops); hop++) {
        const next: string[] = []
        for (const id of frontier) for (const neighbor of this.graph.neighbors(id)) if (!local.has(neighbor)) { local.add(neighbor); next.push(neighbor) }
        frontier = next
      }
    } else if (f.local) local = new Set()
    this.visible.clear()
    this.graph.forEachNode(id => {
      const degree = this.graph.degree(id)
      if ((degree === 0 ? !f.isolated : degree === 1 && !f.leaves) || degree < f.minDegree || (local && !local.has(id))) return
      this.visible.add(id)
    })
  }
  hover(id: string | null) {
    const started = performance.now()
    const touchedNodes = new Set(this.neighbors), touchedEdges = new Set(this.hoveredEdges)
    if (this.hovered) touchedNodes.add(this.hovered)
    this.hovered = id && this.graph.hasNode(id) ? id : null
    this.neighbors = new Set(this.hovered ? this.graph.neighbors(this.hovered) : [])
    this.hoveredEdges = new Set(this.hovered ? this.graph.edges(this.hovered) : [])
    if (this.hovered) touchedNodes.add(this.hovered)
    for (const node of this.neighbors) touchedNodes.add(node)
    for (const edge of this.hoveredEdges) touchedEdges.add(edge)
    this.renderer.refresh({ partialGraph: { nodes: [...touchedNodes].filter(n => this.graph.hasNode(n)), edges: [...touchedEdges].filter(e => this.graph.hasEdge(e)) }, skipIndexation: true, schedule: true })
    this.metrics.hoverMs = performance.now() - started
  }

  heat(center?: string | string[]) {
    if (this.disposed || !this.graph.order || !this.graph.size) return
    this.pause(false)
    const centers = typeof center === 'string' ? [center] : center
    this.layoutNodes = undefined
    if (centers) {
      this.layoutNodes = new Set(centers.filter(id => this.graph.hasNode(id)))
      for (const id of centers) if (this.graph.hasNode(id)) for (const neighbor of this.graph.neighbors(id)) this.layoutNodes.add(neighbor)
    }
    this.rebuildMatrices()
    this.started = performance.now(); this.stableTicks = 0; this.running = true
    this.metrics.layoutState = 'running'
    if (!this.worker) {
      try {
        const worker = new Worker(new URL('./graph-layout.worker.ts', import.meta.url), { type: 'module' })
        this.worker = worker
        worker.onmessage = ({ data }) => {
          if (this.worker !== worker || this.disposed || !this.running || data.generation !== this.generation) return
          if (this.timer) clearTimeout(this.timer)
          this.timer = undefined
          this.accept(new Float32Array(data.nodes), new Float32Array(data.edges))
        }
        worker.onerror = event => {
          if (this.worker !== worker || this.disposed || !this.running) return
          event.preventDefault()
          this.fallbackToMainThread(worker)
        }
        this.metrics.worker = true
      } catch { this.metrics.worker = false }
    }
    if (this.worker) this.step()
    else {
      this.metrics.layoutState = 'main-thread-fallback'
      this.scheduleStep(this.mainThreadDelay())
    }
  }
  private rebuildMatrices() {
    let layoutGraph = this.graph
    this.layoutOffset = { x: 0, y: 0 }
    if (this.layoutNodes) {
      const local = new UndirectedGraph({ allowSelfLoops: false })
      for (const id of this.layoutNodes) if (this.graph.hasNode(id)) {
        local.addNode(id, { ...this.graph.getNodeAttributes(id), fixed: id === this.drag?.id })
      }
      if (local.order) {
        local.forEachNode((_id, attrs) => { this.layoutOffset.x += attrs.x; this.layoutOffset.y += attrs.y })
        this.layoutOffset.x /= local.order; this.layoutOffset.y /= local.order
        local.updateEachNodeAttributes((_id, attrs) => ({ ...attrs,
          x: attrs.x - this.layoutOffset.x, y: attrs.y - this.layoutOffset.y,
        }), { attributes: ['x', 'y'] })
      }
      for (const id of local.nodes()) for (const edge of this.graph.edges(id)) {
        if (local.hasEdge(edge)) continue
        const [source, target] = this.graph.extremities(edge)
        if (local.hasNode(source) && local.hasNode(target)) {
          local.addUndirectedEdgeWithKey(edge, source, target, this.graph.getEdgeAttributes(edge))
        }
      }
      layoutGraph = local
    }
    this.keys = layoutGraph.nodes()
    this.matrices = graphToByteArrays(layoutGraph, (_key: string, attrs: any) => attrs.weight || 1)
  }
  private mainThreadDelay() {
    return Math.min(700, 180 + this.keys.length / 12)
  }
  private scheduleStep(delay: number) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = undefined; this.step() }, delay)
  }
  private fallbackToMainThread(worker: Worker) {
    if (this.worker !== worker) return
    worker.terminate(); this.worker = undefined
    this.metrics.worker = false
    this.metrics.layoutState = 'main-thread-fallback'
    // A failed transfer leaves detached arrays. Rebuild from current positions.
    this.rebuildMatrices()
    this.scheduleStep(this.mainThreadDelay())
  }
  private step() {
    if (!this.running || this.disposed || !this.matrices) return
    const { nodes, edges } = this.matrices
    // Changes during drag must be fed back into the worker's matrix.
    if (this.drag && this.graph.hasNode(this.drag.id)) {
      const index = this.keys.indexOf(this.drag.id)
      if (index >= 0) {
        const i = index * 10, attrs = this.graph.getNodeAttributes(this.drag.id)
        nodes[i] = attrs.x - this.layoutOffset.x
        nodes[i + 1] = attrs.y - this.layoutOffset.y
        nodes[i + 9] = 1
      }
    }
    const settings = { ...this.settings, slowDown: 5 + Math.min(20, (performance.now() - this.started) / 500) }
    if (this.worker) {
      const worker = this.worker
      try {
        worker.postMessage({ nodes: nodes.buffer, edges: edges.buffer, settings, generation: this.generation }, [nodes.buffer, edges.buffer])
        const timeout = Math.min(15000, 2000 + this.keys.length / 2)
        this.timer = setTimeout(() => {
          this.timer = undefined
          if (this.worker === worker && this.running) this.fallbackToMainThread(worker)
        }, timeout)
      } catch {
        this.fallbackToMainThread(worker)
      }
    } else {
      // One Barnes-Hut tick at a low cadence is the last-resort path. It may be
      // slower than a Worker, but it keeps converging instead of silently stopping.
      try { iterate(settings, nodes, edges); this.accept(nodes, edges) }
      catch { this.pause(); this.metrics.layoutState = 'layout-error' }
    }
  }
  private accept(nodes: Float32Array, edges: Float32Array) {
    this.matrices = { nodes, edges }
    const now = performance.now()
    let displacement = 0, samples = 0
    for (let i = 0; i < this.keys.length; i += Math.max(1, Math.floor(this.keys.length / 128))) {
      const attrs = this.graph.getNodeAttributes(this.keys[i])
      if (!attrs.fixed) {
        displacement += Math.hypot(attrs.x - (nodes[i * 10] + this.layoutOffset.x), attrs.y - (nodes[i * 10 + 1] + this.layoutOffset.y)); samples++
      }
    }
    if (now >= this.movingUntil) {
      if (!this.layoutNodes) {
        let index = 0
        this.graph.updateEachNodeAttributes((id, attrs) => {
          const x = nodes[index * 10], y = nodes[index * 10 + 1]; index++
          return id === this.drag?.id || !Number.isFinite(x) || !Number.isFinite(y) ? attrs : { ...attrs, x, y }
        }, { attributes: ['x', 'y'] })
      } else {
        for (let i = 0; i < this.keys.length; i++) {
          const id = this.keys[i], x = nodes[i * 10] + this.layoutOffset.x, y = nodes[i * 10 + 1] + this.layoutOffset.y
          if (id !== this.drag?.id && this.graph.hasNode(id) && Number.isFinite(x) && Number.isFinite(y)) {
            this.graph.mergeNodeAttributes(id, { x, y })
          }
        }
      }
    }
    this.metrics.ticks++; this.metrics.layoutMs = now - this.started
    this.stableTicks = samples > 0 && displacement / samples < 0.02 ? this.stableTicks + 1 : 0
    if (!this.drag && (this.stableTicks >= 8 || now - this.started > 12000)) {
      this.pause(); this.metrics.layoutState = this.stableTicks >= 8 ? 'converged' : 'budget-paused'
    } else this.scheduleStep(this.worker ? 80 : this.mainThreadDelay())
  }
  pause(save = true) {
    this.running = false; this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    // Cancel stale in-flight results and release the worker at rest.
    this.worker?.terminate(); this.worker = undefined; this.matrices = undefined; this.layoutNodes = undefined
    this.metrics.worker = false
    this.metrics.layoutState = 'paused'
    if (save) this.persist()
  }
  private endDrag = () => {
    if (!this.drag) return
    const { id, moved } = this.drag
    this.drag = null; this.suppressClickUntil = moved ? performance.now() + 250 : 0
    this.renderer.setCustomBBox(null)
    if (this.graph.hasNode(id)) this.graph.setNodeAttribute(id, 'fixed', false)
    this.heat(id)
  }
  positions(): Positions {
    const result: Positions = Object.create(null)
    this.graph.forEachNode((id, attrs) => { result[id] = { x: attrs.x, y: attrs.y } })
    return result
  }
  persist() { void writePositions(this.scope, this.positions()) }
  kill() {
    if (this.disposed) return
    this.disposed = true; this.pause()
    this.resizeObserver.disconnect(); this.themeObserver.disconnect()
    window.removeEventListener('pagehide', this.pageHide); window.removeEventListener('blur', this.endDrag)
    this.renderer.kill()
  }
}
