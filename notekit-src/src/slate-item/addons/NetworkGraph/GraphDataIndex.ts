export type NetNode = { id: string; label: string; size: number; isLeaf?: boolean }
export type NetEdge = { id: string; source: string; target: string; size: number }
export type GraphDelta = {
  nodes: NetNode[]; edges: NetEdge[]; dropNodes: string[]; dropEdges: string[]
}
export type GraphData = { nodes: NetNode[]; edges: NetEdge[]; revision: number; delta?: GraphDelta }
type Topic = { topic: string; label: string }
type Source = { topic?: string; count?: number }
type Reader = {
  topics: () => Topic[]
  topic: (id: string) => Topic | undefined
  buckets: () => string[]
  sources: (target: string) => Source[]
  refine: (id: string) => string
}

// JSON encoding avoids collisions for titles containing commas.
export const edgeKey = (a: string, b: string) => JSON.stringify([a, b].sort())

/** Cache reference-bucket contributions, so an edit never scans the full library. */
export class GraphDataIndex {
  private nodes = new Map<string, NetNode>()
  private edges = new Map<string, NetEdge>()
  private buckets = new Map<string, NetEdge[]>()
  private bucketSources = new Map<string, Set<string>>()
  private sourceBuckets = new Map<string, Set<string>>()
  private targetBuckets = new Map<string, Set<string>>()
  private weights = new Map<string, number>()
  private changedNodes = new Set<string>()
  private changedEdges = new Set<string>()
  private snapshot: GraphData = { nodes: [], edges: [], revision: 0 }
  private initialized = false
  constructor(private reader: Reader) {}

  getSnapshot = () => this.snapshot

  initialize() {
    for (const id of this.nodes.keys()) this.changedNodes.add(id)
    for (const id of this.edges.keys()) this.changedEdges.add(id)
    this.nodes.clear(); this.edges.clear(); this.buckets.clear()
    this.bucketSources.clear()
    this.sourceBuckets.clear(); this.targetBuckets.clear(); this.weights.clear()
    for (const topic of this.reader.topics()) this.updateTopic(topic.topic)
    for (const raw of this.reader.buckets()) this.updateBucket(raw)
    this.initialized = true
    this.publish()
    return this.snapshot
  }

  update(topicIds: Iterable<string>, rawTargets: Iterable<string>) {
    if (!this.initialized) return this.initialize()
    const targets = new Set(rawTargets)
    for (const raw of topicIds) {
      const id = this.reader.refine(raw)
      this.updateTopic(id)
      for (const target of this.sourceBuckets.get(id) || []) targets.add(target)
      for (const target of this.targetBuckets.get(id) || []) targets.add(target)
      // A formerly missing topic can make a previously unresolved bucket valid.
      targets.add(id)
    }
    for (const target of targets) this.updateBucket(target)
    this.publish()
    return this.snapshot
  }

  private updateTopic(raw: string) {
    const id = this.reader.refine(raw)
    const topic = this.reader.topic(id)
    const old = this.nodes.get(id)
    if (!topic) {
      if (old) { this.nodes.delete(id); this.changedNodes.add(id) }
      return
    }
    const node = { id, label: topic.label, size: 10 + (this.weights.get(id) || 0) }
    if (!old || old.label !== node.label || old.size !== node.size) {
      this.nodes.set(id, node); this.changedNodes.add(id)
    }
  }

  private weight(id: string, amount: number) {
    this.weights.set(id, (this.weights.get(id) || 0) + amount)
    const old = this.nodes.get(id)
    if (old) {
      this.nodes.set(id, { ...old, size: 10 + (this.weights.get(id) || 0) })
      this.changedNodes.add(id)
    }
  }

  private updateBucket(raw: string) {
    const target = this.reader.refine(raw)
    const old = this.buckets.get(raw) || []
    for (const id of this.bucketSources.get(raw) || []) {
      this.sourceBuckets.get(id)?.delete(raw)
      if (!this.sourceBuckets.get(id)?.size) this.sourceBuckets.delete(id)
    }
    for (const edge of old) {
      const current = this.edges.get(edge.id)!
      if (current.size === 1) this.edges.delete(edge.id)
      else this.edges.set(edge.id, { ...current, size: current.size - 1 })
      this.changedEdges.add(edge.id)
      this.weight(edge.source, -1)
    }
    if (old.length) this.weight(target, -2)
    const next: NetEdge[] = []
    const sourceIds = new Set<string>()
    this.targetBuckets.get(target)?.delete(raw)
    const sources = this.reader.sources(raw)
    if (sources.length) {
      if (!this.targetBuckets.has(target)) this.targetBuckets.set(target, new Set())
      this.targetBuckets.get(target)!.add(raw)
    }
    // Remember unresolved sources too: adding that topic later must reconnect it.
    for (const source of sources) {
      if (!source.topic) continue
      const id = this.reader.refine(source.topic)
      sourceIds.add(id)
      if (!this.sourceBuckets.has(id)) this.sourceBuckets.set(id, new Set())
      this.sourceBuckets.get(id)!.add(raw)
      if (!this.nodes.has(target) || !this.nodes.has(id)) continue
      const key = edgeKey(id, target)
      const count = typeof source.count === 'number' && Number.isFinite(source.count) && source.count > 0
        ? Math.max(1, Math.floor(source.count))
        : 1
      for (let occurrence = 0; occurrence < count; occurrence++) {
        const edge = { id: key, source: id, target, size: 1 }
        const current = this.edges.get(key)
        this.edges.set(key, current ? { ...current, size: current.size + 1 } : edge)
        this.changedEdges.add(key); this.weight(id, 1); next.push(edge)
      }
    }
    // Empty/removed buckets must leave no stale reverse-source subscriptions.
    this.bucketSources.set(raw, sourceIds)
    if (next.length) this.weight(target, 2)
    this.buckets.set(raw, next)
  }

  private publish() {
    if (!this.changedNodes.size && !this.changedEdges.size && this.snapshot.revision) return
    const delta: GraphDelta = { nodes: [], edges: [], dropNodes: [], dropEdges: [] }
    for (const id of this.changedNodes) {
      const node = this.nodes.get(id)
      if (node) delta.nodes.push(node); else delta.dropNodes.push(id)
    }
    for (const id of this.changedEdges) {
      const edge = this.edges.get(id)
      if (edge) delta.edges.push(edge); else delta.dropEdges.push(id)
    }
    this.changedNodes.clear(); this.changedEdges.clear()
    // Compare the touched records: remove+add index events often cancel out.
    const previousNodes = new Map(this.snapshot.nodes.map(n => [n.id, n]))
    const previousEdges = new Map(this.snapshot.edges.map(e => [e.id, e]))
    delta.nodes = delta.nodes.filter(n => {
      const old = previousNodes.get(n.id)
      return !old || old.label !== n.label || old.size !== n.size
    })
    delta.edges = delta.edges.filter(e => previousEdges.get(e.id)?.size !== e.size)
    delta.dropNodes = delta.dropNodes.filter(id => previousNodes.has(id))
    delta.dropEdges = delta.dropEdges.filter(id => previousEdges.has(id))
    if (!delta.nodes.length && !delta.edges.length && !delta.dropNodes.length && !delta.dropEdges.length && this.snapshot.revision) return
    this.snapshot = { nodes: [...this.nodes.values()], edges: [...this.edges.values()], revision: this.snapshot.revision + 1, delta }
  }
}
