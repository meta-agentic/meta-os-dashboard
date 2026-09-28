import React from 'react'
import Card from './Card.jsx'
import { FlowDiagram } from '../charts/Charts.jsx'
import { promotionStages } from './memoryShared.js'

// The promotion pipeline read as a one-way flow (node height & ribbon width ∝ note
// count) — the textbook form for stage-to-stage movement, chosen over a bar group
// because the movement is the subject. Split out of the former Memory Flux.
export default function PromotionFlow({ data, ontology }) {
  const stages = promotionStages(ontology).map((k) => ({ key: k, value: data?.stages?.[k]?.count ?? 0 }))
  const raw = stages[0]?.value ?? 0
  const out = stages.at(-1)?.value ?? 0
  return (
    <Card title="Promotion Flow" data={data}>
      <div className="mem-kpis">
        <span>promotion <b className="num">{raw ? Math.round((out / raw) * 100) : 0}%</b></span>
        <span className="dim">{raw} raw → {out} output</span>
      </div>
      <div className="dim small chart-cap">width = notes carried</div>
      <FlowDiagram stages={stages} unit="notes" />
    </Card>
  )
}
