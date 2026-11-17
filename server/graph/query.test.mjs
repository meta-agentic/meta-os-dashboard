// The generic query must give the knowledge graph exactly what graphify's own code gave
// it: the same nodes in the same order, the same links, the same hubs and stats. The
// oracle below is the pre-extraction `graphViewInline` of server/github-graph.mjs,
// copied verbatim, run over the same fixture in graphify's shape.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { networkx, degrees } from '@meta-agentic/graph-model'
import { queryView } from './query.mjs'

function legacyGraphViewInline(g, { q, type, community, limit = 400 } = {}) {
  let nodes = g.nodes
  if (type) nodes = nodes.filter((n) => n.file_type === type)
  if (community != null && community !== '') nodes = nodes.filter((n) => n.community === +community)
  if (q) {
    const s = q.toLowerCase()
    nodes = nodes.filter((n) => (n.label ?? n.id).toLowerCase().includes(s) || n.id.includes(s))
  }
  const matched = nodes.length
  nodes = [...nodes].sort((a, b) => (g.degree.get(b.id) ?? 0) - (g.degree.get(a.id) ?? 0))
  const hubsByType = {}
  for (const n of nodes) {
    const t = n.file_type ?? 'concept'
    if ((hubsByType[t] ??= []).length < 3) {
      hubsByType[t].push({
        id: n.id, label: n.label ?? n.id, type: t, community: n.community ?? null,
        degree: g.degree.get(n.id) ?? 0, source: n.source_file ?? null,
      })
    }
  }
  const cap = Math.min(+limit || 400, 1000)
  const PER_TYPE = 30
  const picked = new Set()
  const byType = new Map()
  for (const n of nodes) {
    const t = n.file_type ?? 'concept'
    const arr = byType.get(t) ?? byType.set(t, []).get(t)
    if (arr.length < PER_TYPE) { arr.push(n); picked.add(n.id) }
  }
  const selection = [...byType.values()].flat()
  for (const n of nodes) {
    if (selection.length >= cap) break
    if (!picked.has(n.id)) selection.push(n)
  }
  nodes = selection.slice(0, cap)
  const keep = new Set(nodes.map((n) => n.id))
  const links = g.links
    .filter((l) => keep.has(l.source) && keep.has(l.target))
    .map((l) => ({ source: l.source, target: l.target, relation: l.relation, confidence: l.confidence }))
  return {
    mtime: g.mtime,
    stats: { matched, shown: nodes.length, totalNodes: g.nodes.length, totalLinks: g.links.length, communities: g.communities },
    hubsByType,
    nodes: nodes.map((n) => ({
      id: n.id, label: n.label ?? n.id, type: n.file_type ?? 'concept',
      community: n.community ?? null, degree: g.degree.get(n.id) ?? 0, source: n.source_file ?? null,
    })),
    links,
  }
}

// A deterministic fixture: 4 types, 3 communities, a skewed degree distribution, a
// handful of nodes sharing a label fragment so that search and type filters bite.
function fixture() {
  const types = ['code', 'document', 'concept', 'paper']
  const CONF = ['EXTRACTED', 'INFERRED', 'AMBIGUOUS']
  const nodes = []
  for (let i = 0; i < 180; i++) {
    const t = types[i % 4]
    nodes.push({ id: `${t}/n${i}`, label: i % 7 === 0 ? `shared ${i}` : `node ${i}`, file_type: t, community: i % 3, source_file: `f${i}.md` })
  }
  nodes.push({ id: 'untyped', label: 'untyped' })
  const links = []
  let s = 11
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647
  for (let i = 0; i < 700; i++) {
    const a = Math.floor(rnd() ** 2 * nodes.length), b = Math.floor(rnd() * nodes.length)
    if (a !== b) links.push({ source: nodes[a].id, target: nodes[b].id, relation: 'mentions', confidence: CONF[i % 3] })
  }
  return { nodes, links }
}

function legacyEntry(d) {
  const degree = new Map()
  for (const l of d.links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
  }
  return { mtime: 42, nodes: d.nodes, links: d.links, degree, communities: new Set(d.nodes.map((n) => n.community).filter((c) => c != null)).size }
}

function newEntry(d) {
  const model = networkx.parse(JSON.stringify(d), { id: 'kg', version: 42 })
  return { model, version: 42, degree: degrees(model) }
}

const CASES = [
  {},
  { limit: 50 },
  { type: 'paper' },
  { community: '1' },
  { q: 'shared' },
  { q: 'SHARED', type: 'code', community: '0', limit: 10 },
  { q: 'node 1', limit: 2000 },
]

for (const opts of CASES) {
  test(`same view as graphify's own code for ${JSON.stringify(opts)}`, () => {
    const d = fixture()
    const want = legacyGraphViewInline(legacyEntry(d), opts)
    const got = queryView(newEntry(d), { ...opts, group: opts.community })

    assert.equal(got.version, want.mtime)
    assert.deepEqual(got.stats, {
      matched: want.stats.matched, shown: want.stats.shown, totalNodes: want.stats.totalNodes,
      totalEdges: want.stats.totalLinks, groups: want.stats.communities,
    })
    // Same nodes, same order (the layout is seeded by index, so order is part of the picture).
    const gotNodes = Object.entries(got.model.graph.nodes).map(([id, n]) => ({
      id, label: n.label, type: n.metadata.type, community: n.metadata.group, degree: n.metadata.degree, source: n.metadata.source,
    }))
    assert.deepEqual(gotNodes, want.nodes)
    // Same links, same order, with the confidence word kept for the style.
    assert.deepEqual(
      got.model.graph.edges.map((e) => ({ source: e.source, target: e.target, relation: e.relation, confidence: e.metadata.confidenceLabel })),
      want.links,
    )
    // Same hubs per type (the hubs table).
    const gotHubs = Object.fromEntries(Object.entries(got.hubsByType).map(([t, hs]) => [t, hs.map((h) => ({ ...h, community: h.group, group: undefined }))]))
    for (const t of Object.keys(want.hubsByType)) {
      assert.deepEqual(gotHubs[t].map(({ group, ...h }) => h), want.hubsByType[t])
    }
    assert.deepEqual(Object.keys(gotHubs), Object.keys(want.hubsByType))
  })
}

test('the view is itself a canonical model that records the query it answers', () => {
  const got = queryView(newEntry(fixture()), { type: 'code', limit: 5 })
  assert.equal(got.model.graph.metadata.profile, 'meta-graph/1')
  assert.deepEqual(got.model.graph.metadata.view, { q: '', type: 'code', group: '', limit: 5 })
  assert.equal(Object.keys(got.model.graph.nodes).length, 5)
  for (const e of got.model.graph.edges) {
    assert.ok(e.source in got.model.graph.nodes && e.target in got.model.graph.nodes)
  }
})
