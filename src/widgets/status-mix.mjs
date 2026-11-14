// Stories by status bucket (To do, In progress, Done, No go, Other), split out of the Scrum
// Report. The spaces come already narrowed by the header's project filter: one space shows
// that space, several are summed bucket by bucket, in the per-space bucket order.
export function combineStatusMix(spaces) {
  const mix = new Map()
  for (const m of spaces.flatMap((s) => s.statusMix ?? [])) {
    const cur = mix.get(m.label) ?? { label: m.label, value: 0, points: 0 }
    cur.value += m.value
    cur.points += m.points ?? 0
    mix.set(m.label, cur)
  }
  return [...mix.values()]
}
