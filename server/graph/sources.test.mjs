import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearModelCache, githubFile, loadModel, localFile } from './sources.mjs'

const GRAPH = JSON.stringify({ nodes: [{ id: 'a', file_type: 'code' }, { id: 'b' }], links: [{ source: 'a', target: 'b', relation: 'r', confidence: 'EXTRACTED' }] })

async function tmpRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-src-'))
  await fs.mkdir(path.join(root, 'graphify-out'))
  await fs.writeFile(path.join(root, 'graphify-out/graph.json'), GRAPH)
  return root
}

test('a path that escapes its root is refused before any read', async () => {
  const root = await tmpRoot()
  assert.throws(() => localFile(root, '../etc/passwd'), /outside its root/)
  assert.throws(() => localFile(root, path.resolve(root, '..', 'x.json')), /outside its root/)
  assert.equal(localFile(root, 'graphify-out/graph.json').file, path.join(root, 'graphify-out/graph.json'))
})

test('a local file is parsed once per version; an unchanged mtime returns the cached entry', async () => {
  clearModelCache()
  const root = await tmpRoot()
  const src = localFile(root, 'graphify-out/graph.json')
  const first = await loadModel(src, { id: 'kg' })
  assert.equal(first.model.graph.id, 'kg')
  assert.equal(first.degree.get('a'), 1)
  const second = await loadModel(src)
  assert.equal(second, first)
  // Touch the file into the future: a new version, a fresh parse.
  const later = new Date(Date.now() + 5000)
  await fs.utimes(src.file, later, later)
  const third = await loadModel(src)
  assert.notEqual(third, first)
  assert.ok(third.version > first.version)
  assert.ok(Math.abs(third.version - later.getTime()) < 1) // mtimes keep sub-millisecond precision
})

test('a GitHub file is read through the repository and versioned by its last commit time', async () => {
  clearModelCache()
  const calls = []
  const repo = {
    label: () => 'org/repo@main',
    lastCommitMs: async (p) => { calls.push(['commit', p]); return 1700000000000 },
    readText: async (p) => { calls.push(['read', p]); return GRAPH },
  }
  const entry = await loadModel(githubFile(repo, 'graphify-out/graph.json'), { id: 'repo' })
  assert.equal(entry.version, 1700000000000)
  assert.deepEqual(Object.keys(entry.model.graph.nodes), ['a', 'b'])
  assert.deepEqual(calls, [['commit', 'graphify-out/graph.json'], ['read', 'graphify-out/graph.json']])
  await loadModel(githubFile(repo, 'graphify-out/graph.json'))
  assert.equal(calls.length, 4) // the text is read to learn the version; parsing was skipped
})
