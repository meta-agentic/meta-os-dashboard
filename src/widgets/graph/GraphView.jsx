import React, { useEffect, useMemo, useRef, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import Card from '../Card.jsx'
import { useGraph, TYPE_COLOR, typeLabel } from './GraphContext.jsx'

const CONF_OPACITY = { EXTRACTED: 0.7, INFERRED: 0.35, AMBIGUOUS: 0.15 }
const W = 900, H = 560

// Static force layout: run the simulation synchronously, render the settled positions.
function layout(nodes, links) {
  const ns = nodes.map((n) => ({ ...n }))
  const ls = links.map((l) => ({ ...l }))
  const sim = forceSimulation(ns)
    .force('link', forceLink(ls).id((d) => d.id).distance(30).strength(0.4))
    .force('charge', forceManyBody().strength(-40))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(0.06))
    .force('y', forceY(H / 2).strength(0.1))
    .force('collide', forceCollide().radius((d) => radius(d) + 1))
    .stop()
  sim.tick(200)
  const pad = 30
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of ns) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y)
  }
  let bw = x1 - x0 + 2 * pad, bh = y1 - y0 + 2 * pad
  if (bw / bh > W / H) bh = bw * (H / W)
  else bw = bh * (W / H)
  const home = { x: (x0 + x1) / 2 - bw / 2, y: (y0 + y1) / 2 - bh / 2, w: bw, h: bh }
  return { ns, ls, home }
}

const radius = (n) => Math.min(3 + Math.sqrt(n.degree ?? 0), 14)

