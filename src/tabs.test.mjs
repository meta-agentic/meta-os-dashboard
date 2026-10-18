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
