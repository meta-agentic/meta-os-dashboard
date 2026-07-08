// Read surfaces per meta-os systems/interface-layer.md. The vault is the database:
// everything here parses git-tracked markdown/JSON from the instance root. Every reader
// degrades to { available: false, reason } instead of throwing — degrade visibly.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import YAML from 'yaml'
import { nextRuns } from './cron.mjs'

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

    // Upcoming runs over the next 48h, derived from the cadence column (cron or
    // @nickname per the ontology contract). Event-driven rows ("—") have no schedule;
    // an unparseable cadence degrades to its reason instead of a guessed time.
    const now = new Date()
    const horizonHours = 48
    for (const r of rows) {
      if (r.status === 'retired' || !r.cadence || r.cadence === '—') continue
      const times = nextRuns(r.cadence, now, horizonHours * 3600e3)
      if (times === null) r.nextReason = `cadence "${r.cadence}" is not cron or a @nickname`
      else r.upcoming = times
    }
    return {
      available: true, rows, runLog: log.length > 0,
      schedule: { now: now.toISOString(), horizonHours },
    }
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

// Output inbox: finished deliverables in memory/output/ plus recent promotions into
// memory/wiki/ — the vault is the database, the inbox is just a view over it.
// Timestamps come from the instance git history (file-add dates); uncommitted files
// fall back to mtime and say so. A project's `output:` registry field (ontology) says
// where it delivers when NOT here — the widget links the two views together.
export async function outputs(instanceRoot, promotionWindowDays = 30) {
  try {
    // file → first-seen add date, newest history first so the latest add wins.
    const added = new Map()
    let gitOk = true
    try {
      const { stdout } = await run('git', [
        '-C', instanceRoot, 'log', '--diff-filter=A', '--date=iso-strict',
        '--pretty=format:\x01%ad', '--name-only', '--', 'memory/output', 'memory/wiki',
      ])
      let date = null
      for (const line of stdout.split('\n')) {
        if (line.startsWith('\x01')) date = line.slice(1)
        else if (line && date && !added.has(line)) added.set(line, date)
      }
    } catch {
      gitOk = false
    }

    const collect = async (stage) => {
      const dir = path.join(instanceRoot, 'memory', stage)
      const items = []
      for (const f of await mdFiles(dir)) {
        const rel = path.posix.join('memory', stage, f.file.split(path.sep).join('/'))
        let fm = {}
        try {
          fm = matter(await fs.readFile(path.join(dir, f.file), 'utf8')).data
        } catch { /* unreadable front-matter — still list the file */ }
        const ts = added.get(rel) ?? new Date(f.mtime).toISOString()
        items.push({
          file: f.file, stage, ts, committed: added.has(rel),
          type: fm.type ?? null, tags: fm.tags ?? [],
          project: (fm.tags ?? []).find((t) => String(t).startsWith('project/'))?.slice(8) ?? null,
        })
      }
      return items
    }

    const outputItems = await collect('output')
    const cutoff = Date.now() - promotionWindowDays * 864e5
    const promotions = (await collect('wiki')).filter((i) => new Date(i.ts).getTime() >= cutoff)
    const items = [...outputItems, ...promotions.map((p) => ({ ...p, promotion: true }))]
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    return {
      available: true, items, promotionWindowDays,
      counts: { output: outputItems.length, promotions: promotions.length },
      datesBasis: gitOk ? 'git add-dates; mtime for uncommitted files' : 'mtime only — instance is not a git repository',
    }
  } catch (e) {
    return unavailable(`memory/ unreadable: ${e.message}`)
  }
}

