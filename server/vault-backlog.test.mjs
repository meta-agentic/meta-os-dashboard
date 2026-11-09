// The vault readers leave an unparseable item out of the list, as vaultlib does, and say so:
// they return `skipped: [{path, message}]` beside the items.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vaultBacklog } from './vault-backlog.mjs'
import { vaultBacklog as githubVaultBacklog } from './github-vault-backlog.mjs'

const GOOD = '---\nkind: story\nid: AAA-1\ntitle: good\nstatus: TO DO\n---\n\nbody\n'
// the shape that hid eight items: a flow list followed by a block entry
const BAD = '---\nkind: story\nid: AAA-2\nlabels: [a, b]\n- parked\n---\n\nbody\n'

const files = (extra = {}) => ({ 'aaa/raw/AAA-1.md': GOOD, ...extra })

function onDisk(map) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-'))
  for (const [rel, text] of Object.entries(map)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), text)
  }
  return path.join(root, 'aaa')
}

const fakeRepo = (map) => ({
  ensureTree: async () => new Map(Object.keys(map).map((p) => [p, {}])),
  readManyText: async (paths) => new Map(paths.map((p) => [p, map[p]])),
})

const readers = {
  disk: (map) => vaultBacklog(onDisk(map)),
  github: (map) => githubVaultBacklog(fakeRepo(map), 'aaa'),
}

for (const [name, read] of Object.entries(readers)) {
  test(`${name}: an unparseable item is returned as skipped with its path and message`, async () => {
    const d = await read(files({ 'aaa/raw/AAA-2.md': BAD }))
    assert.equal(d.skipped.length, 1)
    assert.equal(d.skipped[0].path, 'aaa/raw/AAA-2.md')
    assert.match(d.skipped[0].message, /\S/)
  })

  test(`${name}: the unparseable item is still left out of the items`, async () => {
    const d = await read(files({ 'aaa/raw/AAA-2.md': BAD }))
    assert.deepEqual(d.stories.map((s) => s.id), ['AAA-1'])
  })

  test(`${name}: a good item is not skipped`, async () => {
    assert.deepEqual((await read(files())).skipped, [])
  })

  test(`${name}: a prose file that is not item-named is not skipped`, async () => {
    const d = await read(files({ 'aaa/wiki/notes.md': BAD }))
    assert.deepEqual(d.skipped, [])
  })
}

test('disk: the same broken text read twice is skipped both times', async () => {
  const map = files({ 'aaa/raw/AAA-2.md': BAD })
  await vaultBacklog(onDisk(map))
  assert.equal((await vaultBacklog(onDisk(map))).skipped.length, 1)
})
