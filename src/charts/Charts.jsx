import React from 'react'

// Categorical palette — mid-saturation hues that stay legible on both themes.
export const PALETTE = [
  '#58a6ff', '#3fb950', '#d29922', '#a371f7', '#39c5cf',
  '#ff7b72', '#f0883e', '#7ee787', '#bc8cff', '#f85149',
]
export const colorAt = (i) => PALETTE[i % PALETTE.length]

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// Horizontal bars — scales with long labels and many categories better than
// vertical columns in a narrow widget. Rows with children read as clickable.
export function BarChart({ data, onSelect, unit }) {
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
              <i style={{ width: `${(d.value / max) * 100}%`, background: d.color || colorAt(i) }} />
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
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total <= 0) return <div className="degraded">no data</div>
  const R = 52, C = 60, hole = 26
  let a = -Math.PI / 2
  const slices = data.map((d, i) => {
    const a0 = a
    const a1 = a + (d.value / total) * Math.PI * 2
    a = a1
    return { d, i, a0, a1, color: d.color || colorAt(i) }
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

// 1-D strip plot — the honest way to show a *distribution* of a single quantity
// (one dot per item, jittered off the axis). Reveals spread, clusters and outliers
// that a bar-of-means would hide. Optional two-class colouring via each point's `cls`.
export function StripPlot({ points, unit = 'value', max, median, fmt: f = fmt }) {
  if (!points?.length) return <div className="degraded">no data</div>
  const W = 340, H = 66, padL = 8, padR = 8, axis = 30
  const hi = max ?? Math.max(1, ...points.map((p) => p.v))
  const x = (v) => padL + Math.min(v / hi, 1) * (W - padL - padR)
  const ticks = [0, hi / 2, hi]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="strip-svg" role="img" aria-label={`distribution of ${unit}`}>
      <line x1={padL} y1={axis} x2={W - padR} y2={axis} className="axis" />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={x(t)} y1={axis - 4} x2={x(t)} y2={axis + 4} className="axis" />
          <text x={x(t)} y={axis + 16} className="ax-tick" textAnchor="middle">{f(t)}</text>
        </g>
      ))}
      {median != null && (
        <g>
          <line x1={x(median)} y1={axis - 20} x2={x(median)} y2={axis + 6} className="strip-median" />
          {/* clamp the label so a median near the axis start doesn't clip off-canvas */}
          <text x={Math.max(padL + 24, Math.min(x(median), W - padR - 24))} y={axis - 23}
            className="ax-unit" textAnchor="middle">median {f(median)}</text>
        </g>
      )}
      {points.map((p, i) => {
        const jit = (i % 2 ? 1 : -1) * (2 + ((i * 7) % 7))
        return (
          <circle key={i} cx={x(p.v)} cy={axis + jit} r={3.4} className={'strip-dot ' + (p.cls || '')}>
            <title>{p.label ? `${p.label}: ${f(p.v)} ${unit}` : `${f(p.v)} ${unit}`}</title>
          </circle>
        )
      })}
      <text x={(W) / 2} y={H - 2} className="ax-unit" textAnchor="middle">{unit} →</text>
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
