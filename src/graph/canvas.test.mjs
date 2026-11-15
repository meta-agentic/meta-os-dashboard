// GraphCanvas and GraphList mounted in jsdom: the drawing shows the style's colours
// (MOS-321 AC2, the colour half), the list is the same graph as text and reachable by
// keyboard (AC5), and a click on a node reaches the host.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { loadWidgets } from '../test-support/mount.mjs'
import { forceLayout } from './layout/force.js'
import { resolveStyle } from './style.js'
import { graphifyStyle, TYPE_COLOR } from '../widgets/graph/graphifyStyle.js'
import { fixture } from './force.test.mjs'

const flush = () => new Promise((r) => setTimeout(r, 20))
const mod = await loadWidgets(['graph/GraphCanvas.jsx', 'graph/GraphList.jsx'])
after(() => mod.close())

const { model } = fixture(24, 30)
const style = resolveStyle(graphifyStyle)
const geometry = forceLayout(model, { size: style.nodeSize })

async function mount(Component, props) {
  const { React, createRoot, act } = mod
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(React.createElement(Component, props)); await flush() })
  return { el, act }
}

test('the canvas draws every node in its type colour and every edge at its confidence opacity', async () => {
  const labelled = new Set(Object.keys(model.graph.nodes).slice(0, 5))
  const { el } = await mount(mod.W0, { model, geometry, style, labelFor: (n) => labelled.has(n.id) })
  const circles = [...el.querySelectorAll('circle')]
  assert.equal(circles.length, 24)
  const ids = Object.keys(model.graph.nodes)
  circles.forEach((c, i) => {
    const n = model.graph.nodes[ids[i]]
    assert.equal(c.getAttribute('fill'), TYPE_COLOR[n.metadata.type], `colour of ${ids[i]}`)
    assert.equal(+c.getAttribute('r'), Math.min(3 + Math.sqrt(n.metadata.degree), 14))
    assert.equal(+c.getAttribute('cx'), geometry.positions[ids[i]].x)
  })
  const lines = [...el.querySelectorAll('line')]
  assert.equal(lines.length, 30)
  const want = { EXTRACTED: '0.7', INFERRED: '0.35', AMBIGUOUS: '0.15' }
  lines.forEach((l, i) => assert.equal(l.getAttribute('stroke-opacity'), want[model.graph.edges[i].metadata.confidenceLabel]))
  assert.equal(el.querySelectorAll('text.graphlabel').length, 5)
  assert.match(el.querySelector('svg').getAttribute('aria-label'), /24 nodes and 30 edges/)
})

test('a click or Enter on a node reaches the host with the node; nodes are focusable', async () => {
  const clicked = []
  const { el, act } = await mount(mod.W0, { model, geometry, style, onNodeClick: (n) => clicked.push(n.id) })
  const g = el.querySelector('g.graphnode')
  assert.equal(g.getAttribute('tabindex'), '0')
  await act(async () => { g.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await flush() })
  await act(async () => { g.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush() })
  assert.deepEqual(clicked, [Object.keys(model.graph.nodes)[0], Object.keys(model.graph.nodes)[0]])
})

test('the list is the same graph as text: one focusable button per node, every edge named, collapsed by default', async () => {
  const clicked = []
  const { el, act } = await mount(mod.W1, { model, style, onNodeClick: (n) => clicked.push(n.id) })
  const details = el.querySelector('details.graphlist')
  assert.equal(details.open, false)
  assert.match(el.querySelector('summary').textContent, /24 nodes · 30 edges/)
  const buttons = [...el.querySelectorAll('button.graphlist-node')]
  assert.equal(buttons.length, 24)
  assert.ok(buttons.every((b) => b.tabIndex === 0), 'every node button is in the tab order')
  assert.equal(el.querySelectorAll('.graphlist-edges li').length, 30)
  assert.match(buttons[0].textContent, /degree \d+/)
  await act(async () => { buttons[3].click(); await flush() })
  assert.deepEqual(clicked, [Object.keys(model.graph.nodes)[3]])
})
