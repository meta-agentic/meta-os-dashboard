// The graphify knowledge graph over GitHub — instance graph only (project graphs need
// local paths). The GitHub repository is just another source; one reader and one query
// serve it and the local file alike.
import { githubFile, loadModel } from './graph/sources.mjs'
import { queryView } from './graph/query.mjs'

const GRAPH_FILE = 'graphify-out/graph.json'

export async function graphSources(ctx) {
  const sources = []
  try {
    await ctx.instance.ensureTree()
    if (ctx.instance.hasPath(GRAPH_FILE)) {
      const st = await ctx.instance.statPath(GRAPH_FILE)
      sources.push({ name: ctx.instance.repo, file: GRAPH_FILE, bytes: st.size })
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
  const entry = await loadModel(githubFile(ctx.instance, src.file, { format: 'networkx-node-link' }), { id: src.name })
  return queryView(entry, opts)
}
