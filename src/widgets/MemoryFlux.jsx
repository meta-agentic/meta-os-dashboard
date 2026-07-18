import React from 'react'
import Card from './Card.jsx'
import { FlowDiagram, LineChart } from '../charts/Charts.jsx'

// Memory flux — how information moves through the memory components, in two readings:
//   1. structural: the raw → wiki → output promotion pipeline as a one-way flow
//      (node height & ribbon width ∝ note count) — the textbook form for stage-to-stage
//      movement, chosen over a bar group because the *movement* is the subject.
//   2. temporal: write cadence into the instance (vault commits per day), the honest
//      proxy for ingestion since git commits are where memory writes land.
// Both degrade to explicit empty-states rather than drawing a misleading trickle.
export default function MemoryFlux({ memory, events, ontology }) {
  const order = ontology?.flow?.pipelines?.['memory-promotion']?.stages ?? ['raw', 'wiki', 'output']
  const flowStages = order.map((k) => ({ key: k, value: memory?.stages?.[k]?.count ?? 0 }))
  const raw = flowStages[0]?.value ?? 0
  const out = flowStages.at(-1)?.value ?? 0
  const promoted = raw ? out / raw : 0

  // Ingestion cadence — vault-source commits binned by day (chronological for the line).
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
    <Card title="Memory Flux" data={memory}>
      <div className="mem-kpis">
        <span>promotion <b className="num">{Math.round(promoted * 100)}%</b></span>
        <span className="dim">{raw} raw → {out} output</span>
      </div>

      <div className="dim small chart-cap">Promotion pipeline · width = notes carried</div>
      <FlowDiagram stages={flowStages} unit="notes" />

      <div className="dim small chart-cap">Ingestion · vault commits / day</div>
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