// Unified event timeline: vault commits + automation runs + backlog sprint
// transitions, normalized to { ts, source, actor, action, target, note? }. Composes
// only feeds that already exist — per-story transition events wait for the tracker
// changelog (the mirror carries no per-story timestamps). Each source degrades
// independently; a dead source is reported, not silently absent.
export async function events(instanceRoot, backlogs, limit = 40) {
  const out = []
  const sources = []

  try {
    const { stdout } = await run('git', [
      '-C', instanceRoot, 'log', `-${limit}`, '--date=iso-strict',
      '--pretty=format:%h%x09%ad%x09%an%x09%s',
    ])
    for (const l of stdout.split('\n').filter(Boolean)) {
      const [hash, date, author, ...s] = l.split('\t')
      out.push({ ts: date, source: 'vault', actor: author, action: 'commit', target: s.join('\t'), note: hash })
    }
    sources.push({ name: 'vault', available: true })
  } catch {
    sources.push({ name: 'vault', available: false, reason: 'instance root is not a git repository' })
  }

  try {
    const jsonl = await fs.readFile(path.join(instanceRoot, 'automations/runs.jsonl'), 'utf8')
    for (const l of jsonl.split('\n').filter(Boolean)) {
      try {
        const e = JSON.parse(l)
        out.push({
          ts: e.ts, source: 'automations', actor: e.automation,
          action: `run ${e.outcome ?? '?'}`, target: e.note ?? '',
        })
      } catch { /* malformed line — skip */ }
    }
    sources.push({ name: 'automations', available: true })
  } catch {
    sources.push({ name: 'automations', available: false, reason: 'no automations/runs.jsonl yet' })
  }

  // Sprint open/close from the backlog mirrors. Closed sprints report their delivered
  // count (stories DONE linked to the sprint) — sprint-close accounting, the only
  // timestamps the mirror has. Future/planned sprints emit nothing.
  const now = Date.now()
  for (const { space, path: p } of backlogs ?? []) {
    try {
      const d = JSON.parse(await fs.readFile(p, 'utf8'))
      const doneBySprint = new Map()
      for (const s of d.stories ?? []) {
        if (s.status === 'DONE' && s.sprint) doneBySprint.set(s.sprint, (doneBySprint.get(s.sprint) ?? 0) + 1)
      }
      for (const s of d.sprints ?? []) {
        const started = s.startDate && new Date(s.startDate).getTime() <= now
        if (started && ['IN PROGRESS', 'CLOSED'].includes(s.status))
          out.push({ ts: s.startDate, source: 'backlog', actor: space, action: 'sprint started', target: s.name ?? s.id })
        if (s.status === 'CLOSED' && s.endDate)
          out.push({
            ts: s.endDate, source: 'backlog', actor: space, action: 'sprint closed',
            target: s.name ?? s.id, note: `${doneBySprint.get(s.id) ?? 0} delivered`,
          })
      }
      sources.push({ name: `backlog:${space}`, available: true })
    } catch (e) {
      sources.push({ name: `backlog:${space}`, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }

  out.sort((a, b) => new Date(b.ts) - new Date(a.ts))
  return { available: true, events: out.slice(0, limit), sources }
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

      // Blocked is DERIVED (ontology flow.item_states): a not-done story whose
      // `dependencies` include a story the mirror knows and that isn't DONE yet.
      // Unknown dependency ids don't count — no guessing. Blocked AGE stays
      // unavailable: the mirror has no transition timestamps (same reason as
      // cycle-time below).
      const statusById = new Map((d.stories ?? []).map((s) => [s.jiraId, s.status]))
      const blockedBy = (s) =>
        (s.dependencies ?? []).filter((id) => statusById.has(id) && statusById.get(id) !== 'DONE')

      const byLane = new Map()
      for (const s of inSprint) {
        const state = STATE[s.status]
        if (!state) continue // NO GO etc. — out of flow
        const key = s.project ?? 'unassigned' // no project field → still in flow, own lane
        const lane = byLane.get(key) ?? { lane: key, queues: { todo: [], 'in-progress': [], done: [] } }
        const blockers = state === 'done' ? [] : blockedBy(s)
        lane.queues[state].push({
          id: s.jiraId, title: s.title, points: s.storyPoints ?? null, epic: s.epic ?? null,
          blockedBy: blockers.length ? blockers : null,
        })
        byLane.set(key, lane)
      }
      const pts = (q) => q.reduce((acc, i) => acc + (i.points ?? 0), 0)
      const laneRows = [...byLane.values()].map((l) => ({
        ...l,
        wip: l.queues['in-progress'].length,
        depth: l.queues.todo.length,
        done: l.queues.done.length,
        blocked: [...l.queues.todo, ...l.queues['in-progress']].filter((i) => i.blockedBy).length,
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
