import React, { useState } from 'react'
import Card from './Card.jsx'

// Split out of the Scrum Report, and no longer a single point: the daily series
// comes from `burndown.json` beside the mirror, which the scrum tooling produces
// by replaying Jira's status changelog. When that export is missing the widget
// says so and falls back to the two facts the mirror does support (committed and
// remaining-now) rather than drawing a straight line nobody measured.

const shortDay = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Curve({ b, series }) {
  const W = 560, H = 170, padL = 34, padR = 12, padT = 12, padB = 24
  const days = series.days
  const committed = series.committed || b?.committed || 0
  if (!days?.length || !committed) return null

  const n = days.length
  const x = (i) => padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR)
  const y = (v) => padT + (1 - v / committed) * (H - padT - padB)

  // The ideal line runs to the PLANNED end, not to the last plotted day. When a
  // sprint overruns, those extra days sit to the right of the ideal's zero point,
  // which is exactly the shape that makes an overrun obvious.
  const plannedEnd = days.findIndex((d) => d.date === series.end)
  const idealEndX = plannedEnd >= 0 ? x(plannedEnd) : x(n - 1)

  const pts = days.map((d, i) => `${x(i)},${y(d.remaining)}`).join(' ')
  const overran = plannedEnd >= 0 && plannedEnd < n - 1
  const last = days[n - 1]

  const ticks = days.filter((_, i) => i === 0 || i === n - 1 || i === plannedEnd)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="burn-svg" role="img"
           aria-label={`burndown for ${series.name}: ${last.remaining} of ${committed} points remaining`}>
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="axis" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="axis" />
        {/* ideal: committed at day 0 → 0 at the planned end */}
        <line x1={x(0)} y1={y(committed)} x2={idealEndX} y2={y(0)} className="burn-ideal" />
        {overran && (
          <line x1={idealEndX} y1={padT} x2={idealEndX} y2={H - padB} className="burn-now" />
        )}
        <polyline points={pts} className="burn-actual" fill="none" />
        {days.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.remaining)} r={i === n - 1 ? 3.5 : 2}
                  className="burn-dot">
            <title>{`${shortDay(d.date)} — ${d.remaining} left (${d.done} done)`}</title>
          </circle>
        ))}
        <text x={padL - 6} y={y(committed) + 3} textAnchor="end" className="chart-unit">{committed}</text>
        <text x={padL - 6} y={y(0) + 3} textAnchor="end" className="chart-unit">0</text>
        {ticks.map((d) => (
          <text key={d.date} x={x(days.indexOf(d))} y={H - padB + 14} textAnchor="middle" className="chart-unit">
            {shortDay(d.date)}
          </text>
        ))}
      </svg>
      <div className="dim small">
        {n} day{n === 1 ? '' : 's'} of observed history · dashed = ideal to the planned end
        {overran && <> · <span className="warn">overran the window by {n - 1 - plannedEnd} day{n - 1 - plannedEnd === 1 ? '' : 's'}</span></>}
      </div>
    </>
  )
}

// Without the export there is no curve. Show the two supported facts and the
// reason, so the gap reads as "not measured" and not as "burned down evenly".
function NoSeries({ b }) {
  return (
    <>
      <div className="tiles">
        <div className="tile"><div className="tile-v">{b.committed}</div><div className="tile-l">committed</div></div>
        <div className="tile"><div className="tile-v">{b.remaining}</div><div className="tile-l">remaining now</div></div>
        {b.elapsed != null && (
          <div className="tile"><div className="tile-v">{Math.round(b.elapsed * 100)}%</div>
            <div className="tile-l">window elapsed</div></div>
        )}
      </div>
      <div className="degraded">no daily history — {b.seriesReason}</div>
    </>
  )
}

export default function Burndown({ data }) {
  const spaces = (data?.spaces ?? []).filter((s) => s.burndown || s.history?.length)
  const [si, setSi] = useState(0)
  const [sprintId, setSprintId] = useState(null)

  if (!spaces.length) return <Card title="Burndown" data={data}><div className="degraded">no sprint to burn down</div></Card>
  const s = spaces[Math.min(si, spaces.length - 1)]
  const b = s.burndown

  // Newest first, so the active sprint leads.
  const hist = [...(s.history ?? [])].sort((a, z) => (z.start ?? '').localeCompare(a.start ?? ''))
  const active = hist.find((h) => h.sprint && b && (h.name === b.sprint || h.sprint === b.sprint))
  const chosen = hist.find((h) => h.sprint === sprintId) ?? active ?? hist[0] ?? null

  return (
    <Card title="Burndown" data={data}>
      <div className="seg">
        {spaces.map((sp, i) => (
          <button key={sp.space} className={'seg-b' + (i === Math.min(si, spaces.length - 1) ? ' on' : '')}
                  onClick={() => { setSi(i); setSprintId(null) }}>
            {sp.space.toUpperCase()}
          </button>
        ))}
      </div>

      {hist.length > 1 && (
        <div className="chips">
          {hist.map((h) => (
            <button key={h.sprint}
                    className={'chip' + (chosen && h.sprint === chosen.sprint ? ' on' : '')
                      + (h.status === 'IN PROGRESS' ? ' eta' : '')}
                    title={`${h.start} → ${h.end} · ${h.committed}pt committed`}
                    onClick={() => setSprintId(h.sprint)}>
              {h.name}
            </button>
          ))}
        </div>
      )}

      {chosen ? (
        <div className="burn">
          <div className="burn-head">
            <span className="dim small">{chosen.name} · {chosen.start} → {chosen.end}</span>
            <span className={'chip ' + (chosen.days?.length && chosen.days[chosen.days.length - 1].remaining > 0 ? 'down' : 'ok')}>
              {chosen.days?.length ? chosen.days[chosen.days.length - 1].remaining : '—'} / {chosen.committed} pts left
            </span>
          </div>
          <Curve b={b} series={chosen} />
        </div>
      ) : b ? (
        <div className="burn">
          <div className="burn-head"><span className="dim small">Burndown · {b.sprint}</span></div>
          <NoSeries b={b} />
        </div>
      ) : (
        <div className="dim small">no active sprint in {s.space.toUpperCase()}</div>
      )}
    </Card>
  )
}
