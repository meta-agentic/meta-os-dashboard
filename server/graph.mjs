// The graphify knowledge graph over local files: the sources are enumerated here, the
// reading, parsing and querying are the generic graph layers in server/graph/.
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadModel, localFile } from './graph/sources.mjs'
import { queryView } from './graph/query.mjs'

const GRAPH_FILE = 'graphify-out/graph.json'

// Candidate graphs: instance root + every registry project path.
export async function graphSources(instanceRoot, projects) {
  const candidates = [
    { name: path.basename(instanceRoot), root: instanceRoot },
    ...projects.map((p) => ({ name: p.name, root: p.path ?? '' })),
  ]
  const sources = []
  for (const c of candidates) {
    try {
      const st = await fs.stat(path.join(c.root, GRAPH_FILE))
      sources.push({ name: c.name, root: c.root, file: path.join(c.root, GRAPH_FILE), bytes: st.size })
    } catch { /* no graph for this project */ }
  }
  return { available: sources.length > 0, reason: sources.length ? undefined : 'no graphify-out/graph.json found — run graphify over a repo first', sources }
}

/** The view of one enumerated source: a canonical model, hubs and stats. */
export async function graphView(src, opts) {
  const entry = await loadModel(localFile(src.root, GRAPH_FILE, { format: 'networkx-node-link' }), { id: src.name })
  return queryView(entry, opts)
}
