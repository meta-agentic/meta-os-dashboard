// graphify's visual vocabulary as a style specification: what used to be TYPE_COLOR,
// CONF_OPACITY and radius() in the drawing code now belongs to the knowledge-graph
// widget alone. The drawing component reads the resolved accessors and nothing else.
export const TYPE_COLOR = {
  code: '#58a6ff', document: '#3fb950', paper: '#d29922',
  concept: '#bc8cff', rationale: '#f85149', image: '#8b949e',
}
const TYPE_LABEL = { paper: 'spike' } // display alias only — graph.json keeps graphify's vocabulary
export const typeLabel = (t) => TYPE_LABEL[t] ?? t

export const graphifyStyle = {
  node: {
    color: { by: 'type', map: TYPE_COLOR, default: '#8b949e' },
    size: { by: 'degree', base: 3, scale: 'sqrt', max: 14 }, // node size = degree
    label: { by: 'label' },
  },
  edge: {
    stroke: '#30363d',
    opacity: { by: 'confidenceLabel', map: { EXTRACTED: 0.7, INFERRED: 0.35, AMBIGUOUS: 0.15 }, default: 0.3 },
  },
  legend: { by: 'type', alias: TYPE_LABEL },
}
