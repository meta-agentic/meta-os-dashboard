import React from 'react'
import Card from './Card.jsx'
import { StripPlot, ScatterChart } from '../charts/Charts.jsx'

const fmt = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n)
const pct = (n) => `${Math.round(n * 100)}%`

// Session logs carry tokens/turns/cache but no task-outcome, so "effectiveness" is
// proxied honestly by *context reuse*: cache-read ÷ all read input. High reuse = the
// same context re-served cheaply rather than re-sent. This is a real signal in the
// logs — not an estimated cost or a fabricated yield.
const cacheReuse = (t) => {
  const read = (t?.in ?? 0) + (t?.cacheRead ?? 0)
  return read ? (t.cacheRead ?? 0) / read : 0
}
const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Last-14-days output tokens per day. One series, one hue (the app accent) —
// output tokens are the spend proxy; the per-model split lives in the table below
// where text, not color, carries identity.
function DayBars({ days }) {
  const shown = days.slice(-14)
  if (!shown.length) return null
  const max = Math.max(...shown.map((d) => d.out), 1)
  return (
    <div className="daybars" role="img" aria-label="output tokens per day, last 14 days">
      {shown.map((d) => (
        <div key={d.day} className="daycol" title={`${d.day} · ${fmt(d.out)} output tokens`}>
          <i style={{ height: `${Math.max((d.out / max) * 100, 2)}%` }} />
        </div>
      ))}
    </div>
  )
}

export default function Usage({ data }) {
  const models = Object.entries(data?.models ?? {})
  const reuse = cacheReuse(data?.totals)
  const sessionList = data?.sessionList ?? []
  // Distribution of spend across sessions (one dot each) — surfaces the handful of
  // heavy sessions that dominate the window versus the long light tail.
  const outs = sessionList.map((s) => s.out)
  const stripPts = sessionList.map((s) => ({
    v: s.out, label: `${s.project} · ${s.turns} turns`,
  }))
  // Cost (out tokens) × throughput (output per turn), one dot per session, size = turns.
  // Reuse would compress to a flat band near 100%, so per-turn output is the y that
  // actually varies: high-spend + low-per-turn (bottom-right) = long grinding sessions.
  const perTurn = (s) => (s.turns ? s.out / s.turns : 0)
  const scatterPts = sessionList.map((s) => ({
    x: s.out, y: perTurn(s), size: s.turns, label: `${s.project} · ${s.day}`,
  }))
  const outMax = Math.max(1, ...outs)
  const ptMax = Math.max(1, ...sessionList.map(perTurn))
  return (
    <Card title={`Engine usage — last ${data?.windowDays ?? 30}d`} data={data}>
      <div className="usagetotals">
        <span className="chip">out {fmt(data?.totals?.out ?? 0)}</span>
        <span className="chip">in {fmt(data?.totals?.in ?? 0)}</span>
        <span className="chip">cache read {fmt(data?.totals?.cacheRead ?? 0)}</span>
        <span className="chip" title="cache-read ÷ total read input — higher = more context reused">reuse {pct(reuse)}</span>
        <span className="chip">{data?.sessions ?? 0} sessions</span>
      </div>
      <DayBars days={data?.days ?? []} />
      {sessionList.length > 1 && (
        <>
          <div className="dim small chart-cap">Per-session spend · {sessionList.length} sessions</div>
          <StripPlot points={stripPts} unit="out tokens" max={outMax} median={median(outs)} fmt={fmt} />
          <div className="dim small chart-cap">Cost × throughput · size = turns</div>
          <ScatterChart points={scatterPts} xLabel="out tokens" yLabel="out/turn" xMax={outMax} yMax={ptMax}
            xFmt={fmt} yFmt={fmt} />
        </>
      )}
      <table>
        <thead>
          <tr><th>model</th><th className="num">turns</th><th className="num">in</th><th className="num">out</th><th className="num">cache r/w</th></tr>
        </thead>
        <tbody>
          {models.map(([model, c]) => (
            <tr key={model}>
              <td className="mono">{model}</td>
              <td className="num">{c.turns}</td>
              <td className="num">{fmt(c.in)}</td>
              <td className="num">{fmt(c.out)}</td>
              <td className="num dim">{fmt(c.cacheRead)}/{fmt(c.cacheWrite)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data?.projects?.length > 1 && (
        <div className="dim small">
          by project (out tokens):{' '}
          {data.projects.map((p) => `${p.name} ${fmt(p.out)}`).join(' · ')}
        </div>
      )}
      <div className="dim small">cost n/a — {data?.costReason}</div>
    </Card>
  )
}
