import React from 'react'
import Card from '../Card.jsx'
import { useGraph, TYPE_COLOR, typeLabel } from './GraphContext.jsx'

// The tabular half of the knowledge graph: top hubs per node type, over the SAME
// filtered graph the viz shows. Picking a community here filters the viz too.
export default function GraphTable({ ontology }) {
  const { sources, name, setName, community, setCommunity, data } = useGraph()
  const nodeTypes = ontology?.graph?.node_types ?? Object.keys(TYPE_COLOR)
  const hubs = data?.hubsByType

  return (
    <Card title="Knowledge graph — hubs" data={sources}>
      <div className="graphbar">
        <select value={name} onChange={(e) => setName(e.target.value)}>
          {sources?.sources?.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        {community !== '' && (
          <button className="chip eta" onClick={() => setCommunity('')}>community {community} ✕</button>
        )}
        <span className="spacer" />
        {data?.stats && (
          <span className="dim small">{data.stats.totalNodes} nodes · {data.stats.communities} communities</span>
        )}
      </div>
      {hubs && Object.keys(hubs).length > 0 ? (
        <table>
          <thead>
            <tr><th>type</th><th>node</th><th className="num">degree</th><th>community</th><th>source</th></tr>
          </thead>
          <tbody>
            {nodeTypes.filter((t) => hubs[t]).flatMap((t) =>
              hubs[t].map((n, i) => (
                <tr key={n.id}>
                  <td>{i === 0 && <><span className="dot" style={{ background: TYPE_COLOR[t] ?? '#8b949e' }} />{typeLabel(t)}</>}</td>
                  <td className="mono">{n.label}</td>
                  <td className="num">{n.degree}</td>
                  <td>
                    {n.community != null ? (
                      <button className="chip" onClick={() => setCommunity(String(n.community))}>#{n.community}</button>
                    ) : <span className="dim">—</span>}
                  </td>
                  <td className="dim mono small">{n.source}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      ) : (
        <div className="dim small">no hub data for this graph</div>
      )}
    </Card>
  )
}
