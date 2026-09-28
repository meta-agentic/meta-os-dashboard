import React from 'react'
import Card from './Card.jsx'
import { LineChart } from '../charts/Charts.jsx'

// Write cadence into the instance: vault commits per day, the honest proxy for
// ingestion since git commits are where memory writes land. Split out of the
// former Memory Flux; degrades to an explicit empty state, never a fake trickle.
export default function Ingestion({ events }) {
  const vaultEv = (events?.events ?? []).filter((e) => e.source === 'vault')
  const byDay = new Map()
  for (const e of vaultEv) {
    const d = String(e.ts).slice(0, 10)
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1)
  }
  const series = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, n]) => ({ label: day.slice(5), value: n }))

  return (
    <Card title="Ingestion" data={events}>
      <div className="dim small chart-cap">vault commits / day</div>
      {series.length >= 2 ? (
        <LineChart data={series} unit="commits" xLabel="day" />
      ) : (
        <div className="degraded">
          {vaultEv.length ? `${vaultEv.length} recent write${vaultEv.length > 1 ? 's' : ''} — need ≥2 active days to chart` : 'no recent vault writes'}
        </div>
      )}
    </Card>
  )
}
