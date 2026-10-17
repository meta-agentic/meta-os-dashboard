import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUADRANTS, placementOf, quadrantOf } from './estimate.js'

// The backlog CLI's classification, transcribed: intension > 0 is complex, extension > 0
// is broad, so an axis value of exactly 0 is on the low side. The widget must name the
// same quadrant for every combination of signs, the boundary included.
function cli(extension, intension) {
  if (intension > 0) return extension > 0 ? 'complex + broad' : 'complex'
  return extension > 0 ? 'complicated' : 'simple'
}

const VALUES = [-1, -0.45, -0.01, 0, 0.01, 0.25, 1]

test('every sign combination, 0 included, agrees with the CLI', () => {
  for (const x of VALUES) {
    for (const y of VALUES) {
      assert.equal(quadrantOf(x, y), cli(x, y), `extension ${x}, intension ${y}`)
    }
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
