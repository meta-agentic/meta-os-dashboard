// Bridge from Node automations to the instance's shared guarded writer,
// `<instanceRoot>/automations/runlog.py`.
//
// Why a bridge and not a JS copy of the guard: an automation that appended into a
// tracked file while the instance's git index was unmerged produced a file matching no
// stage, with a record that existed nowhere in git. The instance fixed that once, in one
// writer every automation goes through. A second implementation here is how the next
// script ends up with a guard that drifted, so this module only calls the instance's.
//
// Every call returns { status, detail }:
//   'ok'       the write happened (append) or writing is safe (check)
//   'refused'  the index is unmerged — write NOTHING tracked, and say so loudly
//   'absent'   the instance has no runlog.py (an older instance): caller falls back
//   'error'    runlog.py could not answer (python missing, bad usage, git failure)
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export const EXIT_REFUSED = 3

export function runlogPath(instanceRoot) {
  return path.join(instanceRoot, 'automations', 'runlog.py')
}

function call(instanceRoot, args) {
  const script = runlogPath(instanceRoot)
  if (!existsSync(script)) return { status: 'absent', detail: `${script} not found` }
  const r = spawnSync(process.env.META_OS_PYTHON ?? 'python3', [script, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
  })
  const detail = (r.stderr || r.stdout || r.error?.message || '').trim()
  if (r.status === 0) return { status: 'ok', detail }
  if (r.status === EXIT_REFUSED) return { status: 'refused', detail }
  return { status: 'error', detail: detail || `runlog.py exited ${r.status ?? r.signal}` }
}

// Is it safe to write tracked files in this instance right now?
export function runlogCheck(instanceRoot, automation) {
  return call(instanceRoot, ['check', '--root', instanceRoot, '--automation', automation])
}

// Record one run in the instance's runs.jsonl, through the guard.
export function runlogAppend(instanceRoot, automation, outcome, note) {
  return call(instanceRoot, ['append', '--automation', automation, '--outcome', outcome, '--note', note])
}
