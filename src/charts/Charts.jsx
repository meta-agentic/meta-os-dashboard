import React, { useEffect, useState } from 'react'

// Categorical hues come from the active theme's --cat-* tokens, which are generated
// and gated by the dataviz validator (CVD separation, lightness band, chroma floor,
// contrast on that theme's own card). This list is only the pre-paint / SSR fallback
// for when computed styles aren't readable yet.
export const PALETTE = [
  '#d77122', '#4593ea', '#2eac43', '#a16ff5', '#bc8500', '#00a4ae', '#e3625a', '#915e00',
]

function readCat() {
  if (typeof document === 'undefined' || !document.documentElement) return PALETTE
  const cs = getComputedStyle(document.documentElement)
  const n = parseInt(cs.getPropertyValue('--cat-count'), 10)
  if (!Number.isFinite(n) || n < 1) return PALETTE
  const out = []
  for (let i = 1; i <= n; i++) {
    const v = cs.getPropertyValue(`--cat-${i}`).trim()
    if (v) out.push(v)
  }
  return out.length ? out : PALETTE
}

// Re-read on theme/palette switch and on an OS light↔dark flip, so a running
// dashboard repaints its charts without a reload.
export function useCatColors() {
  const [cols, setCols] = useState(readCat)
  useEffect(() => {
    const update = () => setCols(readCat())
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', update)
    return () => { mo.disconnect(); mq.removeEventListener('change', update) }
  }, [])
  return cols
}

