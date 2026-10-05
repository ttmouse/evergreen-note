import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/slate-item/addons/NetworkGraph/GraphDataIndex.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const { GraphDataIndex, edgeKey } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64'),
)

const refine = id => id.trim().toLowerCase()
let reads = 0
const topics = new Map([
  ['a', { topic: 'a', label: 'A' }],
  ['b', { topic: 'b', label: 'B' }],
  ['c', { topic: 'c', label: 'C' }],
  ['comma,a', { topic: 'comma,a', label: 'Comma A' }],
  ['b,c', { topic: 'b,c', label: 'B Comma C' }],
])
const buckets = new Map([
  ['b', [{ topic: 'a' }]],
  ['a', [{ topic: 'b' }]],
])
const index = new GraphDataIndex({
  topics: () => [...topics.values()],
  topic: id => topics.get(refine(id)),
  buckets: () => [...buckets.keys()],
  sources: id => {
    reads++
    return buckets.get(id) || []
  },
  refine,
})

let data = index.initialize()
assert.equal(data.nodes.length, 5)
assert.equal(data.edges.length, 1)
assert.equal(data.edges[0].size, 2)
assert.equal(data.edges[0].id, edgeKey('a', 'b'))

// A JSON edge key remains unambiguous when either topic contains commas.
assert.notEqual(edgeKey('comma,a', 'b'), edgeKey('comma', 'a,b'))
buckets.set('b,c', [{ topic: 'comma,a' }])
data = index.update([], ['b,c'])
assert(data.edges.some(edge => edge.id === edgeKey('comma,a', 'b,c')))

// Multiple reference records and repeated mentions contribute to one weighted edge.
buckets.set('b', [{ topic: 'a' }, { topic: 'a' }, { topic: 'c', count: 2 }])
reads = 0
data = index.update([], ['b'])
assert.equal(reads, 1)
assert.equal(data.edges.find(edge => edge.id === edgeKey('a', 'b')).size, 3)
assert.equal(data.edges.find(edge => edge.id === edgeKey('c', 'b')).size, 2)

// Self references are valid input and do not corrupt the edge accumulator.
buckets.set('c', [{ topic: 'c', count: 2 }])
data = index.update([], ['c'])
assert.equal(data.edges.find(edge => edge.id === edgeKey('c', 'c')).size, 2)

// Equivalent writes and unrelated re-renders retain the exact snapshot object.
const stable = data
reads = 0
assert.equal(index.update([], []), stable)
assert.equal(index.update([], ['b']), stable)
assert.equal(reads, 1)

// Topic rename only changes the touched node; its incident edges remain intact.
topics.set('a', { topic: 'a', label: 'A renamed' })
data = index.update(['A'], [])
assert.notEqual(data, stable)
assert.equal(data.nodes.find(node => node.id === 'a').label, 'A renamed')

// Removing a topic removes its node and every local edge; restoring it reconnects
// from the reverse bucket maps without scanning all buckets.
topics.delete('b')
data = index.update(['b'], [])
assert.equal(data.nodes.some(node => node.id === 'b'), false)
assert.equal(data.edges.some(edge => edge.source === 'b' || edge.target === 'b'), false)
topics.set('b', { topic: 'b', label: 'B restored' })
data = index.update(['B'], [])
assert.equal(data.nodes.find(node => node.id === 'b').label, 'B restored')
assert(data.edges.some(edge => edge.id === edgeKey('a', 'b')))

// Removing and retargeting a reference updates only the affected buckets.
buckets.set('a', [])
index.update([], ['a'])
buckets.set('b', [{ topic: 'c' }])
data = index.update([], ['b'])
assert.equal(data.edges.some(edge => edge.id === edgeKey('a', 'b')), false)
assert.equal(data.edges.find(edge => edge.id === edgeKey('c', 'b')).size, 1)
buckets.set('b', [{ topic: 'a' }])
data = index.update([], ['b'])
assert.equal(data.edges.find(edge => edge.id === edgeKey('a', 'b')).size, 1)

// An unresolved source/target becomes connected when the topic is later added.
buckets.set('b', [{ topic: 'c' }])
index.update([], ['b'])
topics.delete('c')
data = index.update(['c'], [])
assert.equal(data.edges.some(edge => edge.id === edgeKey('c', 'b')), false)
topics.set('c', { topic: 'c', label: 'C restored' })
data = index.update(['c'], [])
assert.equal(data.edges.find(edge => edge.id === edgeKey('c', 'b')).size, 1)

// A missing target bucket is remembered so a later topic/ref load can connect it.
buckets.set('unknown', [{ topic: 'c' }])
index.update([], ['unknown'])
topics.set('unknown', { topic: 'unknown', label: 'Late topic' })
data = index.update(['unknown'], [])
assert(data.edges.some(edge => edge.id === edgeKey('c', 'unknown')))

// Case normalization is applied to both ends of an edge.
buckets.set('b,c', [{ topic: 'A' }])
data = index.update([], ['b,c'])
assert(data.edges.some(edge => edge.id === edgeKey('a', 'b,c')))

// Re-initialization models batch load and route reopen. No-op reopens preserve
// the snapshot identity; changed library state gets one new revision.
const beforeReopen = data
assert.equal(index.initialize(), beforeReopen)
topics.set('a', { topic: 'a', label: 'A after reopen' })
data = index.initialize()
assert.notEqual(data, beforeReopen)
assert.equal(data.nodes.find(node => node.id === 'a').label, 'A after reopen')

topics.clear()
buckets.clear()
data = index.initialize()
assert.equal(data.nodes.length, 0)
assert.equal(data.edges.length, 0)
assert(data.delta.dropNodes.includes('a'))
assert(data.delta.dropEdges.length > 0)

console.log('PASS: incremental graph index covers add/remove/rename, retargets, case normalization, comma-safe IDs, duplicate/self references, unresolved topics, snapshot stability, batch reload, and teardown state')
