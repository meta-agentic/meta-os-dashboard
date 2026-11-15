// The canonical graph model (ADR-MOS-18, part 3): the JSON Graph Format, version 2,
// profiled. One in-memory and wire shape for every graph the dashboard draws; nothing
// below it knows a file format, nothing above it knows a pixel.
//
//   { graph: { id, directed, metadata: { profile, version, ... },
//              nodes: { [id]: { label, metadata } }, edges: [ { source, target, relation, metadata } ] } }
//
// Profile keys the dashboard understands (unknown keys pass through untouched):
//   node.metadata.type    category (graphify's file_type, a backlog item's kind)
//   node.metadata.group   community, cluster or epic
//   node.metadata.status  a backlog status
//   node.metadata.weight  a size-like number
//   node.metadata.source  where the node is defined
//   node.metadata.degree  computed by the query, never read from a file
//   edge.metadata.kind    dependency, block, relates, child, or a reader's own relation
//   edge.metadata.confidence   0..1
//   edge.metadata.weight
//
// Node order is the insertion order of `graph.nodes`, which JavaScript keeps for string
// keys. A key that looks like a non-negative integer is ordered first by the language;
// no reader so far produces such ids (graphify ids are paths and concept names), and a
// reader that does must carry an explicit order in metadata.

export const PROFILE = 'meta-graph/1'

export function emptyGraph({ id = 'graph', directed = false, version = null, metadata = {} } = {}) {
  return { graph: { id, directed, metadata: { profile: PROFILE, version, ...metadata }, nodes: {}, edges: [] } }
}

export function addNode(model, id, { label, metadata = {} } = {}) {
  model.graph.nodes[id] = { label: label ?? id, metadata }
  return model
}

export function addEdge(model, { source, target, relation = null, metadata = {} }) {
  model.graph.edges.push({ source, target, relation, metadata })
  return model
}

export const nodesOf = (model) => Object.entries(model.graph.nodes).map(([id, n]) => ({ id, ...n }))
export const edgesOf = (model) => model.graph.edges

/** Degree of every node over both ends of every edge (as the knowledge graph has always counted it). */
export function degrees(model) {
  const d = new Map()
  for (const e of model.graph.edges) {
    d.set(e.source, (d.get(e.source) ?? 0) + 1)
    d.set(e.target, (d.get(e.target) ?? 0) + 1)
  }
  return d
}

/**
 * A structural check of a document against the profile, with the path of the first
 * fault. The JSON Schema of the profile is a later slice; this keeps a malformed reader
 * output or a hand-written document from reaching the renderer.
 */
export function validateModel(model) {
  const fail = (p, why) => { throw new Error(`graph model: ${p} ${why}`) }
  if (!model || typeof model !== 'object' || !model.graph) fail('graph', 'is missing')
  const g = model.graph
  if (typeof g.directed !== 'boolean') fail('graph.directed', 'must be a boolean')
  if (!g.nodes || typeof g.nodes !== 'object' || Array.isArray(g.nodes)) fail('graph.nodes', 'must be an object keyed by node id')
  if (!Array.isArray(g.edges)) fail('graph.edges', 'must be an array')
  for (const [id, n] of Object.entries(g.nodes)) {
    if (!n || typeof n !== 'object') fail(`graph.nodes[${id}]`, 'must be an object')
    if (n.metadata != null && typeof n.metadata !== 'object') fail(`graph.nodes[${id}].metadata`, 'must be an object')
  }
  g.edges.forEach((e, i) => {
    if (!(e.source in g.nodes)) fail(`graph.edges[${i}].source`, `names an unknown node ${JSON.stringify(e.source)}`)
    if (!(e.target in g.nodes)) fail(`graph.edges[${i}].target`, `names an unknown node ${JSON.stringify(e.target)}`)
  })
  return model
}
