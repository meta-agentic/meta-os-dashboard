// What a sprint delivered, counted once, by the rules the sprint close applies
// (the backlog tooling's `backlog.py sprint close` and `sprint start`).
//
//   · CLOSED: the close's own record wins. `deliveredItems`, `deliveredSP` and the
//     `delivered` list are what the close stamped into the sprint file; nothing is
//     recounted from live items, so a later edit to an item cannot change history.
//     An export without the stamps is counted like an open sprint.
//   · OPEN (active or planned): each DONE member is credited by vaultlib.sprint_credit,
//     ported as `sprintCredit` below. An item without a `deliveredPoints` map counts in
//     full in every sprint it names; with one, a sprint is credited only its own slice,
//     and the item counts once, in the sprint that finished it (the map's last entry).
//     A carried item (first sprint 0, second the estimate) therefore shows once.
//   · THE WINDOW: an open sprint counts an item only when it was completed inside the
//     sprint, that is on or after its start. Work finished before the start belongs to
//     the sprint that finished it: `sprint start` drops it from the plan for that reason,
//     and the close leaves it out. There is no upper
//     bound: work finished after the end date but before the close counts in that sprint
//     (the carry-over ruling). An item with no completed date cannot be placed and is
//     credited as the map says.
import { sprintMembers } from './backlog-schema.mjs'

const DONE = 'DONE'

// Points credited to `sprintId` for a DONE item, and whether it counts as a delivered item
// there. vaultlib.sprint_credit, ported.
export function sprintCredit(story, sprintId) {
  const by = story?.deliveredPoints
  const ids = by ? Object.keys(by) : []
  if (!ids.length) return { pts: story?.storyPoints ?? 0, item: true }
  return { pts: by[String(sprintId)] ?? 0, item: ids.at(-1) === String(sprintId) }
}

// Whether a DONE item was finished before the sprint started, so the sprint gets none of it.
export function finishedBeforeStart(story, sprint) {
  return Boolean(story?.completed && sprint?.start && story.completed < sprint.start)
}

// An open sprint's members without the work finished before it started: that work is not
// part of the sprint (the window rule above), neither in its scope nor in what it delivered.
// A closed sprint is returned as is: its close already decided.
export function inWindow(sprint, members) {
  if (sprint?.status === 'CLOSED') return members
  return members.filter((s) => !(s.status === DONE && finishedBeforeStart(s, sprint)))
}

const isEpic = (s) => (s?.kind ?? '').toLowerCase() === 'epic'

// The live credit: what the members earn by the rules above, ignoring any stamp.
// Returns the credited item ids, their count and the points (slices, not whole estimates).
export function creditedIn(sprint, stories) {
  const ids = []
  let pts = 0
  const windowed = sprint?.status !== 'CLOSED'
  for (const s of stories) {
    if (s.status !== DONE || isEpic(s) || !sprintMembers(s).includes(sprint.id)) continue
    if (windowed && finishedBeforeStart(s, sprint)) continue
    const c = sprintCredit(s, sprint.id)
    pts += c.pts || 0
    if (c.item) ids.push(s.id)
  }
  return { items: ids.length, pts, ids }
}

export const isStamped = (sprint) =>
  sprint?.status === 'CLOSED' && sprint.deliveredSP != null && sprint.deliveredItems != null

// A closed sprint's stamps (`deliveredSP`, `deliveredItems`, written by the close) are the
// vault's own record and win; an export without them, or a sprint still open, is counted
// from its members' credits. `ids` is the close's `delivered` list when it wrote one, null
// when only the totals were stamped (a sprint closed before the lists existed).
export function deliveredIn(sprint, stories) {
  if (isStamped(sprint))
    return { items: sprint.deliveredItems, pts: sprint.deliveredSP, ids: sprint.delivered ?? null, source: 'stamped' }
  const c = creditedIn(sprint, stories)
  return { items: c.items, pts: c.pts, ids: c.ids, source: 'credited' }
}
