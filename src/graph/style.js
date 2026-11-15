// The style specification (ADR-MOS-18, part 6): a declarative mapping from a node's or
// edge's attributes to colour, size, label and stroke, resolved once into accessors the
// canvas and the list call. The legend is derived from it, never written by hand.
//
//   {
//     node:   { color: { by, map, default }, size: { by, base, scale: 'sqrt'|'linear', factor, max } | { value },
//               label: { by } },
//     edge:   { stroke: '#rgb' | { by, map, default }, opacity: 0.3 | { by, map, default } },
//     legend: { by, values, alias: { value: 'shown as' } },
//   }
//
// `by` names a profile key in `metadata`, or 'id', 'label' (nodes) and 'relation' (edges).

const FALLBACK_COLOR = '#8b949e'

const nodeValue = (n, by) => (by === 'id' ? n.id : by === 'label' ? n.label : n.metadata?.[by])
const edgeValue = (e, by) => (by === 'relation' ? e.relation : e.metadata?.[by])

function rule(r, value, fallback) {
  if (r == null) return fallback
  if (typeof r !== 'object') return r
  const v = r.by != null ? value(r.by) : undefined
  return r.map?.[v] ?? r.default ?? fallback
}

export function resolveStyle(spec = {}) {
  const node = spec.node ?? {}
  const edge = spec.edge ?? {}
  const legendSpec = spec.legend ?? {}
  const size = node.size ?? { value: 4 }
  const alias = legendSpec.alias ?? {}
  const legendKey = legendSpec.by ?? node.color?.by ?? null

  const nodeColor = (n) => rule(node.color, (by) => nodeValue(n, by), FALLBACK_COLOR)
  const nodeSize = (n) => {
    if (size.by == null) return size.value ?? 4
    const v = Number(nodeValue(n, size.by) ?? 0)
    const scaled = size.scale === 'linear' ? v : Math.sqrt(v)
    return Math.min((size.base ?? 0) + scaled * (size.factor ?? 1), size.max ?? Infinity)
  }
  const nodeLabel = (n) => String(nodeValue(n, node.label?.by ?? 'label') ?? n.id)
  const edgeStroke = (e) => rule(edge.stroke, (by) => edgeValue(e, by), 'currentColor')
  const edgeOpacity = (e) => rule(edge.opacity, (by) => edgeValue(e, by), 1)
  const valueLabel = (v) => alias[v] ?? String(v)
  const colorOf = (value) => node.color?.map?.[value] ?? node.color?.default ?? FALLBACK_COLOR

  /** Legend rows for the colour key: the spec's values, or the colour map's, or the ones given. */
  const legend = (values) => (values ?? legendSpec.values ?? Object.keys(node.color?.map ?? {}))
    .map((value) => ({ value, label: valueLabel(value), color: colorOf(value) }))

  return { spec, legendKey, nodeColor, nodeSize, nodeLabel, edgeStroke, edgeOpacity, valueLabel, colorOf, legend }
}
