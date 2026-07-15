// Reader implementations backed by GitHub API (private repos via server-side token).
import path from 'node:path'
import matter from 'gray-matter'
import YAML from 'yaml'
import { nextRuns } from './cron.mjs'
import { expandVars } from './readers.mjs'
import { reportFromData } from './reports.mjs'

const unavailable = (reason) => ({ available: false, reason })
const plain = (s) =>
  s.replace(/\[\[([^\]|]*\|)?([^\]]+)\]\]/g, '$2').replace(/`([^`]*)`/g, '$1').trim()

export async function meta(ctx) {
  const { instance, vault, framework } = ctx
  return {
    instance: instance.repo,
    instanceRoot: `github:${instance.label()}`,
    frameworkRoot: `github:${framework.label()}`,
    vaultRoot: `github:${vault.label()}`,
    source: 'github',
    roots: ['instance', 'framework'],
    mode: 'live',
  }
}

export async function ontology(ctx) {
  try {
    const raw = await ctx.framework.readText('systems/ontology.yaml')
    return { available: true, ...YAML.parse(raw) }
  } catch (e) {
    return unavailable(`systems/ontology.yaml not found on ${ctx.framework.label()}: ${e.message}`)
  }
}

export async function registry(ctx, vars = {}) {
  try {
    await ctx.instance.ensureTree()
    const { files } = await ctx.instance.listDir('projects')
    const projects = await Promise.all(
      files
        .filter((f) => f.name.endsWith('.md') && f.name !== '_index.md')
        .map(async (f) => {
          const { data, content } = matter(await ctx.instance.readText(f.path))
          const purpose = content.match(/\*\*(.+?)\*\*/)?.[1] ?? ''
          return { note: f.name, purpose: plain(purpose), ...data, path: expandVars(data.path, vars) }
        }),
    )
    return { available: true, projects }
  } catch (e) {
    return unavailable(`projects/ unreadable on ${ctx.instance.label()}: ${e.message}`)
  }
}

export async function automations(ctx) {
  try {
    const md = await ctx.instance.readText('automations/_index.md')
    const lines = md.split('\n').filter((l) => /^\s*\|/.test(l))
    const cells = (l) => plain(l).split('|').slice(1, -1).map((c) => c.trim())
    const header = cells(lines[0] ?? '').map((h) => h.toLowerCase())
    const rows = lines
      .slice(2)
      .map(cells)
      .filter((r) => r.length === header.length)
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))

    let log = []
    try {
      const jsonl = await ctx.instance.readText('automations/runs.jsonl')
      log = jsonl.split('\n').filter(Boolean).flatMap((l) => {
        try { return [JSON.parse(l)] } catch { return [] }
      })
    } catch { /* no run log */ }

    const lastByName = new Map()
    for (const e of log) {
      const prev = lastByName.get(e.automation)
      if (!prev || e.ts > prev.ts) lastByName.set(e.automation, e)
    }
    for (const r of rows) {
      const last = lastByName.get(r.automation) ?? null
      r.lastRun = last && { ts: last.ts, outcome: last.outcome ?? null }
    }

    const now = new Date()
    const horizonHours = 48
    for (const r of rows) {
      if (r.status === 'retired' || !r.cadence || r.cadence === '—') continue
      const times = nextRuns(r.cadence, now, horizonHours * 3600e3)
      if (times === null) r.nextReason = `cadence "${r.cadence}" is not cron or a @nickname`
      else r.upcoming = times
    }
    return { available: true, rows, runLog: log.length > 0, schedule: { now: now.toISOString(), horizonHours } }
  } catch (e) {
    return unavailable(`automations/_index.md unreadable: ${e.message}`)
  }
}

export async function memory(ctx) {
  try {
    const stages = {}
    for (const stage of ['raw', 'wiki', 'output']) {
      const notes = await ctx.instance.mdFiles(`memory/${stage}`)
      notes.sort((a, b) => a.mtime - b.mtime)
      stages[stage] = {
        count: notes.length,
        oldest: notes[0] ?? null,
        newest: notes.at(-1) ?? null,
        capacity: notes.length,
      }
    }

    const vaults = []
    try {
      await ctx.vault.ensureTree()
      for (const name of await ctx.vault.topLevelDirs()) {
        if (name === 'README.md') continue
        try {
          const notes = []
          for (const stage of ['raw', 'wiki', 'output']) {
            const stageNotes = await ctx.vault.mdFiles(`${name}/${stage}`)
            notes.push(...stageNotes)
          }
          vaults.push({
            name,
            notes: notes.length,
            newest: notes.length ? Math.max(...notes.map((n) => n.mtime)) : null,
          })
        } catch { /* skip broken vault */ }
      }
    } catch { /* no vault repo */ }

    vaults.sort((a, b) => b.notes - a.notes)
    const newest = vaults.reduce((m, v) => Math.max(m, v.newest ?? 0), 0) || null
    return {
      available: true,
      stages,
      federated: { vaults, total: vaults.reduce((a, v) => a + v.notes, 0), newest },
    }
  } catch (e) {
    return unavailable(`memory/ unreadable: ${e.message}`)
  }
}

export async function activity(ctx, limit = 15) {
  try {
    const commits = await ctx.instance.commits(limit)
    return {
      available: true,
      commits: commits.map((c) => ({ hash: c.hash, date: c.date, subject: c.subject })),
    }
  } catch {
    return unavailable(`commit history unavailable for ${ctx.instance.label()}`)
  }
}

export async function outputs(ctx, promotionWindowDays = 30) {
  try {
    const collect = async (stage) => {
      const notes = await ctx.instance.mdFiles(`memory/${stage}`)
      const items = []
      for (const f of notes) {
        const rel = path.posix.join('memory', stage, f.file.split(path.sep).join('/'))
        let fm = {}
        try {
          fm = matter(await ctx.instance.readText(f.path)).data
        } catch { /* still list */ }
        items.push({
          file: f.file,
          stage,
          ts: new Date(f.mtime).toISOString(),
          committed: true,
          type: fm.type ?? null,
          tags: fm.tags ?? [],
          project: (fm.tags ?? []).find((t) => String(t).startsWith('project/'))?.slice(8) ?? null,
        })
      }
      return items
    }

    const outputItems = await collect('output')
    const cutoff = Date.now() - promotionWindowDays * 864e5
    const promotions = (await collect('wiki')).filter((i) => new Date(i.ts).getTime() >= cutoff)
    const items = [...outputItems, ...promotions.map((p) => ({ ...p, promotion: true }))]
      .sort((a, b) => new Date(b.ts) - new Date(a.ts).getTime())
    return {
      available: true,
      items,
      promotionWindowDays,
      counts: { output: outputItems.length, promotions: promotions.length },
      datesBasis: 'last-commit date per file (GitHub API)',
    }
  } catch (e) {
    return unavailable(`memory/ unreadable: ${e.message}`)
  }
}

export async function events(ctx, limit = 40) {
  const out = []
  const sources = []

  try {
    for (const c of await ctx.instance.commits(limit)) {
      out.push({
        ts: c.date,
        source: 'vault',
        actor: c.author,
        action: 'commit',
        target: c.subject,
        note: c.hash,
      })
    }
    sources.push({ name: 'vault', available: true })
  } catch {
    sources.push({ name: 'vault', available: false, reason: 'instance commit history unavailable' })
  }

  try {
    const jsonl = await ctx.instance.readText('automations/runs.jsonl')
    for (const l of jsonl.split('\n').filter(Boolean)) {
      try {
        const e = JSON.parse(l)
        out.push({
          ts: e.ts,
          source: 'automations',
          actor: e.automation,
          action: `run ${e.outcome ?? '?'}`,
          target: e.note ?? '',
        })
      } catch { /* skip */ }
    }
    sources.push({ name: 'automations', available: true })
  } catch {
    sources.push({ name: 'automations', available: false, reason: 'no automations/runs.jsonl yet' })
  }

  for (const { space, repo, path: p } of ctx.backlogs) {
    try {
      const d = await repo.readJson(p)
      const doneBySprint = new Map()
      for (const s of d.stories ?? []) {
        if (s.status === 'DONE' && s.sprint) doneBySprint.set(s.sprint, (doneBySprint.get(s.sprint) ?? 0) + 1)
      }
      const now = Date.now()
      for (const s of d.sprints ?? []) {
        const started = s.startDate && new Date(s.startDate).getTime() <= now
        if (started && ['IN PROGRESS', 'CLOSED'].includes(s.status)) {
          out.push({ ts: s.startDate, source: 'backlog', actor: space, action: 'sprint started', target: s.name ?? s.id })
        }
        if (s.status === 'CLOSED' && s.endDate) {
          out.push({
            ts: s.endDate,
            source: 'backlog',
            actor: space,
            action: 'sprint closed',
            target: s.name ?? s.id,
            note: `${doneBySprint.get(s.id) ?? 0} delivered`,
          })
        }
      }
      sources.push({ name: `backlog:${space}`, available: true })
    } catch (e) {
      sources.push({ name: `backlog:${space}`, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }

  out.sort((a, b) => new Date(b.ts) - new Date(a.ts))
  return { available: true, events: out.slice(0, limit), sources }
}

const STATE = { 'TO DO': 'todo', PLANNED: 'todo', 'IN PROGRESS': 'in-progress', DONE: 'done' }

export async function lanes(ctx) {
  if (!ctx.backlogs?.length) return unavailable('no backlogs configured in github.backlogs')
  const spaces = []
  for (const { space, repo, path: p } of ctx.backlogs) {
    try {
      const d = await repo.readJson(p)
      const active = (d.sprints ?? []).filter((s) => s.status === 'IN PROGRESS')
      const activeIds = new Set(active.map((s) => s.id))
      const activeIssues = new Set(active.flatMap((s) => s.issues ?? []))
      const inSprint = (d.stories ?? []).filter(
        (s) => activeIds.has(s.sprint) || activeIssues.has(s.jiraId),
      )
      const statusById = new Map((d.stories ?? []).map((s) => [s.jiraId, s.status]))
      const blockedBy = (s) =>
        (s.dependencies ?? []).filter((id) => statusById.has(id) && statusById.get(id) !== 'DONE')

      const byLane = new Map()
      for (const s of inSprint) {
        const state = STATE[s.status]
        if (!state) continue
        const key = s.project ?? 'unassigned'
        const lane = byLane.get(key) ?? { lane: key, queues: { todo: [], 'in-progress': [], done: [] } }
        const blockers = state === 'done' ? [] : blockedBy(s)
        lane.queues[state].push({
          id: s.jiraId,
          title: s.title,
          points: s.storyPoints ?? null,
          epic: s.epic ?? null,
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
        window.length >= 1 && baseline > 0 && last
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
          cycleTimeReason: 'backlog mirror carries no per-story transition timestamps',
        },
      })
    } catch (e) {
      spaces.push({ space, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }
  return { available: true, spaces }
}

export async function usage() {
  return unavailable('engine usage is local-only — not available in github source mode')
}

export async function reports(ctx) {
  if (!ctx.backlogs?.length) return { available: false, reason: 'no backlogs configured', spaces: [], roadmap: [] }
  const spaces = []
  for (const { space, repo, path: p } of ctx.backlogs) {
    try {
      spaces.push(reportFromData(space, await repo.readJson(p)))
    } catch (e) {
      spaces.push({ space, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }
  const roadmap = spaces
    .filter((s) => s.sprints)
    .flatMap((s) => s.sprints
      .filter((r) => r.start && r.end)
      .map((r) => ({
        space: s.space, id: r.id, name: r.name, start: r.start, end: r.end, status: r.status,
        donePct: r.committed ? Math.round((r.done / r.committed) * 100) : 0,
      })))
    .sort((a, b) => a.start.localeCompare(b.start))
  return { spaces, roadmap }
}

export async function lint(ctx) {
  // Lightweight lint: check instance memory/ notes only (skip symlink dirs).
  try {
    const raw = await ctx.framework.readText('systems/ontology.yaml')
    const ontology = YAML.parse(raw)
    if (!ontology?.note_types) return unavailable('ontology.yaml not found')

    const violations = []
    let checked = 0
    for (const stage of ['raw', 'wiki', 'output']) {
      const notes = await ctx.instance.mdFiles(`memory/${stage}`)
      for (const f of notes) {
        checked++
        const rel = path.posix.join('memory', stage, f.file)
        let data
        try {
          data = matter(await ctx.instance.readText(f.path)).data
        } catch (e) {
          violations.push({ file: rel, problems: [`unparseable front-matter: ${e.message}`] })
          continue
        }
        if (!data?.type) violations.push({ file: rel, problems: ['missing required field: type'] })
        else if (!ontology.note_types[data.type]) {
          violations.push({ file: rel, problems: [`unknown type: "${data.type}"`] })
        }
      }
    }
    return { available: true, checked, violations, violationCount: violations.length }
  } catch (e) {
    return unavailable(`lint failed: ${e.message}`)
  }
}