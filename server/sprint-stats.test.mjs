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
  assert.equal(s.S1.scopeAddedItems, null, 'an unmigrated file cannot say what was added later')
  assert.equal(s.S1.scopeAddedPts, null)
  assert.equal(s.S1.deliveredItems, 2, 'A-3 was added mid-sprint and still counts as delivered')
  assert.equal(s.S1.deliveredPts, 5)
})

test('a migrated sprint keeps the opening commitment and reports later commitments as scope added', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 3, 'S1'), item('A-2', 'TO DO', 5, 'S1'), item('A-3', 'IN PROGRESS', 2, 'S1')],
    [sprint('S1', 'active', '2026-09-01', '2026-09-14', ['A-1', 'A-2', 'A-3'], { committedAtStart: ['A-1', 'A-2'] })],
  )
  assert.equal(s.S1.committedItems, 2)
  assert.equal(s.S1.committedPts, 8)
  assert.equal(s.S1.scopeAddedItems, 1)
  assert.equal(s.S1.scopeAddedPts, 2)
  assert.equal(s.S1.carryItems, 2, 'the opening plan and the mid-sprint item both stay on the roster')
})

test('a migrated sprint that added nothing reports zero scope, not an unknown', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 3, 'S1')],
    [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1'], { committedAtStart: ['A-1'] })],
  )
  assert.equal(s.S1.scopeAddedItems, 0)
  assert.equal(s.S1.scopeAddedPts, 0)
})

test('a sprint with no recorded commitment reports null, not zero', () => {
  const s = statsOf([item('A-1', 'DONE', 3, 'S1')], [sprint('S1', 'closed', '2026-09-01', '2026-09-14', [])])
  assert.equal(s.S1.committedItems, null)
  assert.equal(s.S1.committedPts, null)
  assert.equal(s.S1.deliveredPts, 3)
})

test('a carried item is delivered once, by the sprint that finished it', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 5, ['S1', 'S2'], { deliveredPoints: { S1: 0, S2: 5 } })],
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
  assert.deepEqual([s.S1.deliveredItems, s.S1.deliveredPts], [1, 3], 'the close record is what is shown')
  assert.deepEqual([s.S1.liveItems, s.S1.livePts], [2, 8], 'the live credit is kept beside it')
  assert.equal(s.S2.drift, false)
})

// The double count the close never makes: planned into S2 before it started, finished
// during S1, so the S1 close credited it and its map names S1 alone.
const early = (extra = {}) => item('A-1', 'DONE', 3, ['S2', 'S1'], { completed: '2026-09-10', deliveredPoints: { S1: 3 }, ...extra })
const s1s2 = (s1 = {}, s2 = {}, s2state = 'closed') => [
  sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1'], s1),
  sprint('S2', s2state, '2026-09-15', '2026-09-28', ['A-1', 'A-2'], s2),
]

test('an item stamped into two sprints and finished before the second starts counts once, in the first', () => {
  const s = statsOf([early(), item('A-2', 'DONE', 2, 'S2', { completed: '2026-09-20' })], s1s2())
  assert.deepEqual([s.S1.deliveredItems, s.S1.deliveredPts], [1, 3])
  assert.deepEqual([s.S2.deliveredItems, s.S2.deliveredPts], [1, 2], 'S2 delivered only A-2')
  assert.equal(s.S2.carryItems, 0, 'finished in an earlier sprint is not carried over')
})

test('the same item without a map is still left out of an open sprint it was finished before', () => {
  const s = statsOf([early({ deliveredPoints: undefined }), item('A-2', 'DONE', 2, 'S2', { completed: '2026-09-20' })], s1s2({}, {}, 'active'))
  assert.deepEqual([s.S2.deliveredItems, s.S2.deliveredPts], [1, 2])
})

test("a closed sprint shows the close's stamps and its delivered list, not a recount", () => {
  const s = statsOf(
    [early({ deliveredPoints: undefined }), item('A-2', 'DONE', 2, 'S2', { completed: '2026-09-20' })],
    s1s2({ deliveredSP: 3, deliveredItems: 1, delivered: ['A-1'] }, { deliveredSP: 2, deliveredItems: 1, delivered: ['A-2'], committedAtStart: ['A-2'] }),
  )
  assert.deepEqual([s.S2.deliveredItems, s.S2.deliveredPts, s.S2.deliveredSource], [1, 2, 'stamped'])
  assert.equal(s.S2.drift, true, 'the legacy item without a map recounts in both; the stamp says otherwise')
})

test('an item without a map that names two sprints counts in each, as the vault rule reads it', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 5, ['S1', 'S2'])],
    [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1']), sprint('S2', 'closed', '2026-09-15', '2026-09-28')],
  )
  assert.deepEqual([s.S1.deliveredPts, s.S2.deliveredPts], [5, 5], 'vaultlib.sprint_credit: no map, full credit wherever it is named')
})

test('the delivered points are the slice the sprint earned, not the whole estimate', () => {
  const s = statsOf(
    [item('A-1', 'DONE', 5, ['S1', 'S2'], { completed: '2026-09-20', deliveredPoints: { S1: 2, S2: 3 } })],
    [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1']), sprint('S2', 'active', '2026-09-15', '2026-09-28')],
  )
  assert.deepEqual([s.S1.deliveredItems, s.S1.deliveredPts], [0, 2])
  assert.deepEqual([s.S2.deliveredItems, s.S2.deliveredPts], [1, 3])
})

test('an active sprint is never flagged as drifting', () => {
  const s = statsOf([item('A-1', 'DONE', 3, 'S1')], [sprint('S1', 'active', '2026-09-01', '2026-09-14', [], { deliveredSP: 0, deliveredItems: 0 })])
  assert.equal(s.S1.drift, false)
})

test('normalising an already-normalised backlog keeps the commitment snapshot', () => {
  const once = backlogFromVault({ items: [item('A-1', 'TO DO', 1, 'S1')], sprintDocs: [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1'])] })
  const twice = normalizeBacklog(once)
  assert.deepEqual(twice.sprints[0].committed, ['A-1'])
  assert.equal(twice.sprints[0].committedAtStart, null)
  assert.equal(twice.sprints[0].delivered, null)
})

test('a migrated sprint file keeps both new lists through a second normalise', () => {
  const once = backlogFromVault({
    items: [item('A-1', 'DONE', 1, 'S1')],
    sprintDocs: [sprint('S1', 'closed', '2026-09-01', '2026-09-14', ['A-1', 'A-2'], { committedAtStart: ['A-1'], delivered: ['A-1'] })],
  })
  const twice = normalizeBacklog(once)
  assert.deepEqual(twice.sprints[0].committedAtStart, ['A-1'])
  assert.deepEqual(twice.sprints[0].committed, ['A-1', 'A-2'])
  assert.deepEqual(twice.sprints[0].delivered, ['A-1'])
})

test('rows come out in chronological order', () => {
  const d = backlogFromVault({
    items: [],
    sprintDocs: [sprint('S2', 'closed', '2026-09-15', '2026-09-28'), sprint('S1', 'closed', '2026-09-01', '2026-09-14')],
  })
  assert.deepEqual(sprintStats(d.stories, d.epics, d.sprints).map((r) => r.id), ['S1', 'S2'])
})
