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
export function BarChart({ data, onSelect }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (!data.length) return <div className="degraded">no data</div>
  return (
    <div className="bars">
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
export function PieChart({ data, onSelect }) {
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
        <text x={C} y={C + 10} className="pie-total-lbl" textAnchor="middle">total</text>
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

// x-y line with area fill — x is the category index, y the value. Endpoint is
// emphasized; a faint baseline grounds it.
export function LineChart({ data }) {
  if (data.length < 2) return <div className="degraded">need ≥2 points</div>
  const W = 320, H = 140, pad = 24
  const max = Math.max(1, ...data.map((d) => d.value))
  const x = (i) => pad + (i / (data.length - 1)) * (W - pad * 2)
  const y = (v) => H - pad - (v / max) * (H - pad * 2)
  const pts = data.map((d, i) => [x(i), y(d.value)])
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="line-svg" role="img" aria-label="line chart">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="axis" />
      <polygon points={area} className="line-area" />
      <polyline points={line} className="line-path" />
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? 3.5 : 2} className={i === pts.length - 1 ? 'dot end' : 'dot'}>
          <title>{`${data[i].label}: ${fmt(data[i].value)}`}</title>
        </circle>
      ))}
    </svg>
  )
}
