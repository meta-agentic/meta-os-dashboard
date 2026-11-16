// A throwaway evaluator for the graph query algebra: evidence for the spike, not the
// product. Every operator is a pure function over a canonical graph model (JGF v2,
// profile meta-graph/1) or over the sets, paths and tables other operators return.
//
// The three semantic rules of the corpus hold throughout:
//   - direction belongs to the graph: on an undirected graph in/out/any are the same;
//   - an edge weighs metadata.weight, or 1 when it has none;
//   - a missing property makes a predicate false, never an error.
//
// Sets of nodes are arrays of ids in model order; sets of edges are arrays of edge
// indices; a graph-valued result is a canonical model again.

export const collate = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })
export const sortIds = (ids) => [...ids].sort(collate)

// ---------- the graph context ----------

export function graph(model) {
  const g = model.graph
  const ids = Object.keys(g.nodes)
  const nodes = new Map(ids.map((id) => [id, { id, label: g.nodes[id].label ?? id, metadata: g.nodes[id].metadata ?? {} }]))
  const edges = g.edges.map((e, index) => ({ index, source: e.source, target: e.target, relation: e.relation ?? null, metadata: e.metadata ?? {}, w: Number(e.metadata?.weight ?? 1) }))
  const out = new Map(ids.map((id) => [id, []]))
  const inn = new Map(ids.map((id) => [id, []]))
  for (const e of edges) { out.get(e.source).push(e.index); inn.get(e.target).push(e.index) }
  return { model, directed: g.directed === true, ids, nodes, edges, out, inn }
}

const node = (g, id) => g.nodes.get(id)
const prop = (g, id, key) => (key === 'id' ? id : key === 'label' ? node(g, id).label : node(g, id).metadata[key])
const other = (e, id) => (e.source === id ? e.target : e.source)

/** Edge indices incident to `id` in a direction; on an undirected graph every direction is 'any'. */
export function incident(g, id, dir = 'any') {
  if (!g.directed || dir === 'any') return [...new Set([...g.out.get(id), ...g.inn.get(id)])]
  return dir === 'out' ? g.out.get(id) : g.inn.get(id)
}
export const deg = (g, id) => incident(g, id, 'any').length
export const indeg = (g, id) => (g.directed ? g.inn.get(id).length : deg(g, id))
export const outdeg = (g, id) => (g.directed ? g.out.get(id).length : deg(g, id))
export const wdeg = (g, id) => incident(g, id, 'any').reduce((s, i) => s + g.edges[i].w, 0)
export const neighbours = (g, id, dir = 'any') => sortIds(new Set(incident(g, id, dir).map((i) => other(g.edges[i], id))))

// ---------- selectors ----------

export const nodes = (g, pred = () => true) => g.ids.filter((id) => pred(node(g, id), g))
export const edges = (g, pred = () => true) => g.edges.filter((e) => pred(e, g)).map((e) => e.index)
export const has = (g, id, key, value) => prop(g, id, key) === value
export const labelStartsWith = (g, id, prefix) => String(node(g, id).label ?? '').startsWith(prefix)
export const edgeOf = (g, i) => g.edges[i]

// ---------- set algebra and quantifiers ----------

export const union = (...sets) => sortIds(new Set(sets.flat()))
export const inter = (a, b) => { const s = new Set(b); return sortIds(a.filter((x) => s.has(x))) }
export const minus = (a, b) => { const s = new Set(b); return sortIds(a.filter((x) => !s.has(x))) }
export const all = (xs, p) => xs.every(p)
export const any = (xs, p) => xs.some(p)
export const none = (xs, p) => !xs.some(p)

// ---------- aggregates ----------

/** Nearest-rank percentile: the value at rank ceil(q·n) of the sorted sample. */
export function percentile(values, q) {
  const s = [...values].sort((a, b) => a - b)
  if (!s.length) return null
  return s[Math.max(0, Math.ceil(q * s.length) - 1)]
}
/** Top k by a score, ties broken by id with numeric collation. */
export const topk = (ids, score, k) => [...ids].sort((a, b) => score(b) - score(a) || collate(a, b)).slice(0, k)
export function groupBy(items, key) {
  const m = new Map()
  for (const x of items) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x) }
  return m
}

