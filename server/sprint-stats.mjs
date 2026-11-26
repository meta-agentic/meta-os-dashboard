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
//   · DELIVERED is the sprint close's rule, read through delivery.mjs (deliveredIn): a
//     CLOSED sprint shows the close's own stamps (`deliveredItems`, `deliveredSP`, the
//     `delivered` list); an open one credits each DONE member its `deliveredPoints` slice
//     for this sprint (the whole estimate when it has no map), the item once, and only
//     when it was completed on or after the start. An item stamped into two sprints and
//     finished before the second began therefore counts once, in the first.
//   · CARRY-OVER is the roster (the file's full `committed` list ∪ live members) minus
//     what the sprint delivered: unfinished work, or work finished in a later sprint
//     (the sprint its map credits the item to, or for an item without one the last
//     sprint it names, by end date). Work finished in an earlier sprint is not carried.
//     The full list, not the opening snapshot, so a mid-sprint commitment stays on the
//     roster. NO GO is aborted, not carried. Epics are containers and never part of a roster.
//   · VELOCITY is delivered points per week, so a sprint a day longer than its siblings
//     does not read as faster.
//   · DRIFT compares a closed sprint's stamps with the live credit (`liveItems`,
//     `livePts`): the two diverge when work lands after the close or a close was never
//     restated. The stamps are still what is shown.
import { sprintMembers } from './backlog-schema.mjs'
import { creditedIn, deliveredIn } from './delivery.mjs'

const DONE = 'DONE'
const NO_GO = 'NO GO'
const WEEK = 6048e5

const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0)

export function sprintStats(stories = [], epics = [], sprints = []) {
  const byId = new Map([...stories, ...epics].map((s) => [s.id, s]))
  const endOf = new Map(sprints.map((s) => [s.id, s.end ?? '']))
  const byEnd = (a, b) => (endOf.get(a) ?? '').localeCompare(endOf.get(b) ?? '') || a.localeCompare(b)
  // The sprint that finished an item: the last entry of its map (vaultlib.sprint_credit),
  // else the last sprint it names, by end date.
  const finishedIn = (item) => {
    const mapped = Object.keys(item.deliveredPoints ?? {})
    if (mapped.length) return mapped.at(-1)
    const ids = sprintMembers(item)
    return ids.length ? [...ids].sort(byEnd).at(-1) : null
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

      const credit = deliveredIn(sp, live)
      const liveCredit = credit.source === 'stamped' ? creditedIn(sp, live) : credit
      const deliveredIds = new Set(credit.ids ?? liveCredit.ids)

      const roster = new Map(live.map((s) => [s.id, s]))
      for (const s of fullRows) if (!s.kind || s.kind.toLowerCase() !== 'epic') roster.set(s.id, s)
      const carried = [...roster.values()].filter((s) => {
        if (deliveredIds.has(s.id) || s.status === NO_GO) return false
        if (s.status !== DONE) return true
        const done = finishedIn(s)
        return done !== null && byEnd(done, sp.id) > 0 // finished, but in a later sprint
      })

      const t0 = sp.start ? Date.parse(sp.start) : NaN
      const t1 = sp.end ? Date.parse(sp.end) : NaN
      const weeks = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 ? (t1 - t0) / WEEK : null
      const deliveredPts = credit.pts

      const storedSP = sp.deliveredSP ?? null
      const storedItems = sp.deliveredItems ?? null
      const drift = credit.source === 'stamped'
        && (storedSP !== liveCredit.pts || storedItems !== liveCredit.items)

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
        deliveredItems: credit.items,
        deliveredPts,
        deliveredSource: credit.source,
        liveItems: liveCredit.items,
        livePts: liveCredit.pts,
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
