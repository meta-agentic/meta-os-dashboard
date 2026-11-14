import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combineStatusMix } from './status-mix.mjs'

test('one space keeps its buckets as they are', () => {
  const mix = [{ label: 'To do', value: 2, points: 5 }, { label: 'Done', value: 1, points: 3 }]
  assert.deepEqual(combineStatusMix([{ statusMix: mix }]), mix)
})

test('several spaces add up bucket by bucket, in first-seen order', () => {
  const a = { statusMix: [{ label: 'To do', value: 2, points: 5 }, { label: 'Done', value: 1, points: 3 }] }
  const b = { statusMix: [{ label: 'Done', value: 4, points: 8 }, { label: 'No go', value: 1 }] }
  assert.deepEqual(combineStatusMix([a, b]), [
    { label: 'To do', value: 2, points: 5 },
    { label: 'Done', value: 5, points: 11 },
    { label: 'No go', value: 1, points: 0 },
  ])
})