// ---------- neighbourhood and reach ----------

/**
 * Breadth-first reach from the seeds: Map id -> distance (seeds at 0). `dir` is
 * 'out' | 'in' | 'any' (meaningless on an undirected graph), `depth` bounds the hops,
 * `kind` keeps only edges whose metadata.kind matches.
 */
export function reach(g, seeds, { dir = 'out', depth = Infinity, kind } = {}) {
  const dist = new Map(seeds.map((s) => [s, 0]))
  let frontier = [...seeds]
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next = []
    for (const u of frontier) {
      for (const i of incident(g, u, dir)) {
        const e = g.edges[i]
        if (kind && e.metadata.kind !== kind) continue
        const v = g.directed && dir !== 'any' ? (dir === 'out' ? e.target : e.source) : other(e, u)
        if (!dist.has(v)) { dist.set(v, d); next.push(v) }
      }
    }
    frontier = next
  }
  return dist
}
export const reachSet = (g, seeds, opts) => minus(sortIds(reach(g, seeds, opts).keys()), seeds)

// ---------- structure: components, SCC, cut vertices, bridges ----------

/** Weakly connected components, largest first, then by smallest id. */
export function components(g) {
  const seen = new Set(); const comps = []
  for (const s of g.ids) {
    if (seen.has(s)) continue
    const comp = [...reach(g, [s], { dir: 'any' }).keys()]
    comp.forEach((x) => seen.add(x)); comps.push(sortIds(comp))
  }
  return comps.sort((a, b) => b.length - a.length || collate(a[0], b[0]))
}

/** Tarjan's strongly connected components (every node its own on an undirected graph is meaningless, so only directed). */
export function scc(g) {
  let index = 0; const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = []
  const visit = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v)
    for (const i of g.out.get(v)) {
      const w = g.edges[i].target
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))) }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)))
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []; let w
      do { w = stack.pop(); on.delete(w); comp.push(w) } while (w !== v)
      out.push(sortIds(comp))
    }
  }
  for (const v of g.ids) if (!idx.has(v)) visit(v)
  return out.sort((a, b) => b.length - a.length || collate(a[0], b[0]))
}

// Hopcroft–Tarjan low-point DFS over the underlying undirected multigraph.
function lowpoint(g) {
  const disc = new Map(), low = new Map(), parentEdge = new Map()
  const points = new Set(), bridgeEdges = []
  let time = 0
  const dfs = (u) => {
    disc.set(u, time); low.set(u, time); time++
    let children = 0
    for (const i of incident(g, u, 'any')) {
      if (i === parentEdge.get(u)) continue
      const v = other(g.edges[i], u)
      if (!disc.has(v)) {
        parentEdge.set(v, i); children++
        dfs(v)
        low.set(u, Math.min(low.get(u), low.get(v)))
        if (low.get(v) > disc.get(u)) bridgeEdges.push(i)
        if (parentEdge.get(u) !== undefined && low.get(v) >= disc.get(u)) points.add(u)
      } else low.set(u, Math.min(low.get(u), disc.get(v)))
    }
    if (parentEdge.get(u) === undefined && children > 1) points.add(u)
  }
  for (const s of g.ids) if (!disc.has(s)) dfs(s)
  return { points: sortIds(points), bridges: bridgeEdges.sort((a, b) => a - b) }
}
export const articulationPoints = (g) => lowpoint(g).points
export const bridges = (g) => lowpoint(g).bridges

/** Edges on at least one cycle: in a directed graph, within one SCC (or a self-loop); undirected, every non-bridge. */
export function cycleEdges(g) {
  if (!g.directed) { const b = new Set(bridges(g)); return g.edges.filter((e) => !b.has(e.index) || e.source === e.target).map((e) => e.index) }
  const comp = new Map(), size = new Map()
  scc(g).forEach((c, k) => { size.set(k, c.length); c.forEach((v) => comp.set(v, k)) })
  return g.edges
    .filter((e) => e.source === e.target || (comp.get(e.source) === comp.get(e.target) && size.get(comp.get(e.source)) > 1))
    .map((e) => e.index)
}
/** Groups of edges sharing both endpoints (an unordered pair on an undirected graph). */
export function duplicateEdges(g) {
  const key = (e) => (g.directed ? `${e.source}>${e.target}` : [e.source, e.target].sort(collate).join('-'))
  return [...groupBy(g.edges, key).values()].filter((grp) => grp.length > 1).map((grp) => grp.map((e) => e.index))
}
/** Directed only: edges whose reverse exists, and the ones without one. */
export function mutualEdges(g) {
  const pairs = new Set(g.edges.map((e) => `${e.source}>${e.target}`))
  const mutual = g.edges.filter((e) => pairs.has(`${e.target}>${e.source}`)).map((e) => e.index)
  return { mutual, oneWay: g.edges.filter((e) => !pairs.has(`${e.target}>${e.source}`)).map((e) => e.index) }
}

