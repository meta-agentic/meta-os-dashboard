import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUADRANTS, placementOf, quadrantOf } from './estimate.js'

// Expected quadrants, generated once by calling the backlog CLI's own classification
// function over every pair of axis values below (including -0 and exact 0 on each axis)
// and kept here as data, so this test checks the widget against the CLI's answers rather
// than against a second copy of the rule.
const CLI_TABLE = [
  [-1, -1, 'simple'],
  [-1, -0.5, 'simple'],
  [-1, -0, 'simple'],
  [-1, 0, 'simple'],
  [-1, 0.5, 'complex'],
  [-1, 1, 'complex'],
  [-0.5, -1, 'simple'],
  [-0.5, -0.5, 'simple'],
  [-0.5, -0, 'simple'],
  [-0.5, 0, 'simple'],
  [-0.5, 0.5, 'complex'],
  [-0.5, 1, 'complex'],
  [-0, -1, 'simple'],
  [-0, -0.5, 'simple'],
  [-0, -0, 'simple'],
  [-0, 0, 'simple'],
  [-0, 0.5, 'complex'],
  [-0, 1, 'complex'],
  [0, -1, 'simple'],
  [0, -0.5, 'simple'],
  [0, -0, 'simple'],
  [0, 0, 'simple'],
  [0, 0.5, 'complex'],
  [0, 1, 'complex'],
  [0.5, -1, 'complicated'],
  [0.5, -0.5, 'complicated'],
  [0.5, -0, 'complicated'],
  [0.5, 0, 'complicated'],
  [0.5, 0.5, 'complex + broad'],
  [0.5, 1, 'complex + broad'],
  [1, -1, 'complicated'],
  [1, -0.5, 'complicated'],
  [1, -0, 'complicated'],
  [1, 0, 'complicated'],
  [1, 0.5, 'complex + broad'],
  [1, 1, 'complex + broad'],
]

test('every sign combination, 0 and -0 included, agrees with the CLI', () => {
  assert.equal(CLI_TABLE.length, 36)
  for (const [x, y, expected] of CLI_TABLE) {
    assert.equal(quadrantOf(x, y), expected, `extension ${Object.is(x, -0) ? '-0' : x}, intension ${Object.is(y, -0) ? '-0' : y}`)
  }
})

test('the boundary falls on the low side', () => {
  const table = [
    [0, 0, 'simple'],
    [0, 0.5, 'complex'],
    [0.5, 0, 'complicated'],
    [0, -0.5, 'simple'],
    [-0.5, 0, 'simple'],
    [0.5, 0.5, 'complex + broad'],
  ]
  for (const [x, y, name] of table) assert.equal(quadrantOf(x, y), name, `(${x}, ${y})`)
})

test('bands and prescriptions per quadrant', () => {
  assert.deepEqual(
    Object.values(QUADRANTS).map((q) => [q.name, q.band, q.prescription]),
    [
      ['simple', '1–2', 'do it'],
      ['complicated', '3–5', 'split by extension'],
      ['complex', '5', 'time-box as a spike'],
      ['complex + broad', '8', 'do not commit unsplit'],
    ],
  )
})

test('absent or incomplete is not placed; (0, 0) is a real placement', () => {
  assert.equal(placementOf(null), null)
  assert.equal(placementOf(undefined), null)
  assert.equal(placementOf({ extension: null, intension: 0.2 }), null)
  assert.equal(placementOf({ extension: 0.2 }), null)
  assert.equal(placementOf({ extension: 2, intension: 0 }), null)
  assert.equal(placementOf({ extension: '0.2', intension: 0 }), null)
  const origin = placementOf({ extension: 0, intension: 0 })
  assert.equal(origin.quadrant.name, 'simple')
  assert.equal(placementOf({ extension: 0.25, intension: -0.45 }).quadrant.name, 'complicated')
})
