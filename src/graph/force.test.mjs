// Golden test (MOS-321 AC2): the extracted force layout places every node exactly where
// the knowledge graph's own code did, and frames the same home view. The oracle is the
// pre-extraction `layout()` and `radius()` of src/widgets/graph/GraphView.jsx, copied
// verbatim; it runs over the same graph in the shape the old server sent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { forceLayout } from './layout/force.js'
import { resolveStyle } from './style.js'
import { graphifyStyle } from '../widgets/graph/graphifyStyle.js'

const W = 900, H = 560
const radius = (n) => Math.min(3 + Math.sqrt(n.degree ?? 0), 14)
function legacyLayout(nodes, links) {
  const ns = nodes.map((n) => ({ ...n }))
  const ls = links.map((l) => ({ ...l }))
  const sim = forceSimulation(ns)
    .force('link', forceLink(ls).id((d) => d.id).distance(30).strength(0.4))
    .force('charge', forceManyBody().strength(-40))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(0.06))
    .force('y', forceY(H / 2).strength(0.1))
    .force('collide', forceCollide().radius((d) => radius(d) + 1))
    .stop()
  sim.tick(200)
  const pad = 30
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of ns) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y)
  }
  let bw = x1 - x0 + 2 * pad, bh = y1 - y0 + 2 * pad
  if (bw / bh > W / H) bh = bw * (H / W)
  else bw = bh * (W / H)
  const home = { x: (x0 + x1) / 2 - bw / 2, y: (y0 + y1) / 2 - bh / 2, w: bw, h: bh }
  return { ns, ls, home }
}

// A graph in the old wire shape (nodes with degree, links) and the same graph as a model.
export function fixture(n = 80, m = 130) {
  const types = ['code', 'document', 'concept', 'paper']
  let s = 7
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647
  const ids = Array.from({ length: n }, (_, i) => `${types[i % 4]}/n${i}`)
  const links = []
  while (links.length < m) {
    const a = Math.floor(rnd() ** 2 * n), b = Math.floor(rnd() * n)
    if (a !== b) links.push({ source: ids[a], target: ids[b], relation: 'mentions', confidence: ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'][links.length % 3] })
  }
  const degree = new Map()
  for (const l of links) { degree.set(l.source, (degree.get(l.source) ?? 0) + 1); degree.set(l.target, (degree.get(l.target) ?? 0) + 1) }
  // The old server sorted by degree; keep that order so the index-seeded simulation starts the same.
  const legacyNodes = ids.map((id, i) => ({ id, label: `node ${i}`, type: types[i % 4], community: i % 3, degree: degree.get(id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
  const nodes = {}
  for (const nd of legacyNodes) nodes[nd.id] = { label: nd.label, metadata: { type: nd.type, group: nd.community, degree: nd.degree } }
  const model = { graph: { id: 'fx', directed: false, metadata: { profile: 'meta-graph/1' }, nodes,
    edges: links.map((l) => ({ source: l.source, target: l.target, relation: l.relation, metadata: { kind: l.relation, confidenceLabel: l.confidence } })) } }
  return { legacyNodes, links, model }
}

test('the same graph gets the same positions and the same home view as before', () => {
  const { legacyNodes, links, model } = fixture()
  const want = legacyLayout(legacyNodes, links)
  const style = resolveStyle(graphifyStyle)
  const got = forceLayout(model, { size: style.nodeSize })

  assert.equal(Object.keys(got.positions).length, want.ns.length)
  for (const n of want.ns) assert.deepEqual(got.positions[n.id], { x: n.x, y: n.y }, `position of ${n.id}`)
  assert.deepEqual(got.home, want.home)
  assert.equal(got.routes.length, want.ls.length)
  want.ls.forEach((l, i) => {
    assert.deepEqual(got.routes[i], { index: i, source: l.source.id, target: l.target.id, points: [[l.source.x, l.source.y], [l.target.x, l.target.y]] })
  })
})

test('the layout is deterministic, and a seed changes it deterministically', () => {
  const { model } = fixture(30, 40)
  const a = forceLayout(model), b = forceLayout(model)
  assert.deepEqual(a.positions, b.positions)
  const c = forceLayout(model, { seed: 3 }), d = forceLayout(model, { seed: 3 })
  assert.deepEqual(c.positions, d.positions)
  // Positions are a function of the model alone: no graph shape leaks pixels or styles.
  assert.deepEqual(Object.keys(a), ['strategy', 'width', 'height', 'positions', 'routes', 'bounds', 'home'])
})

test('an empty graph frames the whole drawing instead of dividing by zero', () => {
  const g = forceLayout({ graph: { id: 'e', directed: false, metadata: {}, nodes: {}, edges: [] } })
  assert.deepEqual(g.home, { x: 0, y: 0, w: 900, h: 560 })
  assert.deepEqual(g.positions, {})
})
