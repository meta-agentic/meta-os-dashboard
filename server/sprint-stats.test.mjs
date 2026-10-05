import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backlogFromVault, normalizeBacklog } from './backlog-schema.mjs'
import { sprintStats } from './sprint-stats.mjs'

const item = (id, status, sp, sprint, extra = {}) => ({
  fm: { kind: 'story', id, title: id, status, storyPoints: sp, sprint, ...extra },
})
const sprint = (id, state, start, end, committed = [], extra = {}) => ({
  fm: { kind: 'sprint', sprintId: id, state, start, end, committed, ...extra }, stem: id,
})

function statsOf(items, sprintDocs) {
  const d = backlogFromVault({ items, sprintDocs })
  return Object.fromEntries(sprintStats(d.stories, d.epics, d.sprints).map((r) => [r.id, r]))
}

test('commitment is the open-time snapshot, not live membership', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 3, 'S1'), item('A-2', 'TO DO', 5, 'S1'), item('A-3', 'DONE', 2, 'S1')],
    [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1', 'A-2'])],
  )
  assert.equal(s.S1.committedItems, 2)
  assert.equal(s.S1.committedPts, 8)
  assert.equal(s.S1.deliveredItems, 2, 'A-3 was added mid-sprint and still counts as delivered')
  assert.equal(s.S1.deliveredPts, 5)
})

test('a sprint with no recorded commitment reports null, not zero', () => {
  const s = statsOf([item('A-1', 'DONE', 3, 'S1')], [sprint('S1', 'closed', '2026-09-01', '2026-09-14', [])])
  assert.equal(s.S1.committedItems, null)
  assert.equal(s.S1.committedPts, null)
  assert.equal(s.S1.deliveredPts, 3)
})

test('a carried item is delivered once, by the sprint that finished it', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 5, ['S1', 'S2'])],
    [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1']), sprint('S2', 'closed', '2026-09-15', '2026-09-28')],
  )
  assert.equal(s.S1.deliveredPts, 0, 'the origin sprint delivers nothing for it')
  assert.equal(s.S2.deliveredPts, 5)
  assert.equal(s.S1.carryItems, 1, 'committed here, delivered later')
  assert.equal(s.S1.carryPts, 5)
  assert.equal(s.S2.carryItems, 0)
})

test('carry-over is unfinished work; NO GO and epics are not carried', () => {
  const d = [
    item('A-1', 'IN PROGRESS', 3, 'S1'),
    item('A-2', 'TO DO', 2, 'S1'),
    item('A-3', 'NO GO', 8, 'S1'),
    { fm: { kind: 'epic', id: 'A-9', title: 'epic', status: 'IN PROGRESS', sprint: 'S1' } },
    item('A-4', 'DONE', 1, 'S1'),
  ]
  const s = statsOf(d, [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1', 'A-2', 'A-3', 'A-9'])])
  assert.equal(s.S1.carryItems, 2)
  assert.equal(s.S1.carryPts, 5)
  assert.equal(s.S1.committedItems, 4, 'the snapshot counts what was written down, epics included')
})

test('a committed item finished without any sprint stamp is neither delivered nor carried', () => {
  const s = statsOf([item('A-1', 'DONE', 4, null)], [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1'])])
  assert.equal(s.S1.deliveredItems, 0)
  assert.equal(s.S1.carryItems, 0)
})

test('velocity is points per week of the sprint, so a longer sprint is not faster', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 12, 'S1'), item('A-2', 'DONE', 12, 'S2')],
    [sprint('S1', 'closed', '2026-09-01', '2026-09-15'), sprint('S2', 'closed', '2026-09-15', '2026-09-22')],
  )
  assert.equal(s.S1.perWeek, 6)
  assert.equal(s.S2.perWeek, 12)
})

test('a sprint with no dates has no velocity rather than a made-up one', () => {
  const s = statsOf([item('A-1', 'DONE', 3, 'S1')], [sprint('S1', 'closed', null, null)])
  assert.equal(s.S1.perWeek, null)
})

test('drift flags a close record that no longer matches live work', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 3, 'S1'), item('A-2', 'DONE', 5, 'S1')],
    [
      sprint('S1', 'closed', '2026-09-01', '2026-09-14', [], { deliveredSP: 3, deliveredItems: 1 }),
      sprint('S2', 'closed', '2026-09-15', '2026-09-28', [], { deliveredSP: 0, deliveredItems: 0 }),
    ],
  )
  assert.equal(s.S1.drift, true)
  assert.equal(s.S1.storedSP, 3)
  assert.equal(s.S1.deliveredPts, 8)
  assert.equal(s.S2.drift, false)
})

test('an active sprint is never flagged as drifting', () => {
  const s = statsOf([item('A-1', 'DONE', 3, 'S1')], [sprint('S1', 'active', '2026-09-01', '2026-09-14', [], { deliveredSP: 0, deliveredItems: 0 })])
  assert.equal(s.S1.drift, false)
})

test('normalising an already-normalised backlog keeps the commitment snapshot', () => {
  const once = backlogFromVault({ items: [item('A-1', 'TO DO', 1, 'S1')], sprintDocs: [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1'])] })
  const twice = normalizeBacklog(once)
  assert.deepEqual(twice.sprints[0].committed, ['A-1'])
})

test('rows come out in chronological order', () => {
  const d = backlogFromVault({
    items: [],
    sprintDocs: [sprint('S2', 'closed', '2026-09-15', '2026-09-28'), sprint('S1', 'closed', '2026-09-01', '2026-09-14')],
  })
  assert.deepEqual(sprintStats(d.stories, d.epics, d.sprints).map((r) => r.id), ['S1', 'S2'])
})
