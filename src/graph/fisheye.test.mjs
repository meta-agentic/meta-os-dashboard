// The fisheye must let the pointer reach a node (PO, 2026-11-15: with the old profile
// the repulsion was largest at the centre, so a node fled the pointer and its centre
// could never be reached). The push is zero under the pointer and at the lens edge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fisheyePush, fisheyeScale } from './behaviours/fisheye.js'

const R = 64, MAX = 10

test('a node under the pointer does not move: zero push within its own radius', () => {
  assert.equal(fisheyePush(0, 6, R, MAX), 0)
  assert.equal(fisheyePush(5.9, 6, R, MAX), 0)
  assert.equal(fisheyePush(0.001, 0, R, MAX), 0) // not a division by a vanishing distance
})

test('the push rises from the node edge, peaks halfway out, and is zero at the lens edge', () => {
  const mid = fisheyePush(R / 2, 4, R, MAX)
  assert.ok(Math.abs(mid - MAX) < 1e-9)
  assert.ok(fisheyePush(10, 4, R, MAX) < mid)
  assert.ok(fisheyePush(50, 4, R, MAX) < mid)
  assert.equal(fisheyePush(R, 4, R, MAX), 0)
  assert.equal(fisheyePush(R + 10, 4, R, MAX), 0)
  // Bounded everywhere: nothing ever exceeds the declared maximum.
  for (let d = 0; d <= R + 1; d += 0.5) assert.ok(fisheyePush(d, 4, R, MAX) <= MAX + 1e-9)
})

test('the scale is largest under the pointer and back to 1 at the lens edge', () => {
  assert.equal(fisheyeScale(0, R), 1.45)
  assert.ok(fisheyeScale(R / 2, R) < 1.45 && fisheyeScale(R / 2, R) > 1)
  assert.equal(fisheyeScale(R, R), 1)
})
