// Reader (ADR-MOS-18, part 2) for NetworkX node-link JSON, the format graphify writes
// to graphify-out/graph.json. Pure: text in, canonical model out, no I/O.
import { addEdge, addNode, emptyGraph } from '../model.mjs'

// graphify's edge confidences, as numbers for the profile; the original word is kept
// beside the number so a style can still map on it.
const CONFIDENCE = { EXTRACTED: 1, INFERRED: 0.5, AMBIGUOUS: 0.25 }

export const networkx = {
  name: 'networkx-node-link',

  /** True when the text is the format: JSON with a `nodes` array and a `links` or `edges` array. */
  detect(text, hint) {
    if (hint === 'networkx' || hint === 'graphify') return true
    const head = text.slice(0, 4096)
    return /^\s*\{/.test(head) && /"nodes"\s*:/.test(text) && /"(links|edges)"\s*:/.test(text)
  },

  parse(text, { id = 'graph', version = null } = {}) {
    const d = JSON.parse(text)
    const model = emptyGraph({ id, directed: d.directed === true, version, metadata: { reader: networkx.name, multigraph: d.multigraph === true } })
    for (const n of d.nodes ?? []) {
      const { id: nid, label, file_type, community, source_file, ...rest } = n
      addNode(model, nid, {
        label: label ?? nid,
        metadata: { type: file_type ?? 'concept', group: community ?? null, source: source_file ?? null, ...rest },
      })
    }
    for (const l of d.links ?? d.edges ?? []) {
      const { source, target, relation = null, confidence, ...rest } = l
      if (!(source in model.graph.nodes) || !(target in model.graph.nodes)) continue // a dangling link draws nothing
      addEdge(model, {
        source, target, relation,
        metadata: { kind: relation, confidence: CONFIDENCE[confidence] ?? null, confidenceLabel: confidence ?? null, ...rest },
      })
    }
    return model
  },
}
