// Saved boards (localStorage and the server copy) name widgets by id. When a widget
// is split or renamed, a board saved before the change is rewritten here once, so
// every panel it showed is still on it. `v` records the layout version a board is at.
export const LAYOUT_VERSION = 2

// v2: Memory split into Memory + Federated Vaults + Promotion Pipeline, and Memory
// Flux into Promotion Flow + Ingestion. The parts are stacked where the whole was;
// vertical compaction settles any overlap.
function toV2(layout) {
  const out = []
  for (const l of layout) {
    if (l.i === 'memory') {
      out.push({ ...l, h: 6 },
        { i: 'federated-vaults', x: l.x, y: l.y + 6, w: l.w, h: 9 },
        { i: 'promotion-pipeline', x: l.x, y: l.y + 15, w: l.w, h: 5 })
    } else if (l.i === 'memory-flux') {
      out.push({ ...l, i: 'promotion-flow', h: 7 },
        { i: 'ingestion', x: l.x, y: l.y + 7, w: l.w, h: 7 })
    } else {
      out.push(l)
    }
  }
  return out
}

export function migrateBoard(b) {
  if ((b.v ?? 1) >= LAYOUT_VERSION) return b
  return { ...b, v: LAYOUT_VERSION, layout: toV2(b.layout ?? []) }
}
