// node --test server/
// The open-decisions reader over a throwaway synthetic vault: which records count as open,
// the oldest-first order, and that an answered question leaves the list on the next read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDecisions, oldestFirst } from './decisions.mjs'

const rec = (id, raised, extra = {}) => ({ id, question: `${id}?`, state: 'open', raised, history: [], ...extra })

function vault(t, spaces) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'dec-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  for (const [space, tiers] of Object.entries(spaces)) {
    for (const [tier, decisions] of Object.entries(tiers)) {
      mkdirSync(path.join(base, space, tier), { recursive: true })
      writeFileSync(path.join(base, space, tier, 'decisions.json'), JSON.stringify({ decisions }))
    }
  }
  return { base, backlogs: Object.keys(spaces).map((space) => ({ space, path: path.join(base, space) })) }
}

const ids = (r) => r.decisions.map((d) => `${d.space}/${d.id}`)

test('lists the open decisions oldest first, across spaces', async (t) => {
  const { backlogs } = vault(t, {
    aa: { raw: [rec('Q-02', '2026-10-20'), rec('Q-01', '2026-11-01')] },
    bb: { raw: [rec('Q-01', '2026-10-05')] },
  })
  assert.deepEqual(ids(await openDecisions(backlogs)), ['bb/Q-01', 'aa/Q-02', 'aa/Q-01'])
})

test('a same-day tie is ordered by space then numeric id', () => {
  const rows = [
    { space: 'bb', id: 'Q-1', raised: '2026-10-01' },
    { space: 'aa', id: 'Q-10', raised: '2026-10-01' },
    { space: 'aa', id: 'Q-2', raised: '2026-10-01' },
  ]
  assert.deepEqual(oldestFirst(rows).map((r) => `${r.space}/${r.id}`), ['aa/Q-2', 'aa/Q-10', 'bb/Q-1'])
})

test('a record with no readable date sorts last', () => {
  const rows = [{ space: 'aa', id: 'Q-1', raised: '' }, { space: 'aa', id: 'Q-2', raised: '2026-10-01' }]
  assert.deepEqual(oldestFirst(rows).map((r) => r.id), ['Q-2', 'Q-1'])
})

test('only open records count: withdrawn in raw/ and answered in wiki/ are not listed', async (t) => {
  const { backlogs } = vault(t, {
    aa: {
      raw: [rec('Q-01', '2026-10-01'), rec('Q-02', '2026-10-02', { state: 'withdrawn' })],
      wiki: [rec('Q-03', '2026-10-03', { state: 'answered' })],
    },
  })
  assert.deepEqual(ids(await openDecisions(backlogs)), ['aa/Q-01'])
})

test('an answer moves the record out of raw/, so the next read drops it', async (t) => {
  const { base, backlogs } = vault(t, { aa: { raw: [rec('Q-01', '2026-10-01'), rec('Q-02', '2026-10-02')] } })
  assert.equal((await openDecisions(backlogs)).decisions.length, 2)
  // what `decision answer` does: rewrite raw/ without Q-01 and put it in wiki/ as answered
  writeFileSync(path.join(base, 'aa/raw/decisions.json'), JSON.stringify({ decisions: [rec('Q-02', '2026-10-02')] }))
  mkdirSync(path.join(base, 'aa/wiki'))
  writeFileSync(path.join(base, 'aa/wiki/decisions.json'), JSON.stringify({ decisions: [rec('Q-01', '2026-10-01', { state: 'answered' })] }))
  assert.deepEqual(ids(await openDecisions(backlogs)), ['aa/Q-02'])
})

test('a space with no register, an unreadable one and a .json backlog are zeros, not errors', async (t) => {
  const { base, backlogs } = vault(t, { aa: { raw: [rec('Q-01', '2026-10-01')] } })
  mkdirSync(path.join(base, 'empty'))
  mkdirSync(path.join(base, 'bad/raw'), { recursive: true })
  writeFileSync(path.join(base, 'bad/raw/decisions.json'), '{not json')
  const all = [...backlogs, { space: 'empty', path: path.join(base, 'empty') }, { space: 'bad', path: path.join(base, 'bad') },
    { space: 'doc', path: path.join(base, 'doc.backlog.json') }]
  assert.deepEqual(ids(await openDecisions(all)), ['aa/Q-01'])
})

test('carries the space, recommendation, options and what it blocks', async (t) => {
  const { backlogs } = vault(t, {
    aa: { raw: [rec('Q-01', '2026-10-01', { blocks: ['AA-1', 'AA-2'], options: ['Park', 'NO GO'], recommendation: { by: 'Claude', text: 'Park it.' } })] },
  })
  const [d] = (await openDecisions(backlogs, Date.parse('2026-10-11'))).decisions
  assert.equal(d.space, 'aa')
  assert.deepEqual(d.blocks, ['AA-1', 'AA-2'])
  assert.deepEqual(d.options, ['Park', 'NO GO'])
  assert.equal(d.recommendation, 'Park it.')
  assert.equal(d.ageDays, 10)
})

test('without a recommendation the stated default stands in; with neither it is empty', async (t) => {
  const { backlogs } = vault(t, {
    aa: { raw: [rec('Q-01', '2026-10-01', { default: 'Do X.' }), rec('Q-02', '2026-10-02')] },
  })
  const [a, b] = (await openDecisions(backlogs)).decisions
  assert.equal(a.recommendation, 'Do X.')
  assert.equal(b.recommendation, '')
})
