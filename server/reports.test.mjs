import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reportFromData } from './reports.mjs'
import { deliveredIn, sprintCredit } from './delivery.mjs'
import { normalizeBacklog } from './backlog-schema.mjs'

const story = (id, status, storyPoints, sprint, extra = {}) => ({ id, title: id, status, storyPoints, sprint, ...extra })
const sprint = (id, state, start, end, extra = {}) => ({ id, state, start, end, committed: [], ...extra })
const rows = (doc) => Object.fromEntries(reportFromData('x', doc).sprints.map((r) => [r.id, r]))

// A-1 was started in S1, carried, and finished in S2: S1 earned none of it, S2 earned all 5.
const carried = (extra = {}) => story('A-1', 'DONE', 5, ['S1', 'S2'], { deliveredPoints: { S1: 0, S2: 5 }, ...extra })
const plain = story('A-2', 'DONE', 3, 'S1')
const twoClosed = [sprint('S1', 'closed', '2026-09-01', '2026-09-14'), sprint('S2', 'closed', '2026-09-15', '2026-09-28')]

test('a carried item is delivered once: the origin sprint is credited 0, the finishing sprint the estimate', () => {
  const r = rows({ stories: [carried(), plain], sprints: twoClosed })
  assert.deepEqual([r.S1.done, r.S1.donePts], [1, 3], 'S1 delivered only A-2')
  assert.deepEqual([r.S2.done, r.S2.donePts], [1, 5], 'S2 delivered the carried item')
})

test('velocity and the velocity per week read the credited points, not the members', () => {
  const rep = reportFromData('x', { stories: [carried(), plain], sprints: twoClosed })
  assert.deepEqual(rep.velocity.map((v) => v.value), [3, 5])
  assert.equal(rep.scorecard.velocityPerWeek, +(8 / (26 / 7)).toFixed(1), '8 credited points over 26 days, not the 13 the members sum to')
})

test("a closed sprint's stamped deliveredSP and deliveredItems are what the dashboard shows", () => {
  const r = rows({
    stories: [carried(), plain],
    sprints: [
      sprint('S1', 'closed', '2026-09-01', '2026-09-14', { deliveredSP: 3, deliveredItems: 1 }),
      sprint('S2', 'closed', '2026-09-15', '2026-09-28', { deliveredSP: 5, deliveredItems: 1 }),
    ],
  })
  assert.deepEqual([r.S1.done, r.S1.donePts, r.S2.done, r.S2.donePts], [1, 3, 1, 5])
  const lies = rows({ stories: [plain], sprints: [sprint('S1', 'closed', '2026-09-01', '2026-09-14', { deliveredSP: 7, deliveredItems: 2 })] })
  assert.deepEqual([lies.S1.done, lies.S1.donePts], [2, 7], 'the stamp wins over a recount')
})

test('an export without the fields falls back to counting every DONE member, as before', () => {
  const r = rows({ stories: [story('A-1', 'DONE', 5, ['S1', 'S2']), plain], sprints: twoClosed })
  assert.deepEqual([r.S1.done, r.S1.donePts], [2, 8])
  assert.deepEqual([r.S2.done, r.S2.donePts], [1, 5])
})

test('an open sprint is credited its own slice, so the active progress does not double count', () => {
  const half = story('A-4', 'DONE', 5, ['S1', 'S2'], { deliveredPoints: { S1: 2, S2: 3 } })
  const rep = reportFromData('x', {
    stories: [half, story('A-3', 'TO DO', 2, 'S2')],
    sprints: [sprint('S1', 'closed', '2026-09-01', '2026-09-14'), sprint('S2', 'active', '2026-09-15', '2026-09-28')],
  })
  assert.equal(rep.burndown.committed, 7)
  assert.equal(rep.burndown.remaining, 4, 'S2 earned 3 of the carried item, not its 5')
})

