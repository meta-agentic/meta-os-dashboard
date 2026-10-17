import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backlogFromVault, normalizeEstimate, normalizeStory } from './backlog-schema.mjs'
import { itemDetailRow } from './items.mjs'

const placed = {
  extension: 0.25, intension: -0.45, quadrant: 'complicated', basis: 'up-front', dated: '2026-10-01', note: 'n',
}

test('normalizeEstimate keeps a placement and its provenance', () => {
  assert.deepEqual(normalizeEstimate(placed), placed)
})

test('normalizeEstimate: no block is null, never a placement at the origin', () => {
  assert.equal(normalizeEstimate(undefined), null)
  assert.equal(normalizeEstimate(null), null)
  assert.equal(normalizeEstimate('3'), null)
  assert.equal(normalizeEstimate([0, 0]), null)
})

test('normalizeEstimate: an axis that is missing, not a number or out of range is null, not 0', () => {
  const e = normalizeEstimate({ extension: '', intension: 1.5 })
  assert.equal(e.extension, null)
  assert.equal(e.intension, null)
  assert.equal(normalizeEstimate({ extension: 'x', intension: -1 }).extension, null)
  assert.equal(normalizeEstimate({ extension: 'x', intension: -1 }).intension, -1)
  // 0 is a real placement, distinct from absent.
  assert.equal(normalizeEstimate({ extension: 0, intension: 0 }).extension, 0)
  assert.equal(normalizeEstimate({ extension: '0.5', intension: 0 }).extension, 0.5)
})

test('normalizeEstimate keeps a YAML date as its calendar day', () => {
  assert.equal(normalizeEstimate({ ...placed, dated: new Date('2026-10-01T00:00:00Z') }).dated, '2026-10-01')
})

test('normalizeStory carries the estimate, and null when there is none', () => {
  assert.deepEqual(normalizeStory({ id: 'A-1', estimate: placed }).estimate, placed)
  assert.equal(normalizeStory({ id: 'A-2' }).estimate, null)
})

test('the vault backlog and the item detail view carry the estimate', () => {
  const items = [
    { fm: { id: 'A-1', kind: 'story', title: 'with', status: 'TO DO', storyPoints: 3, estimate: placed } },
    { fm: { id: 'A-2', kind: 'story', title: 'without', status: 'TO DO', storyPoints: 2 } },
  ]
  const d = backlogFromVault({ items })
  assert.deepEqual(d.stories.find((s) => s.id === 'A-1').estimate, placed)
  assert.equal(d.stories.find((s) => s.id === 'A-2').estimate, null)
  const withIt = itemDetailRow(d, { fm: items[0].fm, body: '', path: null })
  assert.deepEqual(withIt.estimate, placed)
  assert.equal(withIt.storyPoints, 3, 'the recorded points are untouched')
  assert.equal(itemDetailRow(d, { fm: items[1].fm, body: '', path: null }).estimate, null)
})
