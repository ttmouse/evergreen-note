import iterate from 'graphology-layout-forceatlas2/iterate'

// Vite emits a local worker asset, without blob/importScripts or a CDN.
self.onmessage = ({ data }) => {
  const nodes = new Float32Array(data.nodes)
  const edges = new Float32Array(data.edges)
  iterate(data.settings, nodes, edges)
  self.postMessage({ nodes: nodes.buffer, edges: edges.buffer, generation: data.generation }, { transfer: [nodes.buffer, edges.buffer] })
}
