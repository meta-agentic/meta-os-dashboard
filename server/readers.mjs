// Read surfaces per meta-os systems/interface-layer.md. The vault is the database:
// everything here parses git-tracked markdown/JSON from the instance root. Every reader
// degrades to { available: false, reason } instead of throwing — degrade visibly.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import YAML from 'yaml'

const run = promisify(execFile)
const unavailable = (reason) => ({ available: false, reason })

// Strip [[target|label]] / [[target]] wikilinks and inline code to plain text.
const plain = (s) =>
  s.replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').replace(/`([^`]*)`/g, '$1').trim()

export async function ontology(frameworkRoot) {
  try {
    const raw = await fs.readFile(path.join(frameworkRoot, 'systems/ontology.yaml'), 'utf8')
    return { available: true, ...YAML.parse(raw) }
  } catch {
    return unavailable('systems/ontology.yaml not found under frameworkRoot')
  }
}

export async function registry(instanceRoot) {
  const dir = path.join(instanceRoot, 'projects')
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md') && f !== '_index.md')
    const projects = await Promise.all(
      files.map(async (f) => {
        const { data, content } = matter(await fs.readFile(path.join(dir, f), 'utf8'))
        const purpose = content.match(/\*\*(.+?)\*\*/)?.[1] ?? ''
        return { note: f, purpose: plain(purpose), ...data }
      }),
    )
    return { available: true, projects }
  } catch (e) {
    return unavailable(`projects/ unreadable: ${e.message}`)
  }
}

export async function automations(instanceRoot) {
  try {
    const md = await fs.readFile(path.join(instanceRoot, 'automations/_index.md'), 'utf8')
    const lines = md.split('\n').filter((l) => /^\s*\|/.test(l))
    // Strip wikilinks BEFORE splitting: [[target|label]] carries a pipe of its own.
    const cells = (l) => plain(l).split('|').slice(1, -1).map((c) => c.trim())
    const header = cells(lines[0] ?? '').map((h) => h.toLowerCase())
    const rows = lines
      .slice(2) // skip header + separator
      .map(cells)
      .filter((r) => r.length === header.length)
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))

    // Last run per automation from automations/runs.jsonl (see ontology `automations:`).
    // Absent log → every row reports lastRun: null; the UI renders "never".
    let log = []
    try {
      const jsonl = await fs.readFile(path.join(instanceRoot, 'automations/runs.jsonl'), 'utf8')
      log = jsonl.split('\n').filter(Boolean).flatMap((l) => {
        try { return [JSON.parse(l)] } catch { return [] }
      })
    } catch { /* no run log yet — degrade */ }
    const lastByName = new Map()
    for (const e of log) {
      const prev = lastByName.get(e.automation)
      if (!prev || e.ts > prev.ts) lastByName.set(e.automation, e)
    }
    for (const r of rows) {
      const last = lastByName.get(r.automation) ?? null
      r.lastRun = last && { ts: last.ts, outcome: last.outcome ?? null }
    }
    return { available: true, rows, runLog: log.length > 0 }
  } catch (e) {
    return unavailable(`automations/_index.md unreadable: ${e.message}`)
  }
}

async function mdFiles(dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_index.md') {
      const full = path.join(entry.parentPath ?? entry.path, entry.name)
      out.push({ file: path.relative(dir, full), mtime: (await fs.stat(full)).mtimeMs })
    }
  }
  return out
}

// 24h high-water mark per stage, from samples the server records as it observes counts.
// Sampled (not derived from git) because unpromoted raw notes are often uncommitted.
// Lives in a gitignored cache — derived observability state, not vault data.
const SAMPLES_FILE = new URL('../.cache/memory-samples.json', import.meta.url).pathname

async function sampleCounts(counts) {
  let samples = []
  try { samples = JSON.parse(await fs.readFile(SAMPLES_FILE, 'utf8')) } catch { /* first run */ }
  const now = Date.now()
  samples = samples.filter((s) => now - s.ts < 864e5)
  const last = samples.at(-1)
  if (!last || ['raw', 'wiki', 'output'].some((k) => last[k] !== counts[k])) {
    samples.push({ ts: now, ...counts })
    await fs.mkdir(path.dirname(SAMPLES_FILE), { recursive: true })
    await fs.writeFile(SAMPLES_FILE, JSON.stringify(samples))
  }
  return samples
}

export async function memory(instanceRoot) {
  try {
    const stages = {}
    for (const stage of ['raw', 'wiki', 'output']) {
      const notes = await mdFiles(path.join(instanceRoot, 'memory', stage))
      notes.sort((a, b) => a.mtime - b.mtime)
      stages[stage] = {
        count: notes.length,
        oldest: notes[0] ?? null,
        newest: notes.at(-1) ?? null,
      }
    }
    const counts = Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, v.count]))
    const samples = await sampleCounts(counts)
    for (const stage of Object.keys(stages)) {
      stages[stage].capacity = Math.max(stages[stage].count, ...samples.map((s) => s[stage] ?? 0))
    }

    // Federated vaults (vaults/ symlinks) are navigation, not canon — reported as
    // context so pipeline zeros don't read as "the OS knows nothing". Symlinks must be
    // resolved per-vault: recursive readdir does not descend into linked directories.
    const vaults = []
    try {
      const dir = path.join(instanceRoot, 'vaults')
      for (const name of await fs.readdir(dir)) {
        try {
          const target = await fs.realpath(path.join(dir, name))
          if (!(await fs.stat(target)).isDirectory()) continue
          vaults.push({ name, notes: (await mdFiles(target)).length })
        } catch { /* broken symlink — skip */ }
      }
    } catch { /* no vaults/ folder — fine */ }
    return { available: true, stages, federated: { vaults, total: vaults.reduce((a, v) => a + v.notes, 0) } }
  } catch (e) {
    return unavailable(`memory/ unreadable: ${e.message}`)
  }
}

