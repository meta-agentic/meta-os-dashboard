import React, { useState } from 'react'
import Card from './Card.jsx'
import { LineChart } from '../charts/Charts.jsx'

// Split out of the Scrum Report. Same series and same degrade path as before —
// only the framing is new: it gets its own card, its own space selector, and room
// to be read next to the burndown rather than squeezed beside the status pie.
export default function Velocity({ data }) {
  const spaces = (data?.spaces ?? []).filter((s) => s.velocity)
  const [si, setSi] = useState(0)
  if (!spaces.length) return <Card title="Velocity" data={data}><div className="degraded">no backlog data to report</div></Card>

  const idx = Math.min(si, spaces.length - 1)
  const s = spaces[idx]
  const closed = s.velocity.length
  const last = closed ? s.velocity[closed - 1] : null
  const median = closed
    ? [...s.velocity].map((v) => v.value).sort((a, b) => a - b)[Math.floor(closed / 2)]
    : null

  return (
    <Card title="Velocity — delivered pts / closed sprint" data={data}>
      {spaces.length > 1 && (
        <div className="seg">
          {spaces.map((sp, i) => (
            <button key={sp.space} className={'seg-b' + (i === idx ? ' on' : '')} onClick={() => setSi(i)}>
              {sp.space.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {closed >= 2 ? (
        <>
          <div className="burn-head">
            <span className="dim small">{closed} closed sprint{closed === 1 ? '' : 's'}</span>
            <span>
              {s.scorecard?.velocityPerWeek != null && (
                <span className="chip">{s.scorecard.velocityPerWeek} pts/wk</span>
              )}
              {median != null && <span className="chip">median {median} pt</span>}
              {last && <span className="chip eta">last {last.value} pt</span>}
            </span>
          </div>
          <LineChart data={s.velocity} unit="story points" xLabel="sprint" />
        </>
      ) : (
        <div className="dim small">not enough closed sprints</div>
      )}
    </Card>
  )
}
