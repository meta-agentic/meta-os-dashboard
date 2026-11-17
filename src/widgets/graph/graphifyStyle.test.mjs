// The knowledge graph's look, through the published drawing component: graphify's node
// types keep their colours, node size still follows degree, and edges keep their
// confidence opacities. The component's own golden tests live in meta-graph and run on a
// neutral style; this keeps graphify's vocabulary covered where it is defined.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveStyle } from '@meta-agentic/graph-react'
import { graphifyStyle, TYPE_COLOR, typeLabel } from './graphifyStyle.js'

const style = resolveStyle(graphifyStyle)
const node = (type, degree) => ({ id: 'n', label: 'n', metadata: { type, degree } })
const edge = (confidenceLabel) => ({ source: 'a', target: 'b', relation: 'mentions', metadata: { confidenceLabel } })

test('each graphify type keeps its colour; an unknown type falls back to grey', () => {
  for (const [type, colour] of Object.entries(TYPE_COLOR)) assert.equal(style.nodeColor(node(type, 1)), colour)
  assert.equal(style.nodeColor(node('unheard-of', 1)), '#8b949e')
})

test('node size is 3 + √degree, capped at 14, as before the extraction', () => {
  for (const d of [0, 1, 4, 9, 50, 400]) assert.equal(style.nodeSize(node('code', d)), Math.min(3 + Math.sqrt(d), 14))
})

test('edges keep their confidence opacities; the legend keeps the "spike" alias for papers', () => {
  assert.deepEqual(['EXTRACTED', 'INFERRED', 'AMBIGUOUS', undefined].map((c) => style.edgeOpacity(edge(c))), [0.7, 0.35, 0.15, 0.3])
  assert.equal(style.edgeStroke(edge('EXTRACTED')), '#30363d')
  const legend = style.legend(Object.keys(TYPE_COLOR))
  assert.equal(legend.find((r) => r.value === 'paper').label, 'spike')
  assert.equal(typeLabel('paper'), 'spike')
})