// ---------- paths ----------

/** Dijkstra over edge weights (1 when absent, so it is BFS on an unweighted graph); forward on a directed graph. */
export function shortestPath(g, a, b, { weighted = true } = {}) {
  const dist = new Map([[a, 0]]), prev = new Map(), done = new Set()
  while (true) {
    let u = null
    for (const [v, d] of dist) if (!done.has(v) && (u === null || d < dist.get(u))) u = v
    if (u === null || u === b) break
    done.add(u)
    for (const i of incident(g, u, 'out')) {
      const e = g.edges[i], v = g.directed ? e.target : other(e, u), nd = dist.get(u) + (weighted ? e.w : 1)
      if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u) }
    }
  }
  if (!dist.has(b)) return null
  const path = [b]; while (path[0] !== a) path.unshift(prev.get(path[0]))
  return { path, length: dist.get(b) }
}
/** Every simple path a -> b of at most maxLen edges that avoids the `avoid` predicate. */
export function simplePaths(g, a, b, { maxLen = Infinity, avoid = () => false } = {}) {
  const out = []
  const walk = (u, path) => {
    if (u === b) { out.push([...path]); return }
    if (path.length - 1 >= maxLen) return
    for (const i of incident(g, u, 'out')) {
      const v = g.directed ? g.edges[i].target : other(g.edges[i], u)
      if (path.includes(v) || avoid(node(g, v))) continue
      path.push(v); walk(v, path); path.pop()
    }
  }
  if (!avoid(node(g, a))) walk(a, [a])
  return out
}
/** Longest path in a DAG by the sum of a node weight along it (0 when absent). */
export function longestPathDAG(g, weightOf = (n) => Number(n.metadata.weight ?? 0)) {
  const order = topoOrder(g)
  if (!order) return null
  const best = new Map(), next = new Map()
  for (const u of [...order].reverse()) {
    let bw = weightOf(node(g, u)), bn = null
    for (const i of g.out.get(u)) {
      const v = g.edges[i].target, w = weightOf(node(g, u)) + best.get(v)
      if (w > bw) { bw = w; bn = v }
    }
    best.set(u, bw); next.set(u, bn)
  }
  const start = [...best.entries()].sort((a, b) => b[1] - a[1] || collate(a[0], b[0]))[0][0]
  const path = [start]; while (next.get(path.at(-1))) path.push(next.get(path.at(-1)))
  return { path, weight: best.get(start) }
}
function topoOrder(g) {
  const indegree = new Map(g.ids.map((id) => [id, g.inn.get(id).length]))
  const q = g.ids.filter((id) => indegree.get(id) === 0), order = []
  while (q.length) {
    const u = q.shift(); order.push(u)
    for (const i of g.out.get(u)) { const v = g.edges[i].target; indegree.set(v, indegree.get(v) - 1); if (indegree.get(v) === 0) q.push(v) }
  }
  return order.length === g.ids.length ? order : null
}

// ---------- centrality, cores, trees, motifs, facts ----------

