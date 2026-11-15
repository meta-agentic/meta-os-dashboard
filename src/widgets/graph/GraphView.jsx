// The knowledge-graph widget: a thin shell that picks the graphify source, its style,
// the force layout and the fisheye and spark behaviours, and hands them to the generic
// drawing component. Everything graphify-specific is here or in graphifyStyle.js.
import React, { useCallback, useMemo, useRef, useState } from 'react'
import Card from '../Card.jsx'
import GraphCanvas from '../../graph/GraphCanvas.jsx'
import GraphList from '../../graph/GraphList.jsx'
import { resolveStyle } from '../../graph/style.js'
import { forceLayout } from '../../graph/layout/force.js'
import { nodesOf } from '../../graph/model.js'
import { useGraph } from './GraphContext.jsx'
import { graphifyStyle, TYPE_COLOR, typeLabel } from './graphifyStyle.js'

const style = resolveStyle(graphifyStyle)
const GOD_NODES = 10

export default function GraphView({ ontology }) {
  const { sources, name, setName, type, setType, q, setQ, community, setCommunity, data, pendingSparks } = useGraph()
  const canvas = useRef(null)
  const [zoomed, setZoomed] = useState(false)
  const onViewChange = useCallback(({ zoomed }) => setZoomed(zoomed), [])

  const model = data?.model
  const geometry = useMemo(() => (model ? forceLayout(model, { size: style.nodeSize }) : null), [model])
  // Labels only on the god nodes: the top ten by degree.
  const godIds = useMemo(() => {
    if (!model) return new Set()
    return new Set(nodesOf(model).sort((a, b) => (b.metadata.degree ?? 0) - (a.metadata.degree ?? 0)).slice(0, GOD_NODES).map((n) => n.id))
  }, [model])
  const behaviours = useMemo(() => ({ fisheye: true, sparks: { pending: pendingSparks }, ambient: true }), [pendingSparks])

  const nodeTypes = ontology?.graph?.node_types ?? Object.keys(TYPE_COLOR)
  const drill = (n) => { if (n.metadata.group != null) setCommunity(String(n.metadata.group)) }
  const title = (n) => `${n.label}\ntype: ${typeLabel(n.metadata.type)} · degree: ${n.metadata.degree} · community: ${n.metadata.group}\n${n.metadata.source ?? ''}\n(click: filter to this community)`

  return (
    <Card title="Knowledge graph — graphify" data={sources} span={2}>
      <div className="graphbar">
        <select value={name} onChange={(e) => setName(e.target.value)}>
          {sources?.sources?.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">all types</option>
          {nodeTypes.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <input placeholder="search nodes…" value={q} onChange={(e) => setQ(e.target.value)} />
        {community !== '' && (
          <button className="chip eta" onClick={() => setCommunity('')}>community {community} ✕</button>
        )}
        {zoomed && (
          <button className="chip" onClick={() => canvas.current?.resetView()}>reset view</button>
        )}
        <span className="spacer" />
        {data?.stats && (
          <span className="dim small">
            showing {data.stats.shown} of {data.stats.matched} matched · {data.stats.totalNodes} nodes,{' '}
            {data.stats.totalEdges} links, {data.stats.groups} communities
          </span>
        )}
      </div>
      {model && geometry && (
        <GraphCanvas
          ref={canvas}
          model={model}
          geometry={geometry}
          style={style}
          labelFor={(n) => godIds.has(n.id)}
          title={title}
          onNodeClick={drill}
          behaviours={behaviours}
          onViewChange={onViewChange}
        />
      )}
      <div className="legend">
        {style.legend(nodeTypes).map((row) => (
          <span key={row.value} className="dim small">
            <span className="dot" style={{ background: row.color }} /> {row.label}
          </span>
        ))}
        <span className="dim small">· node size = degree · label = god nodes · click = community drill-down</span>
      </div>
      {model && <GraphList model={model} style={style} onNodeClick={drill} />}
    </Card>
  )
}