export async function activity(instanceRoot, limit = 15) {
  try {
    const { stdout } = await run('git', [
      '-C', instanceRoot, 'log', `-${limit}`, '--date=iso-strict',
      '--pretty=format:%h%x09%ad%x09%s',
    ])
    const commits = stdout.split('\n').filter(Boolean).map((l) => {
      const [hash, date, ...s] = l.split('\t')
      return { hash, date, subject: s.join('\t') }
    })
    return { available: true, commits }
  } catch {
    return unavailable('instance root is not a git repository (or git log failed)')
  }
}

// Lane derivation per ontology flow: group active-sprint stories by their `project`
// field (the swarm-harness rule: a lane is a distinct codebase/service). Forecast is
// velocity-based from closed sprints; the backlog mirror has no per-story transition
// timestamps, so cycle-time is reported unavailable rather than faked.
const STATE = { 'TO DO': 'todo', PLANNED: 'todo', 'IN PROGRESS': 'in-progress', DONE: 'done' }

export async function lanes(backlogs) {
  if (!backlogs?.length) return unavailable('no backlogs configured in instance.config.json')
  const spaces = []
  for (const { space, path: p } of backlogs) {
    try {
      const d = JSON.parse(await fs.readFile(p, 'utf8'))
      const active = (d.sprints ?? []).filter((s) => s.status === 'IN PROGRESS')
      const activeIds = new Set(active.map((s) => s.id))
      // Membership is linked from both sides in the mirror (story.sprint and
      // sprint.issues[]), and the current sprint often only has the latter — union them.
      const activeIssues = new Set(active.flatMap((s) => s.issues ?? []))
      const inSprint = (d.stories ?? []).filter(
        (s) => activeIds.has(s.sprint) || activeIssues.has(s.jiraId),
      )

      const byLane = new Map()
      for (const s of inSprint) {
        const state = STATE[s.status]
        if (!state) continue // NO GO etc. — out of flow
        const lane = byLane.get(s.project) ?? { lane: s.project, queues: { todo: [], 'in-progress': [], done: [] } }
        lane.queues[state].push({ id: s.jiraId, title: s.title, points: s.storyPoints ?? null, epic: s.epic ?? null })
        byLane.set(s.project, lane)
      }
      const pts = (q) => q.reduce((acc, i) => acc + (i.points ?? 0), 0)
      const laneRows = [...byLane.values()].map((l) => ({
        ...l,
        wip: l.queues['in-progress'].length,
        depth: l.queues.todo.length,
        done: l.queues.done.length,
        points: { todo: pts(l.queues.todo), wip: pts(l.queues['in-progress']), done: pts(l.queues.done) },
      })).sort((a, b) => b.wip + b.depth - (a.wip + a.depth))

      // Velocity: done stories per week over closed sprints that have dates.
      const closed = (d.sprints ?? []).filter((s) => s.status === 'CLOSED' && s.startDate && s.endDate)
      const doneBySprint = new Map()
      for (const s of d.stories ?? []) {
        if (s.status === 'DONE' && s.sprint) doneBySprint.set(s.sprint, (doneBySprint.get(s.sprint) ?? 0) + 1)
      }
      let throughput = null
      if (closed.length) {
        const weeks = closed.reduce((acc, s) => acc + Math.max((new Date(s.endDate) - new Date(s.startDate)) / 6048e5, 0.1), 0)
        const total = closed.reduce((acc, s) => acc + (doneBySprint.get(s.id) ?? 0), 0)
        throughput = total / weeks
      }

      // Acceleration: last closed sprint's velocity vs the MEDIAN of the (up to) 3
      // sprints before it — median damps one-off hot/cold sprints that a last-two
      // comparison would amplify. Needs 2+ closed sprints and a nonzero baseline.
      const perSprint = closed
        .map((s) => ({
          id: s.id,
          end: s.endDate,
          velocity: (doneBySprint.get(s.id) ?? 0) / Math.max((new Date(s.endDate) - new Date(s.startDate)) / 6048e5, 0.1),
        }))
        .sort((a, b) => a.end.localeCompare(b.end))
      const last = perSprint.at(-1)
      const window = perSprint.slice(-4, -1)
      const median = (xs) => {
        const v = xs.map((s) => s.velocity).sort((a, b) => a - b)
        return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : 0
      }
      const baseline = median(window)
      const acceleration =
        window.length >= 1 && baseline > 0
          ? {
              pct: +(((last.velocity - baseline) / baseline) * 100).toFixed(0),
              last: { id: last.id, velocity: +last.velocity.toFixed(1) },
              baseline: { velocity: +baseline.toFixed(1), sprints: window.map((s) => s.id) },
            }
          : null
      const remaining = laneRows.reduce((acc, l) => acc + l.depth + l.wip, 0)
      spaces.push({
        space,
        sprint: active.map((s) => ({ id: s.id, name: s.name, start: s.startDate, end: s.endDate })),
        lanes: laneRows,
        forecast: {
          throughputPerWeek: throughput ? +throughput.toFixed(1) : null,
          acceleration,
          etaWeeks: throughput && remaining ? +(remaining / throughput).toFixed(1) : null,
          basis: `velocity over ${closed.length} closed sprints`,
          cycleTime: null,
          cycleTimeReason: 'backlog mirror carries no per-story transition timestamps (authority: tracker changelog)',
        },
      })
    } catch (e) {
      spaces.push({ space, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }
  return { available: true, spaces }
}