/** Brandes betweenness on hops, following the graph's direction. */
export function betweenness(g) {
  const cb = new Map(g.ids.map((id) => [id, 0]))
  for (const s of g.ids) {
    const S = [], P = new Map(g.ids.map((id) => [id, []])), sigma = new Map(g.ids.map((id) => [id, 0])), d = new Map(g.ids.map((id) => [id, -1]))
    sigma.set(s, 1); d.set(s, 0); const Q = [s]
    while (Q.length) {
      const v = Q.shift(); S.push(v)
      for (const i of incident(g, v, 'out')) {
        const w = g.directed ? g.edges[i].target : other(g.edges[i], v)
        if (d.get(w) < 0) { Q.push(w); d.set(w, d.get(v) + 1) }
        if (d.get(w) === d.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); P.get(w).push(v) }
      }
    }
    const delta = new Map(g.ids.map((id) => [id, 0]))
    while (S.length) {
      const w = S.pop()
      for (const v of P.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)))
      if (w !== s) cb.set(w, cb.get(w) + delta.get(w))
    }
  }
  if (!g.directed) for (const id of g.ids) cb.set(id, cb.get(id) / 2)
  return cb
}
/** The k-core: peel nodes of degree below k until none is left. */
export function kcore(g, k) {
  const alive = new Set(g.ids)
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...alive]) {
      const dgr = incident(g, id, 'any').filter((i) => alive.has(other(g.edges[i], id))).length
      if (dgr < k) { alive.delete(id); changed = true }
    }
  }
  return sortIds(alive)
}
/** Kruskal's minimum spanning forest over the underlying undirected graph; ties by edge index. */
export function mst(g) {
  const parent = new Map(g.ids.map((id) => [id, id]))
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)))
  const chosen = []
  for (const e of [...g.edges].sort((a, b) => a.w - b.w || a.index - b.index)) {
    const ra = find(e.source), rb = find(e.target)
    if (ra !== rb) { parent.set(ra, rb); chosen.push(e.index) }
  }
  return { edges: chosen.sort((a, b) => a - b), weight: chosen.reduce((s, i) => s + g.edges[i].w, 0) }
}
/** Every triangle of the underlying undirected simple graph, as sorted id triples. */
export function triangles(g) {
  const adj = new Map(g.ids.map((id) => [id, new Set(neighbours(g, id, 'any'))]))
  const out = []
  for (const a of g.ids) for (const b of adj.get(a)) if (collate(a, b) < 0) for (const c of adj.get(b)) if (collate(b, c) < 0 && adj.get(a).has(c)) out.push([a, b, c])
  return out
}
export const isAcyclic = (g) => (g.directed ? topoOrder(g) !== null : g.edges.length === g.ids.length - components(g).length && duplicateEdges(g).length === 0)
export const isConnected = (g) => components(g).length <= 1
export function isBipartite(g) {
  const colour = new Map()
  for (const s of g.ids) {
    if (colour.has(s)) continue
    colour.set(s, 0); const q = [s]
    while (q.length) {
      const u = q.shift()
      for (const v of neighbours(g, u, 'any')) {
        if (!colour.has(v)) { colour.set(v, 1 - colour.get(u)); q.push(v) }
        else if (colour.get(v) === colour.get(u)) return false
      }
    }
  }
  return true
}
export const isTree = (g) => isConnected(g) && isAcyclic(g) && (g.directed ? g.edges.length === g.ids.length - 1 : true)
/** Diameter in hops: null when disconnected; `perComponent` gives each component's own. */
export function diameter(g) {
  const ecc = (ids) => Math.max(...ids.map((s) => Math.max(...[...reach(g, [s], { dir: 'any' }).values()])))
  const comps = components(g)
  return { diameter: comps.length === 1 ? ecc(comps[0]) : null, perComponent: comps.map(ecc) }
}

// ---------- graph constructors: results that are graphs again ----------

