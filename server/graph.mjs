// Graphify graph feed. graph.json is NetworkX node-link JSON (nodes + `links`), can be
// tens of MB — parse once per mtime, cache in memory, and serve degree-ranked filtered
// subgraphs small enough to force-layout in the browser.
import fs from 'node:fs/promises'
import path from 'node:path'

const cache = new Map()

async function load(file) {
  const mtime = (await fs.stat(file)).mtimeMs
  const hit = cache.get(file)
  if (hit?.mtime === mtime) return hit
  const d = JSON.parse(await fs.readFile(file, 'utf8'))
  const links = d.links ?? d.edges ?? []
  const degree = new Map()
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
  }
  const entry = {
    mtime,
    nodes: d.nodes ?? [],
    links,
    degree,
    communities: new Set((d.nodes ?? []).map((n) => n.community).filter((c) => c != null)).size,
  }
  cache.set(file, entry)
  return entry
}

// Candidate graphs: instance root + every registry project path.
export async function graphSources(instanceRoot, projects) {
  const candidates = [
    { name: path.basename(instanceRoot), file: path.join(instanceRoot, 'graphify-out/graph.json') },
    ...projects.map((p) => ({ name: p.name, file: path.join(p.path ?? '', 'graphify-out/graph.json') })),
  ]
  const sources = []
  for (const c of candidates) {
    try {
      const st = await fs.stat(c.file)
      sources.push({ name: c.name, file: c.file, bytes: st.size })
    } catch { /* no graph for this project */ }
  }
  return { available: sources.length > 0, reason: sources.length ? undefined : 'no graphify-out/graph.json found — run graphify over a repo first', sources }
}

export async function graphView(file, { q, type, community, limit = 400 } = {}) {
  const g = await load(file)
  let nodes = g.nodes
  if (type) nodes = nodes.filter((n) => n.file_type === type)
  if (community != null && community !== '') nodes = nodes.filter((n) => n.community === +community)
  if (q) {
    const s = q.toLowerCase()
    nodes = nodes.filter((n) => (n.label ?? n.id).toLowerCase().includes(s) || n.id.includes(s))
  }
  const matched = nodes.length
  nodes = [...nodes].sort((a, b) => (g.degree.get(b.id) ?? 0) - (g.degree.get(a.id) ?? 0))

  // Per-category hubs over the FULL filtered set, not the top-N slice — rare types
  // (papers, images) would never surface among the overall top-degree nodes.
  const hubsByType = {}
  for (const n of nodes) {
    const t = n.file_type ?? 'concept'
    ;(hubsByType[t] ??= []).length < 3 &&
      hubsByType[t].push({
        id: n.id,
        label: n.label ?? n.id,
        type: t,
        community: n.community ?? null,
        degree: g.degree.get(n.id) ?? 0,
        source: n.source_file ?? null,
      })
  }

  // Stratified selection: guarantee every node type its top slice before filling the
  // rest by overall degree — otherwise a code-heavy graph renders as one color because
  // no document/concept/rationale node survives the global degree cut.
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
    available: true,
    mtime: g.mtime, // lets the client skip re-layout (and detect real changes) on polls
    stats: { matched, shown: nodes.length, totalNodes: g.nodes.length, totalLinks: g.links.length, communities: g.communities },
    hubsByType,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      type: n.file_type ?? 'concept',
      community: n.community ?? null,
      degree: g.degree.get(n.id) ?? 0,
      source: n.source_file ?? null,
    })),
    links,
  }
}