export default function GraphView({ ontology }) {
  const { sources, name, setName, type, setType, q, setQ, community, setCommunity, data, pendingSparks } = useGraph()
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H })
  const svgRef = useRef(null)
  const drag = useRef(null)
  const homeVb = useRef({ x: 0, y: 0, w: W, h: H })

  // Wheel-zoom around the cursor. Native listener: React's synthetic onWheel is
  // passive, so preventDefault (to stop the page scrolling) only works here.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e) => {
      e.preventDefault()
      setVb((v) => {
        const f = e.deltaY > 0 ? 1.15 : 1 / 1.15
        const w = Math.min(Math.max(v.w * f, homeVb.current.w / 10), homeVb.current.w * 2)
        const h = w * (H / W)
        const r = svg.getBoundingClientRect()
        const px = v.x + ((e.clientX - r.left) / r.width) * v.w
        const py = v.y + ((e.clientY - r.top) / r.height) * v.h
        return { x: px - ((px - v.x) / v.w) * w, y: py - ((py - v.y) / v.h) * h, w, h }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const d = drag.current
    const r = svgRef.current.getBoundingClientRect()
    const dx = ((e.clientX - d.x) / r.width) * d.vb.w
    const dy = ((e.clientY - d.y) / r.height) * d.vb.h
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true
    setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy })
  }
  const onPointerUp = () => { setTimeout(() => (drag.current = null), 0) }
  const zoomed = vb.x !== homeVb.current.x || vb.y !== homeVb.current.y || vb.w !== homeVb.current.w

  const laid = useMemo(() => (data?.nodes ? layout(data.nodes, data.links) : null), [data])
  useEffect(() => {
    if (laid?.home) {
      homeVb.current = laid.home
      setVb(laid.home)
    }
  }, [laid])

  // Fisheye repel on hover — imperative DOM updates (no React re-render per mousemove).
  const nodeEls = useRef(new Map())
  const lineEls = useRef(new Map())
  const displaced = useRef(new Set())
  const raf = useRef(0)
  const nodeLines = useMemo(() => {
    const m = new Map()
    laid?.ls.forEach((l, i) => {
      ;(m.get(l.source.id) ?? m.set(l.source.id, []).get(l.source.id)).push({ i, end: 1 })
      ;(m.get(l.target.id) ?? m.set(l.target.id, []).get(l.target.id)).push({ i, end: 2 })
    })
    return m
  }, [laid])

  const moveNode = (n, tx, ty, scale) => {
    const el = nodeEls.current.get(n.id)
    if (el) el.style.transform = tx || ty || scale !== 1 ? `translate(${tx}px, ${ty}px) scale(${scale})` : ''
    for (const { i, end } of nodeLines.get(n.id) ?? []) {
      const le = lineEls.current.get(i)
      if (!le) continue
      le.setAttribute(end === 1 ? 'x1' : 'x2', n.x + tx)
      le.setAttribute(end === 1 ? 'y1' : 'y2', n.y + ty)
    }
  }

  const fisheye = (e) => {
    if (drag.current || !laid || !svgRef.current) return
    const { clientX, clientY } = e
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const r = svgRef.current.getBoundingClientRect()
      const mx = vb.x + ((clientX - r.left) / r.width) * vb.w
      const my = vb.y + ((clientY - r.top) / r.height) * vb.h
      const R = 64, MAXD = 10
      for (const n of laid.ns) {
        const dx = n.x - mx, dy = n.y - my
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        if (d < R) {
          const f = 1 - d / R
          const inv = d || 1
          moveNode(n, (dx / inv) * MAXD * f, (dy / inv) * MAXD * f, 1 + 0.45 * f)
          displaced.current.add(n.id)
        } else if (displaced.current.has(n.id)) {
          moveNode(n, 0, 0, 1)
          displaced.current.delete(n.id)
        }
      }
    })
  }

  const fisheyeReset = () => {
    cancelAnimationFrame(raf.current)
    if (!laid) return
    for (const el of nodeEls.current.values()) el.style.transform = ''
    laid.ls.forEach((l, i) => {
      const le = lineEls.current.get(i)
      if (!le) return
      le.setAttribute('x1', l.source.x); le.setAttribute('y1', l.source.y)
      le.setAttribute('x2', l.target.x); le.setAttribute('y2', l.target.y)
    })
    displaced.current.clear()
  }

  // Spark: one node flares, its neighbors jiggle, the links between them flash.
  const [spark, setSpark] = useState(null)
  const fire = (id) => {
    if (!laid) return
    const neighbors = new Set()
    const links = new Set()
    laid.ls.forEach((l, i) => {
      if (l.source.id === id) { neighbors.add(l.target.id); links.add(i) }
      if (l.target.id === id) { neighbors.add(l.source.id); links.add(i) }
    })
    setSpark({ id, neighbors, links })
    setTimeout(() => setSpark((s) => (s?.id === id ? null : s)), 1200)
  }

  // Ambient pulse: a random node sparks every few seconds — biased toward connected nodes.
  useEffect(() => {
    if (!laid?.ns.length) return
    let timer
    const tick = () => {
      const viaLink = laid.ls.length && Math.random() < 0.5
      const id = viaLink
        ? (Math.random() < 0.5 ? laid.ls[Math.floor(Math.random() * laid.ls.length)].source.id
                               : laid.ls[Math.floor(Math.random() * laid.ls.length)].target.id)
        : laid.ns[Math.floor(Math.random() * laid.ns.length)].id
      fire(id)
      timer = setTimeout(tick, 3500 + Math.random() * 4000)
    }
    timer = setTimeout(tick, 1500)
    return () => clearTimeout(timer)
  }, [laid])

  // Real-event sparks: nodes that newly appeared after a graphify re-run.
  useEffect(() => {
    if (!laid || !pendingSparks.current.length) return
    const ids = pendingSparks.current
    pendingSparks.current = []
    ids.forEach((id, i) => setTimeout(() => fire(id), i * 400))
  }, [laid])

  const godIds = useMemo(() => {
    if (!laid) return new Set()
    return new Set([...laid.ns].sort((a, b) => b.degree - a.degree).slice(0, 10).map((n) => n.id))
  }, [laid])

  const nodeTypes = ontology?.graph?.node_types ?? Object.keys(TYPE_COLOR)

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
          <button className="chip" onClick={() => setVb(homeVb.current)}>reset view</button>
        )}
        <span className="spacer" />
        {data?.stats && (
          <span className="dim small">
            showing {data.stats.shown} of {data.stats.matched} matched · {data.stats.totalNodes} nodes,{' '}
            {data.stats.totalLinks} links, {data.stats.communities} communities
          </span>
        )}
      </div>
      {laid && (
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="graph"
          onPointerDown={onPointerDown}
          onPointerMove={(e) => { onPointerMove(e); fisheye(e) }}
          onPointerUp={onPointerUp}
          onPointerLeave={fisheyeReset}
          style={{ cursor: drag.current?.moved ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          {laid.ls.map((l, i) => (
            <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
              ref={(el) => (el ? lineEls.current.set(i, el) : lineEls.current.delete(i))}
              className={spark?.links.has(i) ? 'zap' : ''}
              stroke="#30363d" strokeOpacity={CONF_OPACITY[l.confidence] ?? 0.3} />
          ))}
          {laid.ns.map((n) => (
            <g key={n.id} onClick={() => !drag.current?.moved && n.community != null && setCommunity(String(n.community))} cursor="pointer">
              <circle cx={n.x} cy={n.y} r={radius(n)} fill={TYPE_COLOR[n.type] ?? '#8b949e'} fillOpacity={0.85}
                ref={(el) => (el ? nodeEls.current.set(n.id, el) : nodeEls.current.delete(n.id))}
                className={spark?.id === n.id ? 'spark' : spark?.neighbors.has(n.id) ? 'shake' : ''}>
                <title>{`${n.label}\ntype: ${typeLabel(n.type)} · degree: ${n.degree} · community: ${n.community}\n${n.source ?? ''}\n(click: filter to this community)`}</title>
              </circle>
              {godIds.has(n.id) && (
                <text x={n.x + radius(n) + 3} y={n.y + 3} className="graphlabel">{n.label}</text>
              )}
            </g>
          ))}
        </svg>
      )}
      <div className="legend">
        {nodeTypes.map((t) => (
          <span key={t} className="dim small">
            <span className="dot" style={{ background: TYPE_COLOR[t] ?? '#8b949e' }} /> {typeLabel(t)}
          </span>
        ))}
        <span className="dim small">· node size = degree · label = god nodes · click = community drill-down</span>
      </div>
    </Card>
  )
}
