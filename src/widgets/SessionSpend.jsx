import React from 'react'
import Card from './Card.jsx'
import { StripPlot } from '../charts/Charts.jsx'
import { fmt, median, tooFewSessions } from './usageShared.js'

// Distribution of spend across sessions, one dot each — surfaces the handful of
// heavy sessions that dominate the window versus the long light tail. Spend spans
// three orders of magnitude, so the axis is logarithmic: on a linear one the bulk
// of sessions collapses into the leftmost few pixels. Split out of Engine usage.
export default function SessionSpend({ data }) {
  const list = data?.sessionList ?? []
  const outs = list.map((s) => s.out)
  const empty = tooFewSessions(list)
  return (
    <Card title="Per-session spend" data={data}>
      {empty ? <div className="degraded">{empty}</div> : (
        <>
          <div className="dim small chart-cap">{list.length} sessions · output tokens · median {fmt(median(outs))}</div>
          <StripPlot points={list.map((s) => ({ v: s.out, label: `${s.project} · ${s.turns} turns` }))}
            unit="out tokens" max={Math.max(1, ...outs)} median={median(outs)} fmt={fmt} scale="log" />
        </>
      )}
    </Card>
  )
}
