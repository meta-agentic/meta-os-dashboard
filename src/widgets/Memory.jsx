import React from 'react'
import Card from './Card.jsx'
import { ago, pipelineTotal } from './memoryShared.js'

// Memory at a glance: how many notes the instance holds and where they sit. Two
// stores make up the total — the federated vaults (where canon lives) and the
// raw → wiki → output promotion pipeline (a small staging area) — so the tiles
// are an explicit sum and the bar shows the split. Per-vault detail lives in
// Federated Vaults, per-stage detail in Promotion Pipeline.
export default function Memory({ data }) {
  const vaults = data?.federated?.vaults ?? []
  const inVaults = data?.federated?.total ?? 0
  const inPipeline = pipelineTotal(data)
  const total = inVaults + inPipeline
  const populated = vaults.filter((v) => v.notes > 0).length
  const share = total ? (inVaults / total) * 100 : 0

  return (
    <Card title="Memory" data={data}>
      <div className="tiles mem-tiles">
        <div className="tile"><div className="tile-v">{total}</div><div className="tile-l">notes</div></div>
        <div className="tile">
          <div className="tile-v">{inVaults}</div><div className="tile-l">in vaults</div>
          <div className="tile-s dim" title={`${populated} of ${vaults.length} vaults populated`}>{populated}/{vaults.length} vaults</div>
        </div>
        <div className="tile">
          <div className="tile-v">{inPipeline}</div><div className="tile-l">in pipeline</div>
          <div className="tile-s dim">{inPipeline ? 'staging' : 'unused'}</div>
        </div>
      </div>
      {total > 0 && (
        <div className="mem-split" role="img" aria-label={`${inVaults} in vaults, ${inPipeline} in pipeline`}>
          <i className="mem-split-v" style={{ width: `${share}%` }} />
          <i className="mem-split-p" style={{ width: `${100 - share}%` }} />
        </div>
      )}
      {data?.federated?.newest && <div className="dim small">newest note {ago(data.federated.newest)}</div>}
    </Card>
  )
}
