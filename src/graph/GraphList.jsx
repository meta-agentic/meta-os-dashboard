// The text twin of a drawing (ADR-MOS-18, part 8): the same nodes and edges as a list,
// reachable by keyboard and readable by a screen reader. Collapsed by default so a card
// keeps its drawing in view; the summary says how much is behind it.
import React from 'react'
import { nodesOf, edgesOf } from './model.js'

export default function GraphList({ model, style, onNodeClick, open = false, summary = 'Nodes and edges as text' }) {
  const nodes = nodesOf(model)
  const edges = edgesOf(model)
  const label = (id) => { const n = model.graph.nodes[id]; return n ? style.nodeLabel({ id, ...n }) : id }
  const category = (n) => (style.legendKey ? n.metadata?.[style.legendKey] : undefined)
  return (
    <details className="graphlist" open={open}>
      <summary>{summary} · {nodes.length} nodes · {edges.length} edges</summary>
      <ol className="graphlist-nodes" aria-label="nodes">
        {nodes.map((n) => (
          <li key={n.id}>
            <button type="button" className="graphlist-node" onClick={(e) => onNodeClick?.(n, e)}>
              <span className="dot" style={{ background: style.nodeColor(n) }} aria-hidden="true" />
              <span className="graphlist-label">{style.nodeLabel(n)}</span>
              {category(n) != null && <span className="dim small"> {style.valueLabel(category(n))}</span>}
              {n.metadata?.degree != null && <span className="dim small"> · degree {n.metadata.degree}</span>}
            </button>
          </li>
        ))}
      </ol>
      <ol className="graphlist-edges" aria-label="edges">
        {edges.map((e, i) => (
          <li key={i}>
            <span className="graphlist-label">{label(e.source)}</span>
            <span aria-hidden="true"> {model.graph.directed ? '→' : '—'} </span>
            <span className="graphlist-label">{label(e.target)}</span>
            {e.relation && <span className="dim small"> {e.relation}</span>}
          </li>
        ))}
      </ol>
    </details>
  )
}
