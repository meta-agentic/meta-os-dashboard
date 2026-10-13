// Per-sprint delivery statistics: what was committed, what was delivered, how fast, and
// what carried over. Pure — takes the canonical backlog (backlog-schema.mjs) and returns
// one row per sprint, so every number here can be recomputed from the vault by hand.
//
// Rules, all from how the vault counts (not invented here):
//   · COMMITTED is `committedAtStart` once the sprint file has that list (MOS-251),
//     and `committed` when it does not. An unmigrated file's `committed` is still the
//     snapshot taken at open, so those rows read as they did before the list existed.
//     Live membership (an item's own `sprint` field) is never the commitment.
//     No snapshot recorded reads as null, not 0 — "nothing was committed" and "nobody
//     wrote it down" are different facts.
//   · SCOPE ADDED is `committed` minus `committedAtStart`: work committed after the
//     sprint started. Null until the file is migrated, because an old file cannot
//     say what was added later. An empty difference is 0.
//   · DELIVERED is live members that are DONE, credited once, to the LAST sprint the item
//     names. An item that carries over keeps naming both sprints; the origin delivers
//     nothing for it and the sprint that finishes it is credited (carry-over rule).
//     Work finished after a sprint's end date counts in the sprint that held it.
//   · CARRY-OVER is the roster (the file's full `committed` list ∪ live members) minus
//     what the sprint delivered: unfinished work, or work finished in a later sprint.
//     The full list, not the opening snapshot, so a mid-sprint commitment stays on the
//     roster. NO GO is aborted, not carried. Epics are containers and never part of a roster.
//   · VELOCITY is delivered points per week, so a sprint a day longer than its siblings
//     does not read as faster.
import { sprintMembers } from './backlog-schema.mjs'

const DONE = 'DONE'
const NO_GO = 'NO GO'
const WEEK = 6048e5

const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0)

export function sprintStats(stories = [], epics = [], sprints = []) {
  const byId = new Map([...stories, ...epics].map((s) => [s.id, s]))
  const endOf = new Map(sprints.map((s) => [s.id, s.end ?? '']))
  // The sprint that finished an item is the last one it names, by end date.
  const finishedIn = (item) => {
    const ids = sprintMembers(item)
    if (!ids.length) return null
    return [...ids].sort((a, b) => (endOf.get(a) ?? '').localeCompare(endOf.get(b) ?? '') || a.localeCompare(b)).at(-1)
  }

  return sprints
    .map((sp) => {
      const live = stories.filter((s) => sprintMembers(s).includes(sp.id))
      const migrated = Array.isArray(sp.committedAtStart)
      const opening = (migrated ? sp.committedAtStart : sp.committed ?? []).map(String)
      const full = (sp.committed ?? []).map(String)
      const openingSet = new Set(opening)
      const added = migrated ? full.filter((id) => !openingSet.has(id)) : null
      const rowsOf = (ids) => ids.map((id) => byId.get(id)).filter(Boolean)
      const openingRows = rowsOf(opening)
      const fullRows = rowsOf(full)

      const delivered = live.filter((s) => s.status === DONE && finishedIn(s) === sp.id)
      const deliveredIds = new Set(delivered.map((s) => s.id))

      const roster = new Map(live.map((s) => [s.id, s]))
      for (const s of fullRows) if (!s.kind || s.kind.toLowerCase() !== 'epic') roster.set(s.id, s)
      const carried = [...roster.values()].filter((s) => {
        if (deliveredIds.has(s.id) || s.status === NO_GO) return false
        if (s.status !== DONE) return true
        const done = finishedIn(s)
        return done !== null && done !== sp.id // finished, but in a later sprint
      })

      const t0 = sp.start ? Date.parse(sp.start) : NaN
      const t1 = sp.end ? Date.parse(sp.end) : NaN
      const weeks = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 ? (t1 - t0) / WEEK : null
      const deliveredPts = sum(delivered, (s) => s.storyPoints)

      // What the close record says, kept beside the live figure: the two diverge when
      // work lands after the close or a close was never restated.
      const storedSP = sp.deliveredSP ?? null
      const storedItems = sp.deliveredItems ?? null
      const drift = sp.status === 'CLOSED' && storedSP !== null
        && (storedSP !== deliveredPts || storedItems !== delivered.length)

      return {
        id: sp.id,
        name: sp.name ?? sp.id,
        status: sp.status,
        start: sp.start ?? null,
        end: sp.end ?? null,
        committedItems: opening.length ? opening.length : null,
        committedPts: opening.length ? sum(openingRows, (s) => s.storyPoints) : null,
        scopeAddedItems: added == null ? null : added.length,
        scopeAddedPts: added == null ? null : sum(rowsOf(added), (s) => s.storyPoints),
        deliveredItems: delivered.length,
        deliveredPts,
        perWeek: weeks ? +(deliveredPts / weeks).toFixed(1) : null,
        carryItems: carried.length,
        carryPts: sum(carried, (s) => s.storyPoints),
        storedSP,
        storedItems,
        drift,
      }
    })
    .sort((a, b) => (a.end ?? a.start ?? '').localeCompare(b.end ?? b.start ?? '') || String(a.id).localeCompare(String(b.id)))
}
