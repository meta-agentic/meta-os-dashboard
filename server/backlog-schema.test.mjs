import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { backlogFromVault, laneEstimate, normalizeEstimate, normalizeStory } from './backlog-schema.mjs'
import { itemDetailRow } from './items.mjs'
import { lanes as localLanes } from './readers.mjs'
import { lanes as githubLanes } from './github-readers.mjs'

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
  for (const bad of [NaN, Infinity, -1.01, 1.01, null, undefined, true, [0.5], { v: 0.5 }]) {
    assert.equal(normalizeEstimate({ extension: bad, intension: 0 }).extension, null, String(bad))
  }
  // 0 is a real placement, distinct from absent.
  assert.equal(normalizeEstimate({ extension: 0, intension: 0 }).extension, 0)
})

test('normalizeEstimate: a string axis is not coerced, it reads as not placed', () => {
  for (const s of ['0.5', ' 0.5 ', '1e-1', '0x1', '0', '-0.25']) {
    const e = normalizeEstimate({ extension: s, intension: s })
    assert.equal(e.extension, null, JSON.stringify(s))
    assert.equal(e.intension, null, JSON.stringify(s))
  }
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

test('a lane slot carries the placement and its provenance, not the note', () => {
  assert.deepEqual(laneEstimate(placed), {
    extension: 0.25, intension: -0.45, quadrant: 'complicated', basis: 'up-front', dated: '2026-10-01',
  })
  assert.equal(laneEstimate(null), null)
})

// The same backlog, read by the local reader (from a JSON file) and by the GitHub reader
// (from a stubbed repository), must give each lane slot the identical estimate.
test('both lane readers give the same item the identical estimate shape', async () => {
  const doc = {
    stories: [
      { id: 'A-1', title: 'with', status: 'TO DO', storyPoints: 3, project: 'lane', sprint: 'S1', estimate: placed },
      { id: 'A-2', title: 'without', status: 'IN PROGRESS', storyPoints: 2, project: 'lane', sprint: 'S1' },
    ],
    epics: [],
    sprints: [{ id: 'S1', state: 'active', start: '2026-10-14', end: '2026-10-20', committed: ['A-1', 'A-2'] }],
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lanes-'))
  const file = path.join(dir, 'backlog.json')
  await fs.writeFile(file, JSON.stringify(doc))
  try {
    const local = await localLanes([{ space: 'a', path: file }])
    const remote = await githubLanes({
      backlogs: [{ space: 'a', mode: 'document', path: 'backlog.json', repo: { readJson: async () => doc } }],
    })
    const slots = (r) => Object.fromEntries(
      r.spaces[0].lanes.flatMap((l) => Object.values(l.queues).flat()).map((s) => [s.id, s.estimate]),
    )
    const a = slots(local)
    const b = slots(remote)
    assert.deepEqual(Object.keys(a).sort(), ['A-1', 'A-2'])
    assert.deepEqual(a, b)
    assert.deepEqual(a['A-1'], laneEstimate(placed))
    assert.equal('note' in a['A-1'], false, 'the free-text note stays off the lane slots')
    assert.equal(a['A-2'], null)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('the item detail view keeps the note', () => {
  const items = [{ fm: { id: 'A-1', kind: 'story', title: 't', status: 'TO DO', estimate: placed } }]
  const d = backlogFromVault({ items })
  assert.equal(itemDetailRow(d, { fm: items[0].fm, body: '', path: null }).estimate.note, 'n')
})

test('sprint dates parsed as Date objects (unquoted YAML) read as ISO day strings', () => {
  const { sprints } = backlogFromVault({
    sprintDocs: [{ stem: 'S2', fm: { sprintId: 'S2', state: 'active', start: new Date('2026-10-29'), end: new Date('2026-11-11') } }],
  })
  assert.equal(sprints[0].start, '2026-10-29')
  assert.equal(sprints[0].end, '2026-11-11')
})
