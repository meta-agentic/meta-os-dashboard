// The 35-query corpus, each written in the algebra and checked against an answer that
// was derived by hand on the fixture BEFORE the evaluator ran (see the spike's README
// for the derivations and for the two places where the hand and the machine disagreed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from './algebra.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'))
const F1 = A.graph(load('f1-dag.json')), F1v2 = load('f1-dag-v2.json')
const F2 = A.graph(load('f2-undirected.json'))
const F3 = A.graph(load('f3-cycles.json'))
const F4 = A.graph(load('f4-weighted.json'))

const E = (g, i) => `${g.edges[i].source}${g.directed ? '>' : '-'}${g.edges[i].target}`
const Es = (g, idx) => idx.map((i) => E(g, i))
const st = (n) => n.metadata.status
const DONE_OR_CLOSED = (s) => s === 'DONE' || s === 'NO GO'

test('q1 sources and sinks', () => {
  // Hand said ['C', 'G']; the machine was right: B depends on G, so G has an incoming edge.
  assert.deepEqual(A.nodes(F1, (n) => A.indeg(F1, n.id) === 0), ['C'])
  assert.deepEqual(A.nodes(F1, (n) => A.outdeg(F1, n.id) === 0), ['E1', 'E2'])
  assert.deepEqual(A.nodes(F3, (n) => A.indeg(F3, n.id) === 0), ['U', 'Z'])
  assert.deepEqual(A.nodes(F3, (n) => A.outdeg(F3, n.id) === 0), ['W', 'Z'])
})

test('q2 label pattern and degree', () => {
  assert.deepEqual(A.nodes(F4, (n) => A.labelStartsWith(F4, n.id, 'ADR-') && A.deg(F4, n.id) >= 5), ['hub'])
})

test('q3 top weighted degree (plain degree when unweighted)', () => {
  assert.deepEqual(A.topk(F1.ids, (id) => A.wdeg(F1, id), 10), ['B', 'D', 'C', 'G', 'H', 'E1', 'A', 'E2', 'E3', 'F'])
  assert.deepEqual(A.topk(F2.ids, (id) => A.wdeg(F2, id), 10), ['n3', 'n4', 'n6', 'n1', 'n2', 'n5', 'n9', 'n7', 'n8', 'n10'])
  assert.deepEqual(A.topk(F4.ids, (id) => A.wdeg(F4, id), 10), ['p2', 'p1', 'p3', 'L', 'hub', 'k3', 'k4', 'k2', 'memo', 'k1'])
})

test('q4 isolated nodes', () => {
  assert.deepEqual(A.nodes(F2, (n) => A.deg(F2, n.id) === 0), ['n11'])
  assert.deepEqual(A.nodes(F3, (n) => A.deg(F3, n.id) === 0), ['Z'])
})

test('q5 bounded reach, direction from the graph', () => {
  const r = A.reach(F1, ['G'], { dir: 'out', depth: 3 }); r.delete('G')
  assert.deepEqual(Object.fromEntries([...r].sort()), { D: 1, E1: 3, E2: 1, E3: 2, F: 1, H: 2 })
  const u = A.reach(F2, ['n1'], { depth: 3 }); u.delete('n1')
  assert.deepEqual(Object.fromEntries([...u].sort()), { n2: 1, n3: 1, n4: 2, n5: 3, n6: 3 })
})

test('q6 common ancestors and the nearest', () => {
  const toA = A.reach(F1, ['A'], { dir: 'in' }), toH = A.reach(F1, ['H'], { dir: 'in' })
  const common = A.inter(A.minus([...toA.keys()], ['A']), A.minus([...toH.keys()], ['H']))
  assert.deepEqual(common, ['B', 'C'])
  const sum = (id) => toA.get(id) + toH.get(id)
  const best = Math.min(...common.map(sum))
  assert.deepEqual(common.filter((id) => sum(id) === best), ['B', 'C']) // a tie, sum 3 each
})

test('q7 DONE with a predecessor that is not DONE', () => {
  assert.deepEqual(A.nodes(F1, (n) => st(n) === 'DONE' && A.any(A.neighbours(F1, n.id, 'in'), (p) => st(F1.nodes.get(p)) !== 'DONE')), ['A', 'D', 'H'])
})

