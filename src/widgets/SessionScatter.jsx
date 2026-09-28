import React from 'react'
import Card from './Card.jsx'
import { ScatterChart } from '../charts/Charts.jsx'
import { fmt, perTurn, tooFewSessions } from './usageShared.js'

// Cost (output tokens) × throughput (output per turn), one dot per session, size =
// turns. Reuse would compress to a flat band near 100%, so per-turn output is the y
// that actually varies: high spend with low per-turn output (bottom-right) is a long
// grinding session. Split out of Engine usage.
export default function SessionScatter({ data }) {
  const list = data?.sessionList ?? []
  const empty = tooFewSessions(list)
  return (
    <Card title="Cost × Throughput · Size = Turns" data={data}>
      {empty ? <div className="degraded">{empty}</div> : (
        <ScatterChart
          points={list.map((s) => ({ x: s.out, y: perTurn(s), size: s.turns, label: `${s.project} · ${s.day}` }))}
          xLabel="out tokens" yLabel="out/turn"
          xMax={Math.max(1, ...list.map((s) => s.out))} yMax={Math.max(1, ...list.map(perTurn))}
          xFmt={fmt} yFmt={fmt} />
      )}
    </Card>
  )
}