// A theme exposes only as many categorical slots as its hues can keep apart, so the
// cycle length is the theme's, not a fixed 10. Cycling at all is a known compromise:
// past `cat.length` series, identity should fold into "Other" rather than repeat a hue.
export const colorAt = (i, cat = PALETTE) => cat[i % cat.length]

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// Horizontal bars — scales with long labels and many categories better than
// vertical columns in a narrow widget. Rows with children read as clickable.
export function BarChart({ data, onSelect, unit }) {
  const cat = useCatColors()
  const max = Math.max(1, ...data.map((d) => d.value))
  if (!data.length) return <div className="degraded">no data</div>
  return (
    <div className="bars">
      {unit && <div className="chart-unit dim small">bar length = {unit}</div>}
      {data.map((d, i) => {
        const drillable = !!(d.children && d.children.length)
        return (
          <button
            key={d.label + i}
            className={'bar-row' + (drillable ? ' drillable' : '')}
            onClick={drillable ? () => onSelect(i) : undefined}
            disabled={!drillable}
            title={drillable ? `Drill into ${d.label}` : undefined}
          >
            <span className="bar-label">{d.label}</span>
            <span className="bar-track">
              <i style={{ width: `${(d.value / max) * 100}%`, background: d.color || colorAt(i, cat) }} />
            </span>
            <span className="bar-val">{fmt(d.value)}</span>
          </button>
        )
      })}
    </div>
  )
}

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
function slicePath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`
}

// Donut (pie with a hole for a cleaner center) + legend. Slices with children
// are clickable to drill down.
export function PieChart({ data, onSelect, unit }) {
  const cat = useCatColors()
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total <= 0) return <div className="degraded">no data</div>
  const R = 52, C = 60, hole = 26
  let a = -Math.PI / 2
  const slices = data.map((d, i) => {
    const a0 = a
    const a1 = a + (d.value / total) * Math.PI * 2
    a = a1
    return { d, i, a0, a1, color: d.color || colorAt(i, cat) }
  })
  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 120 120" className="pie-svg" role="img" aria-label="pie chart">
        {slices.map(({ d, i, a0, a1, color }) => {
          const drillable = !!(d.children && d.children.length)
          return (
            <path
              key={i}
              d={slicePath(C, C, R, a0, a1)}
              fill={color}
              className={drillable ? 'slice drillable' : 'slice'}
              onClick={drillable ? () => onSelect(i) : undefined}
            >
              <title>{`${d.label}: ${fmt(d.value)} (${Math.round((d.value / total) * 100)}%)`}</title>
            </path>
          )
        })}
        <circle cx={C} cy={C} r={hole} className="pie-hole" />
        <text x={C} y={C - 3} className="pie-total" textAnchor="middle">{fmt(total)}</text>
        <text x={C} y={C + 10} className="pie-total-lbl" textAnchor="middle">{unit || 'total'}</text>
      </svg>
      <ul className="legend">
        {slices.map(({ d, i, color }) => {
          const drillable = !!(d.children && d.children.length)
          return (
            <li key={i}>
              <button
                className={'legend-b' + (drillable ? ' drillable' : '')}
                onClick={drillable ? () => onSelect(i) : undefined}
                disabled={!drillable}
              >
                <i style={{ background: color }} />
                <span className="legend-lbl">{d.label}</span>
                <span className="legend-val">{fmt(d.value)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Dot-plot stacking (Wilkinson): each dot takes the lowest row in which it doesn't
// touch an already-placed neighbour, so a dense cluster builds a *countable column*
// rather than a pile of translucent circles on one spot. Deterministic — no jitter
// and no random seed, so the same data always draws the same picture.
function stackRows(xs, step) {
  const rows = new Array(xs.length).fill(0)
  const placed = []
  for (const i of xs.map((_, j) => j).sort((a, b) => xs[a] - xs[b])) {
    let row = 0
    while (placed.some((p) => p.row === row && Math.abs(p.x - xs[i]) < step)) row++
    rows[i] = row
    placed.push({ x: xs[i], row })
  }
  return rows
}

// 1-D distribution of a single quantity, one dot per item. Reveals spread, clusters
// and outliers that a bar-of-means would hide. Optional two-class colouring via `cls`.
//
// Two deliberate choices, both about not lying at density:
//  - dots are STACKED, not jittered-and-blended. Overlapping translucent marks
//    saturate to a solid blob after three or four overlaps, so the densest part of
//    the distribution — the part you most want to read — is the part that turns
//    unreadable. A column you can count never does that.
//  - `scale="log"` is the right axis for a quantity spanning decades (per-session
//    spend routinely does). On a linear axis a heavy tail pushes the whole body of
//    the distribution into the first few pixels; log gives every decade equal room.
export function StripPlot({ points, unit = 'value', max, median, fmt: f = fmt, scale = 'linear' }) {
  if (!points?.length) return <div className="degraded">no data</div>
  const W = 340, H = 118, padL = 8, padR = 8, axis = H - 24, bandTop = 16
  const vals = points.map((p) => p.v)
  const hi = Math.max(1, max ?? Math.max(...vals))
  // Log domain is anchored to whole decades so every tick is a power of ten.
  const log = scale === 'log'
  const pos = vals.filter((v) => v > 0)
  const lo = log && pos.length ? 10 ** Math.floor(Math.log10(Math.min(...pos))) : 0
  const top = log ? 10 ** Math.ceil(Math.log10(Math.max(hi, lo * 10))) : hi
  const span = W - padL - padR
  const x = log
    ? (v) => padL + Math.min(Math.max(Math.log10(Math.max(v, lo) / lo) / Math.log10(top / lo), 0), 1) * span
    : (v) => padL + Math.min(v / top, 1) * span
  const decades = log ? Math.round(Math.log10(top / lo)) : 0
  const stride = log ? Math.ceil((decades + 1) / 7) : 1 // thin the ticks before labels collide
  const ticks = log
    ? Array.from({ length: decades + 1 }, (_, i) => lo * 10 ** i).filter((_, i) => i % stride === 0)
    : [0, top / 2, top]

  // Fit the tallest column into the band: a smaller radius packs more dots per row,
  // which lowers the stack, so a couple of shrink passes always converge.
  const xs = vals.map(x)
  const bandH = axis - bandTop
  let r = 3.4, rows = stackRows(xs, r * 2 + 0.6)
  for (let i = 0; i < 4 && (Math.max(...rows) + 1) * (r * 2 + 0.6) > bandH; i++) {
    r *= 0.75
    rows = stackRows(xs, r * 2 + 0.6)
  }
  const step = r * 2 + 0.6
  const y = (row) => Math.max(bandTop + r, axis - r - 1 - row * step)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="strip-svg" role="img"
      aria-label={`distribution of ${unit}${log ? ', logarithmic axis' : ''}`}>
      <line x1={padL} y1={axis} x2={W - padR} y2={axis} className="axis" />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={x(t)} y1={axis} x2={x(t)} y2={axis + 4} className="axis" />
          <text x={x(t)} y={axis + 14} className="ax-tick" textAnchor="middle">{f(t)}</text>
        </g>
      ))}
      {median != null && (
        <g>
          <line x1={x(median)} y1={bandTop - 4} x2={x(median)} y2={axis} className="strip-median" />
          {/* clamp the label so a median near either end doesn't clip off-canvas */}
          <text x={Math.max(padL + 26, Math.min(x(median), W - padR - 26))} y={bandTop - 7}
            className="ax-unit" textAnchor="middle">median {f(median)}</text>
        </g>
      )}
      {points.map((p, i) => (
        <circle key={i} cx={xs[i]} cy={y(rows[i])} r={r} className={'strip-dot ' + (p.cls || '')}>
          <title>{p.label ? `${p.label}: ${f(p.v)} ${unit}` : `${f(p.v)} ${unit}`}</title>
        </circle>
      ))}
      <text x={W / 2} y={H - 2} className="ax-unit" textAnchor="middle">
        {unit} →{log ? ' (log scale)' : ''}
      </text>
    </svg>
  )
}

// Scatter — two quantitative axes read honestly against *aligned* zero-based scales
// (the honest alternative to a dual-axis line, which manufactures correlations).
// Optional bubble size = a third quantity; `cls` colours a point by class.
export function ScatterChart({ points, xLabel = 'x', yLabel = 'y', xMax, yMax, xFmt = fmt, yFmt = fmt }) {
  if (!points?.length) return <div className="degraded">no data</div>
  const W = 340, H = 200, padL = 40, padR = 14, padT = 12, padB = 36
  const xhi = xMax ?? Math.max(1, ...points.map((p) => p.x))
  const yhi = yMax ?? Math.max(1, ...points.map((p) => p.y))
  // Bubble area ∝ size, normalised so the largest is a fixed radius — otherwise a
  // high-`size` point (e.g. a 2800-turn session) balloons past the plot.
  const sizeHi = Math.max(1, ...points.map((p) => p.size || 0))
  const R = (s) => (s ? 2.5 + Math.sqrt(s / sizeHi) * 8 : 4)
  const X = (v) => padL + Math.min(v / xhi, 1) * (W - padL - padR)
  const Y = (v) => H - padB - Math.min(v / yhi, 1) * (H - padB - padT)
  const gy = [0, yhi / 2, yhi], gx = [0, xhi / 2, xhi]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="scatter-svg" role="img" aria-label={`${xLabel} vs ${yLabel}`}>
      {gy.map((t, i) => (
        <g key={'y' + i}>
          <line x1={padL} y1={Y(t)} x2={W - padR} y2={Y(t)} className="grid" />
          <text x={padL - 5} y={Y(t) + 3} className="ax-tick" textAnchor="end">{yFmt(t)}</text>
        </g>
      ))}
      {gx.map((t, i) => (
        <text key={'x' + i} x={X(t)} y={H - padB + 13} className="ax-tick" textAnchor="middle">{xFmt(t)}</text>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
      {points.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={R(p.size)}
          className={'scatter-dot ' + (p.cls || '')}>
          <title>{`${p.label ? p.label + ' · ' : ''}${xLabel} ${xFmt(p.x)}, ${yLabel} ${yFmt(p.y)}`}</title>
        </circle>
      ))}
      <text transform={`translate(11 ${(padT + H - padB) / 2}) rotate(-90)`} className="ax-unit" textAnchor="middle">{yLabel}</text>
      <text x={(padL + W - padR) / 2} y={H - 3} className="ax-unit" textAnchor="middle">{xLabel} →</text>
    </svg>
  )
}

// Flow diagram (mini-Sankey) — one-way movement of a quantity through ordered stages,
// node height and connector thickness ∝ volume. The right form for a promotion
// pipeline; degrades gracefully to a trickle when stages are near-empty.
export function FlowDiagram({ stages, unit = 'notes' }) {
  const vals = stages.map((s) => s.value)
  const max = Math.max(1, ...vals)
  if (vals.every((v) => v === 0)) return <div className="degraded">pipeline empty — nothing promoted yet</div>
  const W = 340, H = 150, padT = 16, padB = 26, nw = 15
  const span = H - padT - padB
  const scale = span / max
  const colX = (i) => 10 + i * ((W - 20 - nw) / Math.max(1, stages.length - 1))
  const node = (i) => {
    const h = Math.max(3, vals[i] * scale)
    return { x: colX(i), y: padT + (span - h) / 2, h }
  }
  const nodes = stages.map((_, i) => node(i))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="flow-svg" role="img" aria-label={`${unit} through pipeline stages`}>
      {stages.slice(0, -1).map((_, i) => {
        const a = nodes[i], b = nodes[i + 1]
        const carried = Math.min(vals[i], vals[i + 1]) * scale // can't promote more than exists downstream
        const th = Math.max(2, carried)
        const y0 = a.y + a.h / 2 - th / 2, y1 = b.y + b.h / 2 - th / 2
        const x0 = a.x + nw, x1 = b.x, mx = (x0 + x1) / 2
        const d = `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + th} C${mx},${y1 + th} ${mx},${y0 + th} ${x0},${y0 + th} Z`
        return <path key={i} d={d} className="flow-ribbon" />
      })}
      {stages.map((s, i) => (
        <g key={s.key}>
          <rect x={nodes[i].x} y={nodes[i].y} width={nw} height={nodes[i].h} rx={2} className="flow-node" />
          <text x={nodes[i].x + nw / 2} y={padT + span + 12} className="ax-tick" textAnchor="middle">{s.key}</text>
          <text x={nodes[i].x + nw / 2} y={nodes[i].y - 4} className="flow-val" textAnchor="middle">{s.value}</text>
        </g>
      ))}
    </svg>
  )
}

// x-y line with area fill — x is the ordered category, y the value. Labeled axes:
// y shows 0→max in `unit`, x names the category dimension and its endpoints.
export function LineChart({ data, unit = 'value', xLabel = 'category' }) {
  if (data.length < 2) return <div className="degraded">need ≥2 points</div>
  const W = 340, H = 156, padL = 34, padR = 12, padT = 12, padB = 34
  const max = Math.max(1, ...data.map((d) => d.value))
  const x = (i) => padL + (i / (data.length - 1)) * (W - padL - padR)
  const y = (v) => H - padB - (v / max) * (H - padB - padT)
  const pts = data.map((d, i) => [x(i), y(d.value)])
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${padL},${H - padB} ${line} ${W - padR},${H - padB}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="line-svg" role="img" aria-label={`${xLabel} vs ${unit}`}>
      {/* y axis: baseline, ticks at 0 and max, unit caption */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
      <text x={padL - 4} y={y(max) + 3} className="ax-tick" textAnchor="end">{fmt(max)}</text>
      <text x={padL - 4} y={y(0) + 3} className="ax-tick" textAnchor="end">0</text>
      <text transform={`translate(9 ${(padT + H - padB) / 2}) rotate(-90)`} className="ax-unit" textAnchor="middle">{unit}</text>
      <polygon points={area} className="line-area" />
      <polyline points={line} className="line-path" />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? 3.5 : 2} className={i === pts.length - 1 ? 'dot end' : 'dot'}>
          <title>{`${data[i].label}: ${fmt(data[i].value)} ${unit}`}</title>
        </circle>
      ))}
      {/* x axis: endpoint category labels + dimension name */}
      <text x={padL} y={H - padB + 12} className="ax-tick" textAnchor="start">{data[0].label}</text>
      <text x={W - padR} y={H - padB + 12} className="ax-tick" textAnchor="end">{data.at(-1).label}</text>
      <text x={(padL + W - padR) / 2} y={H - 4} className="ax-unit" textAnchor="middle">{xLabel} →</text>
    </svg>
  )
}

// Overlaid multi-series line — several series read against ONE shared pair of axes,
// which is the only way a comparison between them is honest: a common y scale in a
// common unit, and a common x domain so a point's horizontal position means the same
// thing for every series. Series are identified by colour + legend, not by a second
// axis (a dual axis manufactures correlations that aren't in the data).
//
// `series`: [{ key, label, points: [{ x: number, label, value }] }] — x is numeric so
// the domain is genuinely shared even when series don't share sample points; a series
// simply has no mark where it has no datum, and its line connects its own neighbours.
// A one-point series still draws its dot rather than vanishing.
export function MultiLineChart({ series, unit = 'value', xLabel = 'x', xFmt = fmt, yMax }) {
  const cat = useCatColors()
  const shown = (series ?? []).filter((s) => s.points?.length)
  if (!shown.length) return <div className="degraded">no series selected</div>

  const W = 340, H = 176, padL = 34, padR = 12, padT = 12, padB = 40
  const xs = shown.flatMap((s) => s.points.map((p) => p.x))
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const span = x1 - x0
  const max = Math.max(1, yMax ?? Math.max(...shown.flatMap((s) => s.points.map((p) => p.value))))
  // A degenerate domain (every series sampled at one instant) would divide by zero;
  // park those marks in the middle rather than at a meaningless edge.
  const X = (v) => (span > 0 ? padL + ((v - x0) / span) * (W - padL - padR) : (padL + W - padR) / 2)
  const Y = (v) => H - padB - (v / max) * (H - padB - padT)
  const ticks = [0, max / 2, max]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="line-svg multi" role="img"
      aria-label={`${xLabel} vs ${unit}, ${shown.length} series overlaid`}>
      {ticks.map((t, i) => (
        <g key={'y' + i}>
          <line x1={padL} y1={Y(t)} x2={W - padR} y2={Y(t)} className="grid" />
          <text x={padL - 4} y={Y(t) + 3} className="ax-tick" textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
      <text transform={`translate(9 ${(padT + H - padB) / 2}) rotate(-90)`} className="ax-unit" textAnchor="middle">{unit}</text>

      {shown.map((s, si) => {
        const color = s.color || colorAt(s.ci ?? si, cat)
        const pts = [...s.points].sort((a, b) => a.x - b.x).map((p) => ({ ...p, px: X(p.x), py: Y(p.value) }))
        return (
          <g key={s.key}>
            {pts.length > 1 && (
              <polyline points={pts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ')}
                className="ml-path" style={{ stroke: color }} />
            )}
            {pts.map((p, i) => (
              <circle key={i} cx={p.px} cy={p.py} r={pts.length === 1 ? 3.5 : 2.6}
                className="ml-dot" style={{ stroke: color, fill: pts.length === 1 ? color : undefined }}>
                <title>{`${s.label} · ${p.label}: ${fmt(p.value)} ${unit}`}</title>
              </circle>
            ))}
          </g>
        )
      })}

      {/* x axis: domain endpoints + midpoint, then the dimension name */}
      {(span > 0 ? [x0, (x0 + x1) / 2, x1] : [x0]).map((t, i, a) => (
        <text key={'x' + i} x={X(t)} y={H - padB + 13} className="ax-tick"
          textAnchor={a.length === 1 ? 'middle' : i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}>
          {xFmt(t)}
        </text>
      ))}
      <text x={(padL + W - padR) / 2} y={H - 4} className="ax-unit" textAnchor="middle">{xLabel} →</text>
    </svg>
  )
}
