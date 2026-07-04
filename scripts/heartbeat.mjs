// OS heartbeat — the writer for the anomalies the dashboard displays.
// Reuses the server's readers directly (no running server needed): checks ontology lint,
// stale raw notes, and never-run scheduled automations; files a heartbeat note to
// memory/raw/ (ontology type `heartbeat`) and appends its own run to automations/runs.jsonl.
// Schedule via cron/launchd: `node scripts/heartbeat.mjs` (see automations/_index.md row).
import fs from 'node:fs/promises'
import path from 'node:path'
import { lint } from '../server/lint.mjs'
import * as read from '../server/readers.mjs'

const NAME = 'OS heartbeat'
const configPath = process.env.META_OS_CONFIG ?? new URL('../instance.config.json', import.meta.url).pathname
const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
const instanceRoot = config.instanceRoot
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

const runEntry = JSON.stringify({ automation: NAME, ts: new Date().toISOString(), outcome: 'ok', note: `${findings.length} finding(s)` })
await fs.appendFile(path.join(instanceRoot, 'automations/runs.jsonl'), runEntry + '\n')

console.log(`${NAME}: ${findings.length} finding(s) → ${noteFile}`)
