// Scrum reporting + roadmap, derived from the backlog mirror (scrum/<space>/backlog.json).
// Honest by construction: the mirror carries no per-story transition timestamps, so we
// never fabricate a historical burndown curve — only committed vs current-remaining.
import fs from 'node:fs/promises'

const WEEK = 6048e5
const DONE = 'DONE'
const bucketOf = (status) =>
  status === DONE ? 'Done'
    : status === 'IN PROGRESS' ? 'In progress'
      : status === 'TO DO' || status === 'PLANNED' ? 'To do'
        : status === 'NO GO' ? 'No go'
          : 'Other'

function membersOf(sprint, stories) {
  const ids = new Set(sprint.issues ?? [])
  return stories.filter((s) => s.sprint === sprint.id || ids.has(s.jiraId))
}
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0)

async function reportSpace(space, p) {
  const d = JSON.parse(await fs.readFile(p, 'utf8'))
  const stories = d.stories ?? []
  const sprints = d.sprints ?? []
  const statusById = new Map(stories.map((s) => [s.jiraId, s.status]))
  const isBlocked = (s) =>
    s.status !== DONE && (s.dependencies ?? []).some((id) => statusById.has(id) && statusById.get(id) !== DONE)

  // Per-sprint rollup (committed vs delivered), used by velocity + gantt.
  const sprintRows = sprints.map((sp) => {
    const m = membersOf(sp, stories)
    const done = m.filter((s) => s.status === DONE)
    return {
      id: sp.id, name: sp.name ?? sp.id, status: sp.status,
      start: sp.startDate ?? null, end: sp.endDate ?? null,
      committed: m.length, committedPts: sum(m, (s) => s.storyPoints),
      done: done.length, donePts: sum(done, (s) => s.storyPoints),
    }
  })

  // Velocity: delivered points per CLOSED sprint, in time order.
  const velocity = sprintRows
    .filter((r) => r.status === 'CLOSED' && r.end)
    .sort((a, b) => a.end.localeCompare(b.end))
    .map((r) => ({ label: r.name, value: r.donePts || r.done }))

  // Status mix across the whole backlog (count + points per bucket).
  const mix = new Map()
  for (const s of stories) {
    const b = bucketOf(s.status)
    const cur = mix.get(b) ?? { label: b, value: 0, points: 0 }
    cur.value += 1
    cur.points += s.storyPoints ?? 0
    mix.set(b, cur)
  }
  const ORDER = ['To do', 'In progress', 'Done', 'No go', 'Other']
  const statusMix = [...mix.values()].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label))

  // Scorecard + honest burndown for the active sprint.
  const active = sprints.find((sp) => sp.status === 'IN PROGRESS')
  const activeMembers = active ? membersOf(active, stories) : []
  const activeDonePts = sum(activeMembers.filter((s) => s.status === DONE), (s) => s.storyPoints)
  const activeCommittedPts = sum(activeMembers, (s) => s.storyPoints)
  const closed = sprintRows.filter((r) => r.status === 'CLOSED' && r.start && r.end)
  const weeks = sum(closed, (r) => Math.max((new Date(r.end) - new Date(r.start)) / WEEK, 0.1))
  const velocityPerWeek = weeks ? +(sum(closed, (r) => r.donePts) / weeks).toFixed(1) : null

  const now = Date.now()
  let elapsed = null
  if (active?.startDate && active?.endDate) {
    const t0 = new Date(active.startDate), t1 = new Date(active.endDate)
    if (t1 > t0) elapsed = Math.min(Math.max((now - t0) / (t1 - t0), 0), 1)
  }

  const scorecard = {
    total: stories.length,
    done: stories.filter((s) => s.status === DONE).length,
    wip: stories.filter((s) => s.status === 'IN PROGRESS').length,
    todo: stories.filter((s) => s.status === 'TO DO' || s.status === 'PLANNED').length,
    blocked: stories.filter(isBlocked).length,
    pointsTotal: sum(stories, (s) => s.storyPoints),
    pointsDone: sum(stories.filter((s) => s.status === DONE), (s) => s.storyPoints),
    activeSprint: active?.name ?? null,
    elapsed,
    velocityPerWeek,
  }
  const burndown = active
    ? { committed: activeCommittedPts, remaining: activeCommittedPts - activeDonePts, elapsed, sprint: active.name ?? active.id }
    : null

  return { space, scorecard, velocity, statusMix, burndown, sprints: sprintRows }
}

export async function reports(backlogs) {
  if (!backlogs?.length) return { available: false, reason: 'no backlogs configured', spaces: [], roadmap: [] }
  const spaces = []
  for (const { space, path: p } of backlogs) {
    try { spaces.push(await reportSpace(space, p)) } catch (e) {
      spaces.push({ space, available: false, reason: `backlog unreadable: ${e.message}` })
    }
  }
  // Cross-space roadmap: every dated sprint as a gantt bar.
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