test('q8 articulation points', () => {
  assert.deepEqual(A.articulationPoints(F2), ['n3', 'n4', 'n6', 'n9'])
  assert.deepEqual(A.articulationPoints(F4), ['hub', 'p2'])
})

test('q9 edges across groups', () => {
  const idx = A.edges(F1, (e) => F1.nodes.get(e.source).metadata.group !== F1.nodes.get(e.target).metadata.group)
  assert.deepEqual(Es(F1, idx), ['B>D', 'D>H', 'B>G'])
})

test('q10 edges above the 90th percentile of weight', () => {
  const p1 = A.percentile(F1.edges.map((e) => e.w), 0.9)
  assert.equal(p1, 3)
  assert.deepEqual(Es(F1, A.edges(F1, (e) => e.w > p1)), ['B>D'])
  const p4 = A.percentile(F4.edges.map((e) => e.w), 0.9)
  assert.equal(p4, 9)
  assert.deepEqual(Es(F4, A.edges(F4, (e) => e.w > p4)), ['L-p2'])
})

test('q11 edges on a cycle', () => {
  assert.deepEqual(A.cycleEdges(F3), [0, 1, 2, 4, 5, 6])
  assert.deepEqual(A.cycleEdges(F1), [])
})

test('q12 bridges', () => {
  assert.deepEqual(Es(F2, A.bridges(F2)), ['n3-n4', 'n6-n7', 'n8-n9', 'n9-n10'])
  assert.deepEqual(Es(F4, A.bridges(F4)), ['L-p2'])
})

test('q13 edge relation plus endpoint property', () => {
  assert.deepEqual(Es(F1, A.edges(F1, (e) => e.relation === 'depends' && st(F1.nodes.get(e.target)) === 'NO GO')), ['G>F'])
})

test('q14 duplicate edges', () => {
  assert.deepEqual(A.duplicateEdges(F3), [[4, 6]])
  assert.deepEqual(A.duplicateEdges(F2), [])
})

test('q15 mutual edges and one-way edges', () => {
  assert.deepEqual(A.mutualEdges(F3), { mutual: [4, 5, 6], oneWay: [0, 1, 2, 3, 7, 8] })
})

test('q16 per IN PROGRESS node, its dependency edges to work not DONE', () => {
  const table = Object.fromEntries(A.nodes(F1, (n) => st(n) === 'IN PROGRESS').map((id) => [
    id, Es(F1, A.edges(F1, (e) => e.source === id && e.metadata.kind === 'dependency' && st(F1.nodes.get(e.target)) !== 'DONE')),
  ]))
  assert.deepEqual(table, { B: ['B>G'], E1: [], E3: [] })
})

test('q17 few but heavy ties', () => {
  assert.deepEqual(A.nodes(F4, (n) => A.deg(F4, n.id) < 3 && A.wdeg(F4, n.id) > 10), ['L'])
})

test('q18 each node\'s heaviest incident edge', () => {
  // Ties go to the lowest edge index (the declared rule); the first draft of this helper
  // walked edges out-before-in and broke it for F and E3. The helper was wrong, not the hand.
  const heaviest = (g, id) => [...A.incident(g, id)].sort((a, b) => a - b).reduce((b, i) => (b === null || g.edges[i].w > g.edges[b].w ? i : b), null)
  const table = Object.fromEntries(F1.ids.map((id) => { const i = heaviest(F1, id); const e = F1.edges[i]; return [id, [E(F1, i), e.source === id ? e.target : e.source]] }))
  assert.deepEqual(table, {
    A: ['B>A', 'B'], B: ['B>D', 'D'], C: ['C>H', 'H'], D: ['B>D', 'B'], F: ['G>F', 'G'],
    G: ['G>D', 'D'], H: ['C>H', 'C'], E1: ['A>E1', 'A'], E2: ['F>E2', 'F'], E3: ['D>E3', 'D'],
  })
})

