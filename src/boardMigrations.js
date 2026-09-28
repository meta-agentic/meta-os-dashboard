// Saved boards (localStorage and the server copy) name widgets by id. When a widget
// is split or renamed, a board saved before the change is rewritten here once, so
// every panel it showed is still on it. `v` records the layout version a board is at.
export const LAYOUT_VERSION = 3

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

// v3: Usage split into Engine usage + Per-session spend + Cost × Throughput. The two
// charts are stacked under the usage panel, same width.
function toV3(layout) {
  const out = []
  for (const l of layout) {
    out.push(l)
    if (l.i === 'usage') {
      out.push({ i: 'session-spend', x: l.x, y: l.y + l.h, w: l.w, h: 6 },
        { i: 'session-scatter', x: l.x, y: l.y + l.h + 6, w: l.w, h: 9 })
    }
  }
  return out
}

const STEPS = [[2, toV2], [3, toV3]]

export function migrateBoard(b) {
  const from = b.v ?? 1
  if (from >= LAYOUT_VERSION) return b
  let layout = b.layout ?? []
  for (const [v, step] of STEPS) if (from < v) layout = step(layout)
  return { ...b, v: LAYOUT_VERSION, layout }
}
