// Fisheye repel on hover: nodes near the pointer move away and grow, their edges follow.
// Imperative DOM updates in an animation frame, no React re-render per pointer move.
import { useCallback, useMemo, useRef } from 'react'

const RADIUS = 64, MAX_DISPLACEMENT = 10

/**
 * How far a node at distance `d` from the pointer moves away, for a node of radius `r`
 * inside a lens of radius `R`. Zero under the pointer (within the node's own radius, so
 * the pointer can reach and click it), largest halfway out, zero again at the lens edge.
 * The old profile peaked at the centre, so a node fled the pointer and could never be
 * reached: the repulsion grew as the pointer closed in.
 */
export function fisheyePush(d, r, R = RADIUS, max = MAX_DISPLACEMENT) {
  if (d >= R || d <= r) return 0
  return max * Math.sin(Math.PI * Math.min(1, d / R))
}

/** The hovered neighbourhood grows: largest under the pointer, back to 1 at the lens edge. */
export function fisheyeScale(d, R = RADIUS) {
  return d >= R ? 1 : 1 + 0.45 * (1 - d / R)
}

export function useFisheye({ enabled, laid, svgRef, vbRef, dragRef, nodeEls, lineEls }) {
  const displaced = useRef(new Set())
  const raf = useRef(0)

  // Which line ends each node moves.
  const nodeLines = useMemo(() => {
    const m = new Map()
    laid?.links.forEach((l) => {
      ;(m.get(l.source.id) ?? m.set(l.source.id, []).get(l.source.id)).push({ i: l.index, end: 1 })
      ;(m.get(l.target.id) ?? m.set(l.target.id, []).get(l.target.id)).push({ i: l.index, end: 2 })
    })
    return m
  }, [laid])

  const moveNode = useCallback((n, tx, ty, scale) => {
    const el = nodeEls.current.get(n.id)
    if (el) el.style.transform = tx || ty || scale !== 1 ? `translate(${tx}px, ${ty}px) scale(${scale})` : ''
    for (const { i, end } of nodeLines.get(n.id) ?? []) {
      const le = lineEls.current.get(i)
      if (!le) continue
      le.setAttribute(end === 1 ? 'x1' : 'x2', n.x + tx)
      le.setAttribute(end === 1 ? 'y1' : 'y2', n.y + ty)
    }
  }, [nodeLines, nodeEls, lineEls])

  const onMove = useCallback((e) => {
    if (!enabled || dragRef.current || !laid || !svgRef.current) return
    const { clientX, clientY } = e
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const svg = svgRef.current
      if (!svg) return
      const r = svg.getBoundingClientRect()
      const vb = vbRef.current
      const mx = vb.x + ((clientX - r.left) / r.width) * vb.w
      const my = vb.y + ((clientY - r.top) / r.height) * vb.h
      for (const n of laid.nodes) {
        const dx = n.x - mx, dy = n.y - my
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        if (d < RADIUS) {
          const push = fisheyePush(d, n.r ?? 0)
          const inv = d || 1
          moveNode(n, (dx / inv) * push, (dy / inv) * push, fisheyeScale(d))
          displaced.current.add(n.id)
        } else if (displaced.current.has(n.id)) {
          moveNode(n, 0, 0, 1)
          displaced.current.delete(n.id)
        }
      }
    })
  }, [enabled, laid, svgRef, vbRef, dragRef, moveNode])

  const onLeave = useCallback(() => {
    cancelAnimationFrame(raf.current)
    if (!enabled || !laid) return
    for (const el of nodeEls.current.values()) el.style.transform = ''
    for (const l of laid.links) {
      const le = lineEls.current.get(l.index)
      if (!le) continue
      le.setAttribute('x1', l.source.x); le.setAttribute('y1', l.source.y)
      le.setAttribute('x2', l.target.x); le.setAttribute('y2', l.target.y)
    }
    displaced.current.clear()
  }, [enabled, laid, nodeEls, lineEls])

  return { onMove, onLeave }
}