test('stamps on an open sprint are not trusted: only a close writes them', () => {
  const r = rows({ stories: [plain], sprints: [sprint('S1', 'active', '2026-09-01', '2026-09-14', { deliveredSP: 99, deliveredItems: 9 })] })
  assert.deepEqual([r.S1.done, r.S1.donePts], [1, 3])
})

test('a partial slice is credited to each sprint that earned it, the item once in the last', () => {
  const half = story('A-4', 'DONE', 5, ['S1', 'S2'], { deliveredPoints: { S1: 2, S2: 3 } })
  assert.deepEqual(sprintCredit(half, 'S1'), { pts: 2, item: false })
  assert.deepEqual(sprintCredit(half, 'S2'), { pts: 3, item: true })
  assert.deepEqual(sprintCredit(half, 'S3'), { pts: 0, item: false }, 'a sprint the map omits delivered none of it')
})

test('deliveredPoints survives normalisation; a scalar or an empty map reads as none', () => {
  const d = normalizeBacklog({ stories: [carried(), story('B', 'DONE', 1, 'S1', { deliveredPoints: 4 }), story('C', 'DONE', 1, 'S1', { deliveredPoints: {} })] })
  assert.deepEqual(d.stories.map((s) => s.deliveredPoints), [{ S1: 0, S2: 5 }, null, null])
})

test('deliveredIn on a sprint with no DONE members is zero', () => {
  assert.deepEqual(deliveredIn({ id: 'S9', status: 'PLANNED' }, [story('A', 'TO DO', 3, 'S9')]), { items: 0, pts: 0, ids: [], source: 'credited' })
})

// The window rule: an open sprint is credited only what was completed on or after its start.
const open2 = [sprint('S1', 'closed', '2026-09-01', '2026-09-14'), sprint('S2', 'active', '2026-09-15', '2026-09-28')]
const windowCases = [
  ['finished before the start', { completed: '2026-09-10' }, 0],
  ['finished on the start day', { completed: '2026-09-15' }, 1],
  ['finished after the end, before the close', { completed: '2026-09-30' }, 1],
  ['with no completed date', {}, 1],
]
for (const [name, extra, n] of windowCases) {
  test(`window: an open sprint ${n ? 'counts' : 'leaves out'} an item ${name}`, () => {
    const s = story('A-1', 'DONE', 3, ['S2', 'S1'], extra)
    assert.equal(deliveredIn({ ...open2[1], status: 'IN PROGRESS' }, [s]).items, n)
  })
}
test('window cases cover every branch of the rule', () => {
  assert.equal(windowCases.length, 4, 'a new case of the window rule gets its own row above')
})

test('a closed sprint is not windowed: the close decided, and its map says where the item went', () => {
  const s = story('A-1', 'DONE', 3, 'S2', { completed: '2026-09-10' })
  assert.equal(deliveredIn({ id: 'S2', status: 'CLOSED', start: '2026-09-15', end: '2026-09-28' }, [s]).items, 1)
})

test('the active burndown leaves out work finished before the sprint started', () => {
  const rep = reportFromData('x', {
    stories: [story('A-1', 'DONE', 3, ['S2', 'S1'], { completed: '2026-09-10' }), story('A-2', 'TO DO', 2, 'S2')],
    sprints: open2,
  })
  assert.deepEqual([rep.burndown.committed, rep.burndown.remaining], [2, 2], 'A-1 is not part of S2: nothing of S2 is done yet')
})

test('the status mix gives REFINED and IN REVIEW their own buckets', () => {
  const rep = reportFromData('x', {
    stories: [story('A', 'REFINED', 1, null), story('B', 'IN REVIEW', 2, null), story('C', 'TO DO', 3, null), story('D', 'BLOCKED?', 1, null)],
    sprints: [],
  })
  assert.deepEqual(rep.statusMix.map((m) => [m.label, m.value]), [['To do', 1], ['Refined', 1], ['In review', 1], ['Other', 1]])
})
