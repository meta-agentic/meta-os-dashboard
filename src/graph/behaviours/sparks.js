// Sparks: one node flares, its neighbours jiggle, the edges between them flash. Two
// triggers, both opt-in: an ambient pulse (a random node every few seconds, biased
// toward connected nodes) and real events (ids the host puts in `pending`, fired in
// sequence after a new layout).
import { useCallback, useEffect, useState } from 'react'

export function useSparks({ enabled, ambient, pending, laid }) {
  const [spark, setSpark] = useState(null)

  const fire = useCallback((id) => {
    if (!enabled || !laid) return
    const neighbours = new Set()
    const links = new Set()
    for (const l of laid.links) {
      if (l.source.id === id) { neighbours.add(l.target.id); links.add(l.index) }
      if (l.target.id === id) { neighbours.add(l.source.id); links.add(l.index) }
    }
    setSpark({ id, neighbours, links })
    setTimeout(() => setSpark((s) => (s?.id === id ? null : s)), 1200)
  }, [enabled, laid])

  useEffect(() => {
    if (!enabled || !ambient || !laid?.nodes.length) return
    let timer
    const tick = () => {
      const { nodes, links } = laid
      const viaLink = links.length && Math.random() < 0.5
      const id = viaLink
        ? (Math.random() < 0.5 ? links[Math.floor(Math.random() * links.length)].source.id
                               : links[Math.floor(Math.random() * links.length)].target.id)
        : nodes[Math.floor(Math.random() * nodes.length)].id
      fire(id)
      timer = setTimeout(tick, 3500 + Math.random() * 4000)
    }
    timer = setTimeout(tick, 1500)
    return () => clearTimeout(timer)
  }, [enabled, ambient, laid, fire])

  useEffect(() => {
    if (!enabled || !laid || !pending?.current?.length) return
    const ids = pending.current
    pending.current = []
    ids.forEach((id, i) => setTimeout(() => fire(id), i * 400))
  }, [enabled, laid, pending, fire])

  return { spark, fire }
}
