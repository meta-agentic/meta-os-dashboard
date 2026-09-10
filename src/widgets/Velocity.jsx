import React, { useMemo, useState } from 'react'
import Card from './Card.jsx'
import { MultiLineChart, colorAt, useCatColors } from '../charts/Charts.jsx'

// Every project's velocity on ONE pair of axes, instead of one space at a time behind
// a segmented selector. Comparing delivery rates is the whole point of the chart, and
// a comparison you have to make by clicking back and forth is a comparison you make
// from memory. Series are toggled from the legend so a crowded plot can be thinned to
// the two or three spaces actually being weighed against each other.
//
// x is the sprint's END DATE where the backlog carries one — the sprints are cadence-
// aligned across spaces, so calendar time puts the same fortnight in the same column.
// When any charted space lacks dates the whole plot falls back to sprint ordinal, so
// x never means two different things in one picture.
const ptsOf = (r) => r.donePts || r.done || 0

function seriesFor(space) {
  const closed = (space.sprints ?? []).filter((r) => r.status === 'CLOSED' && r.end)
  if (closed.length) {
    const rows = [...closed].sort((a, b) => a.end.localeCompare(b.end))
    return {
      dated: true,
      points: rows.map((r, i) => ({
        x: Date.parse(r.end), i, label: `${r.id} · ${r.end}`, value: ptsOf(r),
      })),
    }
  }
  // Backlogs that report velocity without sprint rows still get to be plotted.
  return {
    dated: false,
    points: (space.velocity ?? []).map((v, i) => ({ x: i + 1, i, label: v.label, value: v.value })),
  }
}

const median = (xs) => {
  if (!xs.length) return null
  const v = [...xs].sort((a, b) => a - b)
  const m = Math.floor((v.length - 1) / 2)
  return +((v[m] + v[v.length - 1 - m]) / 2).toFixed(1)
}

const isoDay = (t) => new Date(t).toISOString().slice(0, 10)

export default function Velocity({ data }) {
  const cat = useCatColors()
  const spaces = (data?.spaces ?? []).filter((s) => s.velocity?.length)

  const series = useMemo(() => spaces.map((s, i) => {
    const { dated, points } = seriesFor(s)
    return { key: s.space, label: s.space.toUpperCase(), ci: i, dated, points }
  }).filter((s) => s.points.length), [data])

  const [off, setOff] = useState(() => new Set())

  if (!series.length) {
    return <Card title="Velocity" data={data}><div className="degraded">no backlog data to report</div></Card>
  }

  // One x meaning for the whole plot: dates only if every charted series has them.
  const dated = series.every((s) => s.dated)
  const plotted = series.map((s) => ({
    ...s,
    points: dated ? s.points : s.points.map((p) => ({ ...p, x: p.i + 1 })),
  }))
  const visible = plotted.filter((s) => !off.has(s.key))
  const toggle = (k) => setOff((prev) => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  const sprintCount = visible.reduce((a, s) => a + s.points.length, 0)

  return (
    <Card title="Velocity — delivered pts / closed sprint" data={data}>
      <div className="burn-head">
        <span className="dim small">
          {visible.length} of {plotted.length} project{plotted.length === 1 ? '' : 's'} · {sprintCount} closed sprint{sprintCount === 1 ? '' : 's'}
        </span>
        <span className="seg">
          <button className="seg-b" onClick={() => setOff(new Set())} disabled={!off.size}>all</button>
          <button className="seg-b" onClick={() => setOff(new Set(plotted.map((s) => s.key)))}
            disabled={off.size === plotted.length}>none</button>
        </span>
      </div>

      <MultiLineChart
        series={visible}
        unit="story points"
        xLabel={dated ? 'sprint end date' : 'nth closed sprint'}
        xFmt={dated ? isoDay : (v) => `#${Math.round(v)}`}
      />

      <ul className="legend series-legend">
        {plotted.map((s) => {
          const on = !off.has(s.key)
          const vals = s.points.map((p) => p.value)
          const last = s.points.at(-1)
          return (
            <li key={s.key}>
              <button
                className={'legend-b toggle' + (on ? ' on' : ' off')}
                onClick={() => toggle(s.key)}
                aria-pressed={on}
                title={`${on ? 'Hide' : 'Show'} ${s.label}`}
              >
                <i style={{ background: on ? colorAt(s.ci, cat) : 'transparent', borderColor: colorAt(s.ci, cat) }} />
                <span className="legend-lbl">{s.label}</span>
                <span className="legend-val dim small">
                  {s.points.length} sp · med {median(vals)} · last {last.value}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
