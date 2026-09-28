import React from 'react'
import Card from './Card.jsx'
import { ago } from './memoryShared.js'

// Where the knowledge actually lives: one row per federated vault, bar ∝ notes.
export default function FederatedVaults({ data }) {
  const vaults = data?.federated?.vaults ?? []
  const maxNotes = Math.max(1, ...vaults.map((v) => v.notes))
  return (
    <Card title="Federated Vaults" data={data}>
      {!vaults.length ? (
        <div className="degraded">no federated vaults configured</div>
      ) : (
        <div className="vaults">
          <div className="vaults-head">
            <span>{vaults.length} vault{vaults.length === 1 ? '' : 's'}</span>
            <span className="dim small">
              {data.federated.total} notes{data.federated.newest ? ` · newest ${ago(data.federated.newest)}` : ''}
            </span>
          </div>
          {vaults.map((v) => (
            <div className="vault-row" key={v.name} title={`${v.name}: ${v.notes} notes`}>
              <span className="vault-name mono">{v.name}</span>
              <span className="vault-bar"><i style={{ width: `${(v.notes / maxNotes) * 100}%` }} /></span>
              <span className="vault-n num">{v.notes}</span>
              <span className="vault-age dim small">{v.newest ? ago(v.newest) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
