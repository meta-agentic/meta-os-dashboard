// node --test scripts/
// The static ADR snapshot must stay inside its output directory whatever an ADR's
// front-matter id says. Synthetic vault in a throwaway directory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { snapshotAdrs } from './snapshot-adrs.mjs'

const adr = (id) => `---\nkind: adr\nid: '${id}'\ntitle: t\nstatus: Accepted\ndate: 2026-01-01\n---\n`

// Every file under dir, as paths relative to it.
const tree = (dir, rel = '') =>
  readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(dir, path.join(rel, e.name)) : [path.join(rel, e.name)])

test('traversal and slash ids get no detail file and nothing lands outside the output dir', async (t) => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'adr-snap-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const vault = path.join(base, 'vault', 'abc', 'wiki', 'adr')
  mkdirSync(vault, { recursive: true })
  writeFileSync(path.join(vault, 'ADR-ABC-01-ok.md'), adr('ADR-ABC-01'))
  writeFileSync(path.join(vault, 'ADR-ABC-02-up.md'), adr('../../../ESCAPED-PROBE'))
  writeFileSync(path.join(vault, 'ADR-ABC-03-slash.md'), adr('ADR-ZZ/1'))
  const outDir = path.join(base, 'site', 'public', 'snapshots')
  mkdirSync(outDir, { recursive: true })
  const before = tree(base).filter((f) => !f.startsWith(path.join('site', 'public', 'snapshots')))

  const { skipped } = await snapshotAdrs([{ space: 'abc', path: path.join(base, 'vault', 'abc') }], outDir, () => {})

  assert.deepEqual(skipped.sort(), ['abc/../../../ESCAPED-PROBE', 'abc/ADR-ZZ/1'])
  assert.deepEqual(readdirSync(outDir).sort(), ['adr-abc-ADR-ABC-01.json', 'adrs.json'])
  const after = tree(base).filter((f) => !f.startsWith(path.join('site', 'public', 'snapshots')))
  assert.deepEqual(after.sort(), before.sort())
  // The list still carries all three: an odd id is a data problem to show, not to hide.
  assert.equal(JSON.parse(readFileSync(path.join(outDir, 'adrs.json'), 'utf8')).total, 3)
})
