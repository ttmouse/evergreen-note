declare module 'graphology-layout-forceatlas2/iterate' {
  import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2'
  export default function iterate(settings: ForceAtlas2Settings, nodes: Float32Array, edges: Float32Array): void
}
declare module 'graphology-layout-forceatlas2/helpers' {
  import type Graph from 'graphology'
  export function graphToByteArrays(graph: Graph, edgeWeight: (...args: any[]) => number): { nodes: Float32Array; edges: Float32Array }
}
