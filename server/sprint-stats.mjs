// Per-sprint delivery statistics: what was committed, what was delivered, how fast, and
// what carried over. Pure — takes the canonical backlog (backlog-schema.mjs) and returns
// one row per sprint, so every number here can be recomputed from the vault by hand.
//
// Rules, all from how the vault counts (not invented here):
//   · COMMITTED is the sprint file's `committed:` snapshot taken at open. Live membership
//     (an item's own `sprint` field) grows after open, so it is never the commitment.
//     No snapshot recorded reads as null, not 0 — "nothing was committed" and "nobody
//     wrote it down" are different facts.
//   · DELIVERED is live members that are DONE, credited once, to the LAST sprint the item
//     names. An item that carries over keeps naming both sprints; the origin delivers
//     nothing for it and the sprint that finishes it is credited (carry-over rule).
//     Work finished after a sprint's end date counts in the sprint that held it.
//   · CARRY-OVER is the roster (committed snapshot ∪ live members) minus what the sprint
//     delivered: unfinished work, or work finished in a later sprint. NO GO is aborted,
//     not carried. Epics are containers and never part of a roster.
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
      const snapshot = (sp.committed ?? []).map(String)
      const committedRows = snapshot.map((id) => byId.get(id)).filter(Boolean)

      const delivered = live.filter((s) => s.status === DONE && finishedIn(s) === sp.id)
      const deliveredIds = new Set(delivered.map((s) => s.id))

      const roster = new Map(live.map((s) => [s.id, s]))
      for (const s of committedRows) if (!s.kind || s.kind.toLowerCase() !== 'epic') roster.set(s.id, s)
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
        committedItems: snapshot.length ? snapshot.length : null,
        committedPts: snapshot.length ? sum(committedRows, (s) => s.storyPoints) : null,
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