function clone(g, ids, edgeIdx, meta = {}) {
  const keep = new Set(ids)
  const m = { graph: { id: g.model.graph.id, directed: g.directed, metadata: { ...g.model.graph.metadata, ...meta }, nodes: {}, edges: [] } }
  for (const id of g.ids) if (keep.has(id)) m.graph.nodes[id] = { label: node(g, id).label, metadata: { ...node(g, id).metadata } }
  for (const i of edgeIdx) { const e = g.edges[i]; if (keep.has(e.source) && keep.has(e.target)) m.graph.edges.push({ source: e.source, target: e.target, relation: e.relation, metadata: { ...e.metadata } }) }
  return m
}
/** G[S]: the subgraph induced by a node set. */
export const induced = (g, ids) => clone(g, ids, g.edges.map((e) => e.index), { view: 'induced' })
/** The subgraph induced by an edge set (its endpoints come along). */
export const edgeInduced = (g, edgeIdx) => clone(g, [...new Set(edgeIdx.flatMap((i) => [g.edges[i].source, g.edges[i].target]))], edgeIdx, { view: 'edge-induced' })
/** The closure of a seed as a graph, each node carrying its depth, edges restricted to the kind followed. */
export function closureGraph(g, seed, opts = {}) {
  const dist = reach(g, [seed], opts)
  const m = clone(g, [...dist.keys()], g.edges.filter((e) => !opts.kind || e.metadata.kind === opts.kind).map((e) => e.index), { view: 'closure', root: seed })
  for (const [id, d] of dist) m.graph.nodes[id].metadata.depth = d
  return m
}
/** G/~ : one node per value of a key; an edge between two classes weighs the number of crossing edges; `within` counts edges inside a class. */
export function quotient(g, key) {
  const cls = (id) => String(prop(g, id, key))
  const m = { graph: { id: `${g.model.graph.id}/${key}`, directed: g.directed, metadata: { profile: 'meta-graph/1', view: 'quotient', by: key }, nodes: {}, edges: [] } }
  for (const id of g.ids) { const c = cls(id); (m.graph.nodes[c] ??= { label: c, metadata: { members: 0, within: 0 } }).metadata.members++ }
  const acc = new Map()
  for (const e of g.edges) {
    const a = cls(e.source), b = cls(e.target)
    if (a === b) { m.graph.nodes[a].metadata.within++; continue }
    const k = g.directed ? `${a}>${b}` : [a, b].sort(collate).join('>')
    acc.set(k, (acc.get(k) ?? 0) + 1)
  }
  for (const [k, n] of [...acc].sort()) { const [a, b] = k.split('>'); m.graph.edges.push({ source: a, target: b, relation: 'crosses', metadata: { weight: n } }) }
  return m
}

// ---------- sets of graphs ----------

const edgeKey = (e) => `${e.source}>${e.target}`
export function diff(ma, mb) {
  const a = ma.graph, b = mb.graph
  const nodesAdded = Object.keys(b.nodes).filter((id) => !(id in a.nodes))
  const nodesRemoved = Object.keys(a.nodes).filter((id) => !(id in b.nodes))
  const nodesChanged = []
  for (const id of Object.keys(a.nodes)) {
    if (!(id in b.nodes)) continue
    const pa = a.nodes[id].metadata ?? {}, pb = b.nodes[id].metadata ?? {}
    const changes = {}
    for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) if (JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) changes[k] = { from: pa[k] ?? null, to: pb[k] ?? null }
    if ((a.nodes[id].label ?? id) !== (b.nodes[id].label ?? id)) changes.label = { from: a.nodes[id].label, to: b.nodes[id].label }
    if (Object.keys(changes).length) nodesChanged.push({ id, changes })
  }
  const ea = new Map(a.edges.map((e) => [edgeKey(e), e])), eb = new Map(b.edges.map((e) => [edgeKey(e), e]))
  const edgesAdded = [...eb.keys()].filter((k) => !ea.has(k))
  const edgesRemoved = [...ea.keys()].filter((k) => !eb.has(k))
  const edgesChanged = []
  for (const [k, e] of ea) {
    if (!eb.has(k)) continue
    const pa = e.metadata ?? {}, pb = eb.get(k).metadata ?? {}
    const changes = {}
    for (const p of new Set([...Object.keys(pa), ...Object.keys(pb)])) if (JSON.stringify(pa[p]) !== JSON.stringify(pb[p])) changes[p] = { from: pa[p] ?? null, to: pb[p] ?? null }
    if (Object.keys(changes).length) edgesChanged.push({ edge: k, changes })
  }
  return { nodesAdded: sortIds(nodesAdded), nodesRemoved: sortIds(nodesRemoved), nodesChanged, edgesAdded, edgesRemoved, edgesChanged }
}
/** Nodes present in both graphs whose `key` differs. */
export const joinDiffering = (ma, mb, key) => sortIds(Object.keys(ma.graph.nodes).filter((id) => id in mb.graph.nodes && (ma.graph.nodes[id].metadata?.[key] ?? null) !== (mb.graph.nodes[id].metadata?.[key] ?? null)))
