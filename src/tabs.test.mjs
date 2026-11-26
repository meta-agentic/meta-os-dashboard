import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stackLayout } from './tabs.js'

test('stackLayout reads the grid top to bottom, then left to right, one widget per row', () => {
  const desktop = [
    { i: 'c', x: 0, y: 10, w: 12, h: 6 },
    { i: 'b', x: 4, y: 0, w: 4, h: 9 },
    { i: 'a', x: 0, y: 0, w: 4, h: 10 },
    { i: 'd', x: 8, y: 0, w: 4, h: 3 },
  ]
  const stacked = stackLayout(desktop)
  assert.deepEqual(stacked.map((l) => l.i), ['a', 'b', 'd', 'c'])
  assert.deepEqual(stacked.map((l) => [l.x, l.y, l.w, l.h]), [[0, 0, 12, 10], [0, 10, 12, 9], [0, 19, 12, 3], [0, 22, 12, 6]])
  assert.ok(stacked.every((l) => l.static))
})

test('stackLayout leaves the saved layout untouched', () => {
  const desktop = [{ i: 'a', x: 6, y: 2, w: 6, h: 4 }]
  const before = structuredClone(desktop)
  stackLayout(desktop)
  assert.deepEqual(desktop, before)
})

// The sprint and backlog views first, then Flow, then the rest.
import { GROUPS, tabsFor, reconcile, fromServerDoc, toServerDoc } from './tabs.js'

const widgetsIn = (groups) => groups.map((g, n) => ({ i: `w${n}`, group: g }))

test('tab order: sprint, backlog, flow, then the rest', () => {
  const all = widgetsIn(['operations', 'flow', 'questions', 'memory', 'backlog', 'sprint'])
  assert.deepEqual(tabsFor(all).map((t) => t.id), ['sprint', 'backlog', 'flow', 'questions', 'memory', 'operations'])
})

test('tab order: the PO questions tab comes right after flow', () => {
  const ids = GROUPS.map((g) => g.id)
  assert.equal(ids.indexOf('questions'), ids.indexOf('flow') + 1)
})

test('tab order: a group the list does not name gets a tab after every named one', () => {
  const tabs = tabsFor(widgetsIn(['zzz', 'flow', 'sprint']))
  assert.deepEqual(tabs.map((t) => t.id), ['sprint', 'flow', 'zzz'])
})

// A board saved before the reorder: keyed by group id, Flow active.
const SAVED = {
  kind: 'tabs',
  activeId: 'flow',
  boards: [
    { id: 'flow', layout: [{ i: 'flow', x: 0, y: 0, w: 12, h: 22 }] },
    { id: 'sprint', layout: [{ i: 'lanes', x: 5, y: 3, w: 7, h: 11 }, { i: 'report', x: 0, y: 3, w: 5, h: 6 }] },
  ],
}
const SIZES = { flow: { w: 12, h: 22, minW: 6, minH: 10 }, lanes: { w: 7, h: 11, minW: 4, minH: 6 }, report: { w: 8, h: 6, minW: 5, minH: 4 } }

test('saved layout: a board saved before the reorder keeps its active tab', () => {
  assert.equal(fromServerDoc(SAVED).activeId, 'flow')
})

test('saved layout: each tab keeps the positions it was saved with', () => {
  const { layouts } = fromServerDoc(SAVED)
  const sprint = reconcile(layouts.sprint, ['lanes', 'report'], SIZES)
  assert.deepEqual(sprint.map(({ i, x, y, w, h }) => [i, x, y, w, h]), [['lanes', 5, 3, 7, 11], ['report', 0, 3, 5, 6]])
})

test('saved layout: a round trip through the server document is unchanged', () => {
  assert.deepEqual(toServerDoc(fromServerDoc(SAVED)), SAVED)
})