test('q19 edge weight and both endpoints\' label', () => {
  const paper = (id) => F4.nodes.get(id).metadata.type === 'paper'
  // Hand listed three; the machine found four: L is a paper too, and L-p2 weighs 12.
  assert.deepEqual(Es(F4, A.edges(F4, (e) => e.w > 5 && paper(e.source) && paper(e.target))), ['p1-p2', 'p2-p3', 'p1-p3', 'L-p2'])
})

test('q20 components, largest first, and the one containing a node', () => {
  const comps = A.components(F2)
  assert.deepEqual(comps, [['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'], ['n8', 'n9', 'n10'], ['n11']])
  assert.deepEqual(comps.find((c) => c.includes('n5')), comps[0])
})

test('q21 strongly connected components with more than one node', () => {
  assert.deepEqual(A.scc(F3).filter((c) => c.length > 1), [['P', 'Q', 'R'], ['S', 'T']])
})

test('q22 shortest path: hops when unweighted, weight when weighted', () => {
  assert.deepEqual(A.shortestPath(F1, 'C', 'D'), { path: ['C', 'B', 'G', 'D'], length: 4 })
  assert.deepEqual(A.shortestPath(F2, 'n1', 'n7'), { path: ['n1', 'n3', 'n4', 'n6', 'n7'], length: 4 })
  assert.deepEqual(A.shortestPath(F3, 'P', 'T'), { path: ['P', 'Q', 'R', 'S', 'T'], length: 4 })
  assert.deepEqual(A.shortestPath(F4, 'k1', 'p3'), { path: ['k1', 'hub', 'k4', 'memo', 'p3'], length: 5 })
})

test('q23 downstream closure along one edge kind, as a graph with depth', () => {
  const m = A.closureGraph(F1, 'C', { dir: 'out', kind: 'dependency' })
  assert.deepEqual(Object.fromEntries(Object.entries(m.graph.nodes).map(([id, n]) => [id, n.metadata.depth])), { C: 0, B: 1, H: 1, A: 2, D: 2, G: 2, F: 3 })
  assert.equal(m.graph.edges.length, 8)
  assert.ok(m.graph.edges.every((e) => e.metadata.kind === 'dependency'))
})

