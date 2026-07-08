import React from 'react'
import Card from './Card.jsx'

const fmt = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n)

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
  return (
    <Card title={`Engine usage — last ${data?.windowDays ?? 30}d`} data={data}>
      <div className="usagetotals">
        <span className="chip">out {fmt(data?.totals?.out ?? 0)}</span>
        <span className="chip">in {fmt(data?.totals?.in ?? 0)}</span>
        <span className="chip">cache read {fmt(data?.totals?.cacheRead ?? 0)}</span>
        <span className="chip">{data?.sessions ?? 0} sessions</span>
      </div>
      <DayBars days={data?.days ?? []} />
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
