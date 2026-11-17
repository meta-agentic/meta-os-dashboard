// The generic query (ADR-MOS-18, part 5) over a canonical model: filter by type and
// group, text search, and a capped selection that keeps every type represented. It
// generalises what the knowledge graph did for graphify alone; the view it returns is
// itself a canonical model, small enough to lay out in a browser.
import { PROFILE } from '@meta-agentic/graph-model'

/** How many nodes of each type are guaranteed a place before the rest is filled by degree. */
const PER_TYPE = 30
const MAX_SHOWN = 1000
const HUBS_PER_TYPE = 3

export function queryView(entry, { q, type, group, limit = 400 } = {}) {
  const { model, version, degree } = entry
  const all = Object.entries(model.graph.nodes).map(([id, n]) => ({ id, label: n.label ?? id, metadata: n.metadata ?? {} }))
  const deg = (n) => degree.get(n.id) ?? 0
  const typeOf = (n) => n.metadata.type ?? 'concept'

  let nodes = all
  if (type) nodes = nodes.filter((n) => typeOf(n) === type)
  if (group != null && group !== '') nodes = nodes.filter((n) => n.metadata.group != null && String(n.metadata.group) === String(group))
  if (q) {
    const s = q.toLowerCase()
    nodes = nodes.filter((n) => n.label.toLowerCase().includes(s) || n.id.includes(s))
  }
  const matched = nodes.length
  nodes = [...nodes].sort((a, b) => deg(b) - deg(a))

  // Hubs per type over the FULL filtered set, not the capped slice: a rare type would
  // never surface among the overall top-degree nodes.
  const hubsByType = {}
  for (const n of nodes) {
    const t = typeOf(n)
    if ((hubsByType[t] ??= []).length < HUBS_PER_TYPE) {
      hubsByType[t].push({ id: n.id, label: n.label, type: t, group: n.metadata.group ?? null, degree: deg(n), source: n.metadata.source ?? null })
    }
  }

  // Stratified selection: every type gets its top slice before the rest fills by degree,
  // otherwise a code-heavy graph renders as one colour.
  const cap = Math.min(+limit || 400, MAX_SHOWN)
  const picked = new Set()
  const byType = new Map()
  for (const n of nodes) {
    const t = typeOf(n)
    const arr = byType.get(t) ?? byType.set(t, []).get(t)
    if (arr.length < PER_TYPE) { arr.push(n); picked.add(n.id) }
  }
  const selection = [...byType.values()].flat()
  for (const n of nodes) {
    if (selection.length >= cap) break
    if (!picked.has(n.id)) selection.push(n)
  }
  const shown = selection.slice(0, cap)
  const keep = new Set(shown.map((n) => n.id))

  const viewNodes = {}
  for (const n of shown) viewNodes[n.id] = { label: n.label, metadata: { ...n.metadata, degree: deg(n) } }
  const edges = model.graph.edges
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, relation: e.relation ?? null, metadata: e.metadata ?? {} }))

  const groups = new Set(all.map((n) => n.metadata.group).filter((g) => g != null)).size
  return {
    available: true,
    version,
    stats: { matched, shown: shown.length, totalNodes: all.length, totalEdges: model.graph.edges.length, groups },
    hubsByType,
    model: {
      graph: {
        id: model.graph.id, directed: model.graph.directed,
        metadata: { ...model.graph.metadata, profile: PROFILE, version, view: { q: q ?? '', type: type ?? '', group: group ?? '', limit: cap } },
        nodes: viewNodes, edges,
      },
    },
  }
}