test('q24 the 2-core', () => {
  assert.deepEqual(A.kcore(F2, 2), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'])
  assert.deepEqual(A.kcore(F4, 2), ['hub', 'k1', 'k2', 'k3', 'k4', 'memo', 'p1', 'p2', 'p3'])
})

test('q25 minimum spanning tree', () => {
  const t = A.mst(F4)
  assert.deepEqual(t.edges, [0, 2, 3, 4, 5, 8, 10, 11, 12])
  assert.equal(t.weight, 29)
})

test('q26 the critical path of a DAG by node weight', () => {
  // Hand extended the path through E1 (weight 0); both read 20. Rule adopted: the critical
  // path ends at the last node that adds weight, so trailing zero-weight nodes are not on it.
  assert.deepEqual(A.longestPathDAG(F1), { path: ['C', 'B', 'G', 'D', 'H'], weight: 20 })
})

test('q27 quotient graph by a key', () => {
  const q1 = A.quotient(F1, 'group')
  assert.deepEqual(q1.graph.nodes, { alpha: { label: 'alpha', metadata: { members: 5, within: 7 } }, beta: { label: 'beta', metadata: { members: 5, within: 6 } } })
  assert.deepEqual(q1.graph.edges.map((e) => [e.source, e.target, e.metadata.weight]), [['alpha', 'beta', 2], ['beta', 'alpha', 1]])
  const q4 = A.quotient(F4, 'type')
  assert.deepEqual(q4.graph.edges.map((e) => [e.source, e.target, e.metadata.weight]), [['concept', 'document', 5], ['document', 'paper', 2]])
  assert.deepEqual(Object.fromEntries(Object.entries(q4.graph.nodes).map(([k, n]) => [k, n.metadata])), { document: { members: 2, within: 0 }, concept: { members: 4, within: 2 }, paper: { members: 4, within: 4 } })
})

test('q28 a closure inside a predicate', () => {
  assert.deepEqual(A.nodes(F1, (n) => st(n) === 'TO DO' && A.any(A.reachSet(F1, [n.id], { dir: 'out', kind: 'dependency' }), (d) => st(F1.nodes.get(d)) === 'NO GO')), ['C', 'G'])
})

test('q29 the most central node of each large component', () => {
  const top = (g, comp) => { const b = A.betweenness(A.graph(A.induced(g, comp))); return A.topk(comp, (id) => b.get(id), 1)[0] }
  assert.deepEqual(A.components(F2).filter((c) => c.length > 5).map((c) => top(F2, c)), ['n4'])
  assert.deepEqual(A.components(F4).filter((c) => c.length > 5).map((c) => top(F4, c)), ['hub'])
})

test('q30 a rollup inside a predicate; a join by id across graphs', () => {
  const epics = A.nodes(F1, (n) => n.metadata.type === 'epic')
  const items = (e) => A.reachSet(F1, [e], { dir: 'in', kind: 'child' }).filter((id) => F1.nodes.get(id).metadata.type !== 'epic')
  const ready = epics.filter((e) => st(F1.nodes.get(e)) !== 'DONE' && items(e).length > 0 && A.all(items(e), (i) => DONE_OR_CLOSED(st(F1.nodes.get(i)))))
  assert.deepEqual(ready, ['E3'])
  assert.deepEqual(A.joinDiffering(F1.model, F1v2, 'status'), ['B'])
})

test('q31 what changed between two versions', () => {
  assert.deepEqual(A.diff(F1.model, F1v2), {
    nodesAdded: ['K'], nodesRemoved: [],
    nodesChanged: [{ id: 'B', changes: { status: { from: 'IN PROGRESS', to: 'DONE' } } }],
    edgesAdded: ['K>C', 'K>E1'], edgesRemoved: ['D>H'],
    edgesChanged: [{ edge: 'B>D', changes: { weight: { from: 4, to: 5 } } }],
  })
})

test('q32 simple paths with a length bound and an avoided status', () => {
  assert.deepEqual(A.simplePaths(F1, 'C', 'D', { maxLen: 3, avoid: (n) => st(n) === 'NO GO' }), [['C', 'B', 'D'], ['C', 'B', 'G', 'D']])
})

test('q33 motifs: triangles; two predecessors from different groups', () => {
  assert.deepEqual(A.triangles(F4), [['hub', 'k1', 'k2'], ['hub', 'k3', 'k4'], ['p1', 'p2', 'p3']])
  assert.deepEqual(A.triangles(F2), [['n1', 'n2', 'n3'], ['n4', 'n5', 'n6']])
  const groups = (id) => new Set(A.neighbours(F1, id, 'in').map((p) => F1.nodes.get(p).metadata.group))
  assert.deepEqual(A.nodes(F1, (n) => groups(n.id).size >= 2), ['D', 'H'])
})

test('q34 dead ends: no sink reachable', () => {
  const sinks = new Set(A.nodes(F3, (n) => A.outdeg(F3, n.id) === 0))
  assert.deepEqual(A.nodes(F3, (n) => !sinks.has(n.id) && A.none(A.reachSet(F3, [n.id], { dir: 'out' }), (v) => sinks.has(v))), ['P', 'Q', 'R', 'S', 'T'])
})

test('q35 facts about the whole graph', () => {
  const facts = (g) => ({ acyclic: A.isAcyclic(g), connected: A.isConnected(g), bipartite: A.isBipartite(g), tree: A.isTree(g), components: A.components(g).length, ...A.diameter(g) })
  assert.deepEqual(facts(F1), { acyclic: true, connected: true, bipartite: false, tree: false, components: 1, diameter: 3, perComponent: [3] })
  assert.deepEqual(facts(F2), { acyclic: false, connected: false, bipartite: false, tree: false, components: 3, diameter: null, perComponent: [4, 2, 0] })
  // Hand said [4, 2, 0], walking P>Q>R>S>T along the arrows; a diameter is on the underlying
  // undirected graph, where R>P makes P-R-S-T three hops. The machine was right.
  assert.deepEqual(facts(F3), { acyclic: false, connected: false, bipartite: false, tree: false, components: 3, diameter: null, perComponent: [3, 2, 0] })
  assert.deepEqual(facts(F4), { acyclic: false, connected: true, bipartite: false, tree: false, components: 1, diameter: 4, perComponent: [4] })
})
