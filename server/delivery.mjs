// What a sprint delivered, counted once. The vault's reading rule (vaultlib.sprint_credit,
// the gate's delivered-drift), ported: an item without a `deliveredPoints` map counts in full
// in every sprint it names, as before; with one, a sprint is credited only its own slice, and
// the item counts as a delivered item once, in the sprint that finished it (the map's last
// entry). A carried item (first sprint 0, second the estimate) therefore shows once.
import { sprintMembers } from './backlog-schema.mjs'

const DONE = 'DONE'

// Points credited to `sprintId` for a DONE item, and whether it counts as a delivered item there.
export function sprintCredit(story, sprintId) {
  const by = story?.deliveredPoints
  const ids = by ? Object.keys(by) : []
  if (!ids.length) return { pts: story?.storyPoints ?? 0, item: true }
  return { pts: by[String(sprintId)] ?? 0, item: ids.at(-1) === String(sprintId) }
}

// A closed sprint's stamps (`deliveredSP`, `deliveredItems`, written by the close) are the
// vault's own record and win; an export without them, or a sprint still open, is counted
// from its members' credits.
export function deliveredIn(sprint, stories) {
  if (sprint?.status === 'CLOSED' && sprint.deliveredSP != null && sprint.deliveredItems != null)
    return { items: sprint.deliveredItems, pts: sprint.deliveredSP, source: 'stamped' }
  let items = 0, pts = 0
  for (const s of stories) {
    if (s.status !== DONE || !sprintMembers(s).includes(sprint.id)) continue
    const c = sprintCredit(s, sprint.id)
    pts += c.pts || 0
    if (c.item) items += 1
  }
  return { items, pts, source: 'credited' }
}
