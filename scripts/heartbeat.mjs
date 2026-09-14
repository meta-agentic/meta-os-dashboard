// OS heartbeat — the writer for the anomalies the dashboard displays.
// Reuses the server's readers directly (no running server needed): checks ontology lint,
// stale raw notes, and never-run scheduled automations; files a heartbeat note to
// memory/raw/ (ontology type `heartbeat`) and appends its own run to automations/runs.jsonl.
// Schedule via cron/launchd: `node scripts/heartbeat.mjs` (see automations/_index.md row).
//
// Failure leaves a trail. This job went dead for eight weeks and wrote nothing anywhere,
// so every exit path here now records itself: a `fail` line in automations/runs.jsonl
// (which the dashboard already renders as the row's outcome), a line in a durable
// user-level log, and a non-zero exit code for the scheduler to hold.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lint } from '../server/lint.mjs'
import * as read from '../server/readers.mjs'

const NAME = 'OS heartbeat'
// Resolved from this file, never from an absolute checkout path or the process CWD, so the
// script keeps working when the repo moves (a stale hardcoded path is what killed it before).
// fileURLToPath, not URL.pathname: the latter hands back a percent-encoded string, so a
// checkout under a directory with a space in it resolves to a path that does not exist.
const configPath = process.env.META_OS_CONFIG ?? fileURLToPath(new URL('../instance.config.json', import.meta.url))

// Durable because /tmp is purged on reboot and, worse, was never reached at all when the
// job died at exec time. ~/Library/Logs is the macOS convention (and Console.app reads it);
// elsewhere, the XDG state directory. META_OS_HEARTBEAT_LOG overrides both.
const durableLogPath = process.env.META_OS_HEARTBEAT_LOG ?? path.join(
  os.homedir(),
  process.platform === 'darwin' ? 'Library/Logs/metaos-heartbeat.log' : '.local/state/metaos-heartbeat.log',
)

async function durable(line) {
  try {
    await fs.mkdir(path.dirname(durableLogPath), { recursive: true })
    await fs.appendFile(durableLogPath, `${new Date().toISOString()} ${line}\n`)
  } catch (e) {
    // Last resort only: if even the durable log is unwritable, say so on stderr rather
    // than throwing and masking the original failure we were trying to record.
    console.error(`${NAME}: durable log unwritable (${durableLogPath}): ${e.message}`)
  }
}

async function recordRun(instanceRoot, outcome, note) {
  await durable(`${outcome} — ${note}`)
  if (!instanceRoot) return // config never resolved; runs.jsonl location is unknown
  const entry = JSON.stringify({ automation: NAME, ts: new Date().toISOString(), outcome, note })
  try {
    await fs.appendFile(path.join(instanceRoot, 'automations/runs.jsonl'), entry + '\n')
  } catch (e) {
    await durable(`could not append to automations/runs.jsonl: ${e.message}`)
  }
}

// Set as soon as the config resolves, so a later failure still knows where runs.jsonl lives.
let instanceRoot = null

try {
  // The config's paths carry `${var}` placeholders defined by its own `vars` block.
  // The server expands the whole config on load (server/index.mjs); this script must do
  // the same, or every path it touches stays a literal "${mova77}/…" and the run dies
  // on ENOENT after launchd has already reported success.
  const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'))
  const config = read.expandVars(rawConfig, rawConfig.vars ?? {})
  instanceRoot = config.instanceRoot
  if (!instanceRoot) throw new Error(`no instanceRoot in ${configPath}`)
  const frameworkRoot = config.frameworkRoot ?? path.dirname(await fs.realpath(path.join(instanceRoot, 'systems')))

  const today = new Date().toISOString().slice(0, 10)
  const findings = []

  const lintRes = await lint(instanceRoot, frameworkRoot)
  if (!lintRes.available) findings.push(`lint unavailable — ${lintRes.reason}`)
  else for (const v of lintRes.violations) findings.push(`ontology violation in \`${v.file}\`: ${v.problems.join('; ')}`)

  const mem = await read.memory(instanceRoot)
  if (mem.available) {
    const oldest = mem.stages.raw?.oldest
    const age = oldest ? Math.floor((Date.now() - oldest.mtime) / 864e5) : 0
    if (age > 7) findings.push(`stale raw note: \`${oldest.file}\` unpromoted for ${age}d`)
  }

  const autos = await read.automations(instanceRoot)
  if (autos.available) {
    for (const r of autos.rows) {
      if (r.status === 'shipped' && r.cadence && r.cadence !== '—' && !r.lastRun)
        findings.push(`shipped scheduled automation has never run: ${r.automation}`)
    }
  }

  const body = `---
type: heartbeat
date: ${today}
tags: [heartbeat, os]
---
# Heartbeat ${today}

Scheduled OS self-check. Anomalies below; healthy checks stay silent.

## Findings
${findings.length ? findings.map((f) => `- ${f}`).join('\n') : '- none — all checks green'}

## Actions taken / suggested
- ${findings.length ? 'review findings above; promote or fix, then delete this note' : 'nothing to do; delete this note'}
`
  const noteFile = path.join(instanceRoot, `memory/raw/heartbeat-${today}.md`)
  await fs.writeFile(noteFile, body)

  await recordRun(instanceRoot, 'ok', `${findings.length} finding(s)`)
  console.log(`${NAME}: ${findings.length} finding(s) → ${noteFile}`)
} catch (e) {
  await recordRun(instanceRoot, 'fail', `${e.message}`)
  await durable(`stack: ${e.stack?.split('\n').slice(1).join(' | ') ?? '(none)'}`)
  console.error(`${NAME}: FAILED — ${e.message}`)
  console.error(`${NAME}: see ${durableLogPath}`)
  // Non-zero so `launchctl list` holds the failure and the scheduler's own log records it.
  process.exitCode = 1
}
