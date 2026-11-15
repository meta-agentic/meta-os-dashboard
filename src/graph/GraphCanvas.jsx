// The renderer (ADR-MOS-18, part 8): draws a geometry with a style. Pan, zoom, reset,
// hover titles, click and keyboard focus on nodes. It knows the canonical model and the
// style's accessors, nothing about any source: no node types, colours or relation names
// live here (a test fails if one does). Fisheye and sparks are opt-in behaviours.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { nodesOf, edgesOf } from './model.js'
import { useFisheye } from './behaviours/fisheye.js'
import { useSparks } from './behaviours/sparks.js'

const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w

/**
 * @param model      canonical graph model (the nodes and edges to draw)
 * @param geometry   from a layout strategy: positions, routes, home, width, height
 * @param style      a resolved style (resolveStyle)
 * @param labelFor   (node) => boolean: which nodes get a text label
 * @param title      (node) => string: the hover text
 * @param onNodeClick (node, event)
 * @param behaviours { fisheye?: boolean, sparks?: { pending?: ref of ids }, ambient?: boolean }
 * @param onViewChange ({ zoomed }) when the view leaves or returns to home
 * ref: { resetView() }
 */
const GraphCanvas = forwardRef(function GraphCanvas(
  { model, geometry, style, labelFor = () => false, title, onNodeClick, behaviours = {}, onViewChange, className = 'graph' },
  ref,
) {
  const { width: W, height: H } = geometry
  const laid = useMemo(() => {
    const nodes = nodesOf(model).map((n) => ({ ...n, x: geometry.positions[n.id]?.x ?? 0, y: geometry.positions[n.id]?.y ?? 0 }))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    // A route is geometry only; the edge's own attributes (relation, metadata) come back
    // from the model by index so the style can read them.
    const edges = edgesOf(model)
    const links = geometry.routes
      .map((r) => ({ ...edges[r.index], ...r, source: byId.get(r.source), target: byId.get(r.target) }))
      .filter((l) => l.source && l.target)
    return { nodes, links, byId }
  }, [model, geometry])

  const [vb, setVb] = useState(geometry.home)
  const vbRef = useRef(vb)
  vbRef.current = vb
  const homeRef = useRef(geometry.home)
  const svgRef = useRef(null)
  const drag = useRef(null)
  const nodeEls = useRef(new Map())
  const lineEls = useRef(new Map())

  useEffect(() => {
    homeRef.current = geometry.home
    setVb(geometry.home)
  }, [geometry])

  const zoomed = !same(vb, homeRef.current)
  useEffect(() => { onViewChange?.({ zoomed }) }, [zoomed, onViewChange])
  useImperativeHandle(ref, () => ({ resetView: () => setVb(homeRef.current) }), [])

  // Wheel-zoom around the cursor. Native listener: React's synthetic onWheel is passive,
  // so preventDefault (to stop the page scrolling) only works here.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e) => {
      e.preventDefault()
      setVb((v) => {
        const f = e.deltaY > 0 ? 1.15 : 1 / 1.15
        const w = Math.min(Math.max(v.w * f, homeRef.current.w / 10), homeRef.current.w * 2)
        const h = w * (H / W)
        const r = svg.getBoundingClientRect()
        const px = v.x + ((e.clientX - r.left) / r.width) * v.w
        const py = v.y + ((e.clientY - r.top) / r.height) * v.h
        return { x: px - ((px - v.x) / v.w) * w, y: py - ((py - v.y) / v.h) * h, w, h }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [W, H])

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
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

  const fisheye = useFisheye({ enabled: !!behaviours.fisheye, laid, svgRef, vbRef, dragRef: drag, nodeEls, lineEls })
  const { spark } = useSparks({ enabled: !!(behaviours.sparks || behaviours.ambient), ambient: !!behaviours.ambient, pending: behaviours.sparks?.pending, laid })

  const click = (n) => (e) => { if (!drag.current?.moved) onNodeClick?.(n, e) }
  const key = (n) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNodeClick?.(n, e) } }

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={className}
      role="img"
      aria-label={`graph of ${laid.nodes.length} nodes and ${laid.links.length} edges`}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => { onPointerMove(e); fisheye.onMove(e) }}
      onPointerUp={onPointerUp}
      onPointerLeave={fisheye.onLeave}
      style={{ cursor: drag.current?.moved ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      {laid.links.map((l) => (
        <line key={l.index} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
          ref={(el) => (el ? lineEls.current.set(l.index, el) : lineEls.current.delete(l.index))}
          className={spark?.links.has(l.index) ? 'zap' : ''}
          stroke={style.edgeStroke(l)} strokeOpacity={style.edgeOpacity(l)} />
      ))}
      {laid.nodes.map((n) => {
        const r = style.nodeSize(n)
        return (
          <g key={n.id} className="graphnode" onClick={click(n)} onKeyDown={key(n)} tabIndex={onNodeClick ? 0 : undefined} cursor={onNodeClick ? 'pointer' : undefined}>
            <circle cx={n.x} cy={n.y} r={r} fill={style.nodeColor(n)} fillOpacity={0.85}
              ref={(el) => (el ? nodeEls.current.set(n.id, el) : nodeEls.current.delete(n.id))}
              className={spark?.id === n.id ? 'spark' : spark?.neighbours.has(n.id) ? 'shake' : ''}>
              <title>{title ? title(n) : style.nodeLabel(n)}</title>
            </circle>
            {labelFor(n) && <text x={n.x + r + 3} y={n.y + 3} className="graphlabel">{style.nodeLabel(n)}</text>}
          </g>
        )
      })}
    </svg>
  )
})

export default GraphCanvas
