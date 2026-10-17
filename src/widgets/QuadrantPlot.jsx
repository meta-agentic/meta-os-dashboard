import React from 'react'
import { QUADRANTS, placementOf } from '../estimate.js'

// Where an item sits on the extension × intension plane, and what that prescribes.
// Read-only: it shows the recorded placement and never writes, recomputes or replaces
// the item's storyPoints. The band it names is advisory; the recorded points stay the
// authority, and the two are shown apart.

const SIZE = 200
const PAD = 14
const C = SIZE / 2
const R = C - PAD // half-width of the plot, in viewBox units

const toX = (x) => C + x * R
const toY = (y) => C - y * R

// Each tile: its quadrant, its top-left corner, the categorical colour token it is tinted
// with, and which outer corner its label sits in (away from the centre, where most
// placements land, so a point rarely covers the name).
const TILES = [
  { q: QUADRANTS.complex, x: PAD, y: PAD, tint: 'var(--cat-5)', anchor: 'start', top: true },
  { q: QUADRANTS['complex + broad'], x: C, y: PAD, tint: 'var(--cat-7)', anchor: 'end', top: true },
  { q: QUADRANTS.simple, x: PAD, y: C, tint: 'var(--cat-3)', anchor: 'start', top: false },
  { q: QUADRANTS.complicated, x: C, y: C, tint: 'var(--cat-2)', anchor: 'end', top: false },
]

const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2)

function Plot({ placement }) {
  const current = placement?.quadrant.name
  const label = placement
    ? `Placed in ${current}: extension ${signed(placement.extension)}, intension ${signed(placement.intension)}`
    : 'Not placed: no extension and intension recorded'
  return (
    <svg className="wi-quad-plot" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
      {TILES.map(({ q, x, y, tint, anchor, top }) => {
        const on = q.name === current
        const tx = anchor === 'start' ? x + 5 : x + R - 5
        const ty = top ? y + 12 : y + R - 16
        return (
          <g key={q.name} className={'wi-quad-tile' + (on ? ' on' : '')}>
            <rect x={x} y={y} width={R} height={R} fill={tint} fillOpacity={on ? 0.34 : 0.13} />
            <text x={tx} y={ty} textAnchor={anchor} className="wi-quad-name">{q.name}</text>
            <text x={tx} y={ty + 11} textAnchor={anchor} className="wi-quad-bandlabel">{q.band}</text>
          </g>
        )
      })}
      <rect x={PAD} y={PAD} width={2 * R} height={2 * R} className="wi-quad-frame" />
      <line x1={PAD} y1={C} x2={SIZE - PAD} y2={C} className="wi-quad-axis" />
      <line x1={C} y1={PAD} x2={C} y2={SIZE - PAD} className="wi-quad-axis" />
      <text x={SIZE - PAD} y={SIZE - 3} textAnchor="end" className="wi-quad-axislabel">extension →</text>
      <text x={3} y={PAD - 4} className="wi-quad-axislabel">↑ intension</text>
      {placement ? (
        <g className="wi-quad-point">
          <circle cx={toX(placement.extension)} cy={toY(placement.intension)} r={7} className="wi-quad-halo" />
          <circle cx={toX(placement.extension)} cy={toY(placement.intension)} r={4} className="wi-quad-dot" />
        </g>
      ) : (
        <g className="wi-quad-empty">
          <rect x={C - 42} y={C - 11} width={84} height={22} rx={4} />
          <text x={C} y={C + 4} textAnchor="middle">not placed</text>
        </g>
      )}
    </svg>
  )
}

function Readout({ item, placement }) {
  const e = item.estimate
  const points = item.storyPoints
  const recorded = (
    <span className="wi-quad-recorded">
      recorded: {points != null ? <strong className="mono">{points} pt</strong> : <span className="dim">no points</span>}
    </span>
  )
  if (!placement) {
    const why = e
      ? 'the estimate has no valid extension and intension'
      : item.kind === 'epic'
        ? 'epics are not pointed; the points live on their stories'
        : 'no estimate recorded'
    return (
      <div className="wi-quad-readout">
        <div className="wi-quad-state"><strong>not placed</strong> <span className="dim">— {why}</span></div>
        <div>{recorded}</div>
      </div>
    )
  }
  const q = placement.quadrant
  const differs = e.quadrant && e.quadrant !== q.name
  return (
    <div className="wi-quad-readout">
      <div className="wi-quad-state">
        <strong>{q.name}</strong> <span className="dim">·</span> {q.prescription}
      </div>
      <div className="mono small">extension {signed(placement.extension)} · intension {signed(placement.intension)}</div>
      <div className="wi-quad-sizes">
        <span className="wi-quad-band" title="Read off the quadrant. Advisory only: it never replaces the recorded points.">
          band {q.band} <em>advisory</em>
        </span>
        {recorded}
      </div>
      {(e.basis || e.dated) && (
        <div className="small">
          <span className="dim">basis</span> {e.basis ?? 'not stated'}{e.dated ? <span className="dim"> · {e.dated}</span> : null}
          {e.basis === 'ex-post' && ' '}
          {e.basis === 'ex-post' && (
            <span className="wi-quad-anchor" title="Pointed after delivery: usable to calibrate, not evidence of estimation accuracy">
              calibration anchor, not a forecast
            </span>
          )}
        </div>
      )}
      {e.note && <div className="small dim wi-quad-note">“{e.note}”</div>}
      {differs && (
        <div className="small dim">
          recorded quadrant “{e.quadrant}” differs from the axes; shown as placed by the axes
        </div>
      )}
    </div>
  )
}

export default function QuadrantPlot({ item }) {
  const placement = placementOf(item.estimate)
  return (
    <section className="wi-quad" aria-label="Story-point quadrant">
      <h4>Estimate <span className="dim">extension × intension</span></h4>
      <div className="wi-quad-body">
        <Plot placement={placement} />
        <Readout item={item} placement={placement} />
      </div>
    </section>
  )
}
