// The force layout strategy (ADR-MOS-18, part 7): `layout(model, options) → geometry`.
// Pure and synchronous; the geometry is coordinates, never pixels: positions per node,
// a route per edge, the bounds and the "home" view that frames them at the aspect ratio
// of the drawing. d3-force's default random source is a fixed-seed generator, so the
// same model and options give the same positions on every run; a `seed` option swaps
// in another fixed sequence.
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { nodesOf, edgesOf } from '../model.js'

function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

export const FORCE_DEFAULTS = {
  width: 900, height: 560, padding: 30, ticks: 200,
  link: { distance: 30, strength: 0.4 }, charge: -40, gravity: { x: 0.06, y: 0.1 }, collidePadding: 1,
}

/**
 * @param model a canonical graph model
 * @param options.size  node radius in drawing units, from the resolved style (collision and framing use it)
 */
export function forceLayout(model, options = {}) {
  const o = { ...FORCE_DEFAULTS, ...options, link: { ...FORCE_DEFAULTS.link, ...options.link }, gravity: { ...FORCE_DEFAULTS.gravity, ...options.gravity } }
  const size = o.size ?? (() => 4)
  const { width: W, height: H } = o
  const ns = nodesOf(model).map((n) => ({ id: n.id, r: size(n) }))
  const ls = edgesOf(model).map((e, index) => ({ index, source: e.source, target: e.target }))
  const sim = forceSimulation(ns)
    .force('link', forceLink(ls).id((d) => d.id).distance(o.link.distance).strength(o.link.strength))
    .force('charge', forceManyBody().strength(o.charge))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(o.gravity.x))
    .force('y', forceY(H / 2).strength(o.gravity.y))
    .force('collide', forceCollide().radius((d) => d.r + o.collidePadding))
    .stop()
  if (o.seed != null) sim.randomSource(lcg(o.seed))
  sim.tick(o.ticks)

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of ns) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
    x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y)
  }
  let bw = x1 - x0 + 2 * o.padding, bh = y1 - y0 + 2 * o.padding
  if (bw / bh > W / H) bh = bw * (H / W)
  else bw = bh * (W / H)
  const home = ns.length ? { x: (x0 + x1) / 2 - bw / 2, y: (y0 + y1) / 2 - bh / 2, w: bw, h: bh } : { x: 0, y: 0, w: W, h: H }

  const positions = {}
  for (const n of ns) positions[n.id] = { x: n.x, y: n.y }
  const routes = ls.map((l) => ({
    index: l.index, source: l.source.id, target: l.target.id,
    points: [[l.source.x, l.source.y], [l.target.x, l.target.y]],
  }))
  return { strategy: 'force', width: W, height: H, positions, routes, bounds: { x0, y0, x1, y1 }, home }
}
