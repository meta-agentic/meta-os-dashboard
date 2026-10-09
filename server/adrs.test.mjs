// node --test server/
// The local ADR reader over a throwaway synthetic vault: what the scan finds and
// skips, how the detail lookup resolves, and that the endpoints are GET-only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { adrs, adrDetail } from './adrs.mjs'

const adr = (id, status = 'Accepted') => `---\nkind: adr\nid: ${id}\ntitle: ${id} title\nstatus: ${status}\ndate: 2026-01-01\n---\n\n## Decision\n\n### D1 — One\n`

function vault(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'adr-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const put = (rel, body) => {
    mkdirSync(path.dirname(path.join(base, rel)), { recursive: true })
    writeFileSync(path.join(base, rel), body)
  }
  put('abc/wiki/adr/ADR-ABC-01-first.md', adr('ADR-ABC-01'))
  put('abc/wiki/ADR-ABC-02-flat.md', adr('ADR-ABC-02', 'proposed'))
  put('abc/raw/ADR-ABC-03-kind-only.md', adr('ADR-ABC-03', 'TO DO')) // kind: adr outside wiki/
  put('abc/raw/ABC-1.md', '---\nkind: story\nid: ABC-1\n---\n')
  put('abc/raw/ADR-ABC-04-named-outside-wiki.md', '---\nkind: story\n---\n') // name rule is wiki/ only
  put('abc/.claude/worktrees/w/abc/wiki/ADR-ABC-01-first.md', adr('ADR-ABC-01'))
  put('abc/attachments/ABC-9/ADR-ABC-05.md', adr('ADR-ABC-05'))
  put('abc/wiki/adr/ADR-draft.md', adr('ADR-ABC-06'))
  put('abc/wiki/drafts/ADR-ABC-07.md', adr('ADR-ABC-07'))
  put('xyz/wiki/adr/ADR-XYZ-01.md', adr('ADR-XYZ-01', 'Superseded'))
  const backlogs = [
    { space: 'abc', path: path.join(base, 'abc') },
    { space: 'xyz', path: path.join(base, 'xyz') },
    { space: 'old', path: path.join(base, 'old.backlog.json') },
  ]
  return { base, backlogs }
}

test('the scan finds every ADR and nothing excluded', async (t) => {
  const { backlogs } = vault(t)
  const r = await adrs(backlogs)
  assert.equal(r.available, true)
  assert.equal(r.total, 4)
  assert.deepEqual(r.spaces.map((s) => [s.space, s.adrs.map((a) => a.id)]), [
    ['abc', ['ADR-ABC-01', 'ADR-ABC-02', 'ADR-ABC-03']],
    ['xyz', ['ADR-XYZ-01']],
  ])
  assert.equal(r.spaces[0].counts.nonstandard, 1)
  assert.deepEqual(r.failed.map((f) => f.space), ['old'])
})

test('detail resolves only ADRs the scan found, and maps to a file root', async (t) => {
  const { base, backlogs } = vault(t)
  const d = await adrDetail(backlogs, { estate: base }, 'abc', 'ADR-ABC-01')
  assert.equal(d.available, true)
  assert.deepEqual(d.preview, { root: 'estate', path: 'abc/wiki/adr/ADR-ABC-01-first.md' })
  assert.deepEqual(d.adr.decisions.map((x) => [x.ref, x.status.value, x.status.source]), [['D1', 'Accepted', 'inherited']])

  const none = await adrDetail(backlogs, {}, 'abc', 'ADR-ABC-01')
  assert.equal(none.preview, null)
  assert.ok(none.previewReason)

  for (const [space, id] of [['abc', '../xyz/wiki/adr/ADR-XYZ-01'], ['abc', 'ADR-ABC-05'], ['abc', 'ADR-ABC-07'], ['nope', 'ADR-ABC-01'], ['abc', '']]) {
    assert.equal((await adrDetail(backlogs, { estate: base }, space, id)).available, false, `${space}/${id}`)
  }
})

test('AC1: the ADR endpoints are GET-only', () => {
  const src = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8')
  const adrRoutes = [...src.matchAll(/app\.(\w+)\('\/api\/adrs?'/g)].map((m) => m[1])
  assert.ok(adrRoutes.length >= 4)
  assert.deepEqual([...new Set(adrRoutes)], ['get'])
})
