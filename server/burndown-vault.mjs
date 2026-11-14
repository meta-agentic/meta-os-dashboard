// The daily burndown from the vault itself. A DONE item carries the day it was finished
// (`completed:`, written by `transition … DONE`), so a sprint's remaining points on day D
// are its committed points minus the points credited to it by items finished on or before
// D. This replaces burndown.json, whose exporter replayed a tracker changelog that no
// longer exists.
//
// Honest by construction: when any item the sprint is credited for carries no completed
// date (work closed before the field existed), there is no series and the reason says
// how many, rather than a curve with a silent hole. Scope added mid-sprint is counted from
// day 0: the vault records when an item was committed only in prose, so the curve starts
// at the sprint's full scope, the same figure as the "committed" tile.
import { sprintMembers } from './backlog-schema.mjs'
import { sprintCredit } from './delivery.mjs'

const DONE = 'DONE'
const DAY = 864e5

const dayAfter = (iso) => new Date(Date.parse(iso + 'T00:00:00Z') + DAY).toISOString().slice(0, 10)

/**
 * @param {object} sprint  normalized sprint ({ id, name, status, start, end })
 * @param {object[]} members  normalized stories in the sprint
 * @param {string} today  ISO day, the last day the series may reach
 * @returns {{ series: object|null, reason: string|null }}
 */
export function vaultBurndown(sprint, members, today) {
  if (!sprint?.start || !sprint?.end) return { series: null, reason: 'the sprint has no start or end date' }
  if (sprint.start > today) return { series: null, reason: 'the sprint has not started' }

  const committed = members.reduce((a, s) => a + (s.storyPoints || 0), 0)
  if (!committed) return { series: null, reason: 'the sprint has no pointed work' }

  const credited = members
    .filter((s) => s.status === DONE && sprintMembers(s).includes(sprint.id))
    .map((s) => ({ id: s.id, pts: sprintCredit(s, sprint.id).pts || 0, completed: s.completed ?? null }))
    .filter((c) => c.pts > 0)
  const undated = credited.filter((c) => !c.completed)
  if (undated.length) {
    return {
      series: null,
      reason: `${undated.length} delivered item${undated.length === 1 ? '' : 's'} carr${undated.length === 1 ? 'ies' : 'y'} no completed date (${undated.slice(0, 3).map((c) => c.id).join(', ')}${undated.length > 3 ? ', …' : ''})`,
    }
  }

  // Through the planned end, or later when work was finished after it (an overrun), never past today.
  const lastFinished = credited.reduce((a, c) => (c.completed > a ? c.completed : a), sprint.end)
  const last = [lastFinished, today].sort()[0]

  const days = []
  for (let d = sprint.start; d <= last; d = dayAfter(d)) {
    const done = credited.filter((c) => c.completed <= d).reduce((a, c) => a + c.pts, 0)
    days.push({ date: d, remaining: committed - done, done })
  }
  return {
    series: { sprint: sprint.id, name: sprint.name, status: sprint.status, start: sprint.start, end: sprint.end, committed, days },
    reason: null,
  }
}
