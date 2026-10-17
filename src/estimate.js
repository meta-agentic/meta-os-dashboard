// The story-point quadrant: where an item sits on the extension × intension plane, what
// band of points that suggests, and what to do about it. Pure, so the plot and its test
// share one definition.
//
// x = extension (how many places the change touches), y = intension (how much is not yet
// known). Both run from -1 to +1. The classification mirrors the backlog CLI's own
// (`_quadrant` in the instance's backlog tooling): an axis counts as high only when it is
// strictly above 0, so a value of exactly 0 falls on the LOW side. (0, 0) is "simple".

export const QUADRANTS = {
  simple: { name: 'simple', band: '1–2', prescription: 'do it', x: 'low', y: 'low' },
  complicated: { name: 'complicated', band: '3–5', prescription: 'split by extension', x: 'high', y: 'low' },
  complex: { name: 'complex', band: '5', prescription: 'time-box as a spike', x: 'low', y: 'high' },
  'complex + broad': { name: 'complex + broad', band: '8', prescription: 'do not commit unsplit', x: 'high', y: 'high' },
}

export function quadrantOf(extension, intension) {
  if (intension > 0) return extension > 0 ? 'complex + broad' : 'complex'
  return extension > 0 ? 'complicated' : 'simple'
}

const isAxis = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1

// The placement an estimate block describes, or null when it describes none. A missing
// block, or one without two valid axes, is "not placed", never a point at the origin.
export function placementOf(estimate) {
  if (!estimate || !isAxis(estimate.extension) || !isAxis(estimate.intension)) return null
  const key = quadrantOf(estimate.extension, estimate.intension)
  return { extension: estimate.extension, intension: estimate.intension, quadrant: QUADRANTS[key] }
}
