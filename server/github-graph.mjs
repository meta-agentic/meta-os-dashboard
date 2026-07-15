// Graphify feed over GitHub — instance graph only (project graphs need local paths).
const cache = new Map()

async function load(repo, filePath) {
  const key = `${repo.label()}:${filePath}`
  const mtime = await repo.lastCommitMs(filePath)
  const hit = cache.get(key)
  if (hit?.mtime === mtime) return hit
  const d = JSON.parse(await repo.readText(filePath))
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
  cache.set(key, entry)
  return entry
}

export async function graphSources(ctx) {
  const file = 'graphify-out/graph.json'
  const sources = []
  try {
    await ctx.instance.ensureTree()
    if (ctx.instance.hasPath(file)) {
      const st = await ctx.instance.statPath(file)
      sources.push({ name: ctx.instance.repo, file, bytes: st.size })
    }
  } catch { /* no graph */ }
  return {
    available: sources.length > 0,
    reason: sources.length ? undefined : 'no graphify-out/graph.json on instance repo — run graphify first',
    sources,
  }
}

export async function graphView(ctx, name, opts) {
  const { sources } = await graphSources(ctx)
  const src = sources.find((s) => s.name === name) ?? sources[0]
  if (!src) return { available: false, reason: 'no graphs found' }
  const g = await load(ctx.instance, src.file)
  return graphViewInline(g, opts)
}

function graphViewInline(g, { q, type, community, limit = 400 } = {}) {
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
    available: true,
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