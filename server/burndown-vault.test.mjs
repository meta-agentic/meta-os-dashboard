import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStory } from './backlog-schema.mjs'
import { vaultBurndown } from './burndown-vault.mjs'

const S = { id: 'S1', name: 'S1', status: 'IN PROGRESS', start: '2026-01-05', end: '2026-01-07' }
const story = (id, status, storyPoints, completed, extra = {}) =>
  normalizeStory({ id, status, storyPoints, sprint: 'S1', completed, ...extra })
const remaining = (r) => r.series.days.map((d) => d.remaining)

test('remaining points fall on the day each item was completed', () => {
  const r = vaultBurndown(S, [story('A', 'DONE', 3, '2026-01-06'), story('B', 'TO DO', 2)], '2026-01-07')
  assert.deepEqual(remaining(r), [5, 2, 2])
})

test('the series stops at today while the sprint runs', () => {
  const r = vaultBurndown(S, [story('A', 'DONE', 3, '2026-01-05')], '2026-01-06')
  assert.deepEqual(r.series.days.map((d) => d.date), ['2026-01-05', '2026-01-06'])
})

test('work finished after the planned end extends the series (an overrun)', () => {
  const r = vaultBurndown(S, [story('A', 'DONE', 3, '2026-01-09')], '2026-01-10')
  assert.equal(r.series.days.at(-1).date, '2026-01-09')
  assert.equal(r.series.days.at(-1).remaining, 0)
})

test('work finished before the start counts from day 0', () => {
  const r = vaultBurndown(S, [story('A', 'DONE', 3, '2026-01-01'), story('B', 'TO DO', 1)], '2026-01-07')
  assert.equal(r.series.days[0].remaining, 1)
})

test('a delivered item with no completed date gives no series, and says which', () => {
  const r = vaultBurndown(S, [story('A', 'DONE', 3, null)], '2026-01-07')
  assert.equal(r.series, null)
  assert.match(r.reason, /1 delivered item carries no completed date \(A\)/)
})

test('a carried item counts only the slice credited to this sprint', () => {
  const carried = story('A', 'DONE', 5, '2026-01-06', { sprint: ['S0', 'S1'], deliveredPoints: { S0: 2, S1: 3 } })
  const r = vaultBurndown(S, [carried], '2026-01-07')
  assert.deepEqual(remaining(r), [5, 2, 2])
})

test('a sprint not yet started has no series', () => {
  assert.match(vaultBurndown({ ...S, start: '2026-02-01', end: '2026-02-07' }, [story('A', 'TO DO', 1)], '2026-01-07').reason, /not started/)
})

test('a sprint with no pointed work has no series', () => {
  assert.match(vaultBurndown(S, [story('A', 'TO DO', 0)], '2026-01-07').reason, /no pointed work/)
})

test('a sprint without dates has no series', () => {
  assert.match(vaultBurndown({ ...S, start: null }, [story('A', 'TO DO', 1)], '2026-01-07').reason, /no start or end/)
})

test('completed parsed as a Date by YAML reads as an ISO day', () => {
  assert.equal(normalizeStory({ id: 'A', completed: new Date('2026-01-06T00:00:00Z') }).completed, '2026-01-06')
})
