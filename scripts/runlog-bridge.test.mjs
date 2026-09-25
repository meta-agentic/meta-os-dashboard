// node --test scripts/
// The bridge must turn the instance writer's exit codes into decisions the heartbeat
// acts on. A stub runlog.py stands in for the instance's, so no real instance is read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runlogAppend, runlogCheck } from './runlog-bridge.mjs'

function instanceWithStub(exitCode, stderr = '') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runlog-bridge-'))
  mkdirSync(path.join(root, 'automations'))
  writeFileSync(path.join(root, 'automations', 'runlog.py'), [
    'import sys, json, pathlib',
    `pathlib.Path(${JSON.stringify(path.join(root, 'argv.json'))}).write_text(json.dumps(sys.argv[1:]))`,
    `sys.stderr.write(${JSON.stringify(stderr)})`,
    `sys.exit(${exitCode})`,
  ].join('\n'))
  return root
}

test('exit 0 is ok, and the arguments reach the writer intact', (t) => {
  const root = instanceWithStub(0)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const r = runlogAppend(root, 'OS heartbeat', 'ok', '2 finding(s)')
  assert.equal(r.status, 'ok')
  const argv = JSON.parse(readFileSync(path.join(root, 'argv.json'), 'utf8'))
  assert.deepEqual(argv, ['append', '--automation', 'OS heartbeat', '--outcome', 'ok', '--note', '2 finding(s)'])
})

test('exit 3 is a refusal, with the reason carried through', (t) => {
  const root = instanceWithStub(3, 'refusing to write: the git index is UNMERGED')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const r of [runlogCheck(root, 'OS heartbeat'), runlogAppend(root, 'OS heartbeat', 'ok', '')]) {
    assert.equal(r.status, 'refused')
    assert.match(r.detail, /UNMERGED/)
  }
})

test('any other exit is an error, never ok', (t) => {
  const root = instanceWithStub(2, 'bad usage')
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal(runlogCheck(root, 'x').status, 'error')
})

test('an instance without runlog.py is reported absent', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runlog-bridge-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal(runlogCheck(root, 'x').status, 'absent')
})
