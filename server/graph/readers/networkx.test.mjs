import { test } from 'node:test'
import assert from 'node:assert/strict'
import { networkx } from './networkx.mjs'
import { detectReader, readerNames } from './index.mjs'
import { degrees, validateModel } from '../model.mjs'

const FIXTURE = JSON.stringify({
  directed: false, multigraph: false,
  nodes: [
    { id: 'src/a.py', label: 'a.py', file_type: 'code', community: 3, source_file: 'src/a.py', lines: 40 },
    { id: 'Concept: Ωmega', label: 'Ωmega', file_type: 'concept', community: 3 },
    { id: 'docs/x.md', file_type: 'document' },
    { id: 'lonely' },
  ],
  links: [
    { source: 'src/a.py', target: 'Concept: Ωmega', relation: 'mentions', confidence: 'EXTRACTED' },
    { source: 'docs/x.md', target: 'Concept: Ωmega', relation: 'mentions', confidence: 'INFERRED' },
    { source: 'docs/x.md', target: 'src/a.py', relation: 'links', confidence: 'AMBIGUOUS', weight: 2 },
    { source: 'docs/x.md', target: 'gone', relation: 'links' },
  ],
})

test('graphify keys map onto the profile and unknown keys pass through', () => {
  const m = validateModel(networkx.parse(FIXTURE, { id: 'kg', version: 7 }))
  assert.equal(m.graph.id, 'kg')
  assert.equal(m.graph.directed, false)
  assert.equal(m.graph.metadata.profile, 'meta-graph/1')
  assert.equal(m.graph.metadata.version, 7)
  assert.deepEqual(m.graph.nodes['src/a.py'], { label: 'a.py', metadata: { type: 'code', group: 3, source: 'src/a.py', lines: 40 } })
  assert.deepEqual(m.graph.nodes['docs/x.md'], { label: 'docs/x.md', metadata: { type: 'document', group: null, source: null } })
  assert.equal(m.graph.nodes['lonely'].metadata.type, 'concept')
  assert.equal(m.graph.nodes['Concept: Ωmega'].label, 'Ωmega')
})

test('confidence words become numbers and keep the word; a dangling link is dropped', () => {
  const m = networkx.parse(FIXTURE)
  assert.equal(m.graph.edges.length, 3)
  assert.deepEqual(m.graph.edges[0].metadata, { kind: 'mentions', confidence: 1, confidenceLabel: 'EXTRACTED' })
  assert.equal(m.graph.edges[1].metadata.confidence, 0.5)
  assert.deepEqual(m.graph.edges[2].metadata, { kind: 'links', confidence: 0.25, confidenceLabel: 'AMBIGUOUS', weight: 2 })
  assert.equal(m.graph.edges[2].relation, 'links')
})

test('degree counts both ends, as the knowledge graph always did', () => {
  const d = degrees(networkx.parse(FIXTURE))
  assert.equal(d.get('Concept: Ωmega'), 2)
  assert.equal(d.get('docs/x.md'), 2)
  assert.equal(d.get('src/a.py'), 2)
  assert.equal(d.get('lonely'), undefined)
})

test('the registry detects node-link JSON by shape or by hint, and names its readers', () => {
  assert.equal(detectReader(FIXTURE).name, 'networkx-node-link')
  assert.equal(detectReader('{"nodes":[],"edges":[]}').name, 'networkx-node-link')
  assert.equal(detectReader('garbage', 'networkx-node-link').name, 'networkx-node-link')
  assert.throws(() => detectReader('digraph G { a -> b }'), /no reader recognises/)
  assert.deepEqual(readerNames(), ['networkx-node-link'])
})

test('a model whose edge names an unknown node is refused with the path of the fault', () => {
  assert.throws(
    () => validateModel({ graph: { directed: false, nodes: { a: {} }, edges: [{ source: 'a', target: 'b' }] } }),
    /graph\.edges\[0\]\.target names an unknown node "b"/,
  )
})
