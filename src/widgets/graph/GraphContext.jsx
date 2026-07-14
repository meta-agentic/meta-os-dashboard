import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

// Shared visual vocabulary for both graph widgets.
export const TYPE_COLOR = {
  code: '#58a6ff', document: '#3fb950', paper: '#d29922',
  concept: '#bc8cff', rationale: '#f85149', image: '#8b949e',
}
const TYPE_LABEL = { paper: 'spike' } // display alias only — graph.json keeps graphify's vocabulary
export const typeLabel = (t) => TYPE_LABEL[t] ?? t

// One source of truth for source/filter state and the graph payload, so the graph
// viz and the hubs table are two widgets over the SAME data — a community picked in
// one filters the other. Lives above the grid (see main.jsx).
const Ctx = createContext(null)
export const useGraph = () => useContext(Ctx)

export function GraphProvider({ children }) {
  const [sources, setSources] = useState(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [community, setCommunity] = useState('')
  const [data, setData] = useState(null)
  const fetchKey = useRef(null)
  const pendingSparks = useRef([])

  useEffect(() => {
    fetch('/api/graphs').then((r) => r.json()).then((d) => {
      setSources(d)
      if (d.sources?.[0]) setName(d.sources[0].name)
    })
  }, [])

  useEffect(() => {
    if (!name) return
    const key = `${name}|${type}|${q}|${community}`
    const load = () => {
      const params = new URLSearchParams({ name, ...(type && { type }), ...(q && { q }), ...(community !== '' && { community }) })
      fetch(`/api/graph?${params}`).then((r) => r.json()).then((d) => {
        setData((prev) => {
          if (prev && fetchKey.current === key && prev.mtime === d.mtime) return prev
          if (prev && fetchKey.current === key && d.nodes) {
            const old = new Set(prev.nodes.map((n) => n.id))
            pendingSparks.current = d.nodes.filter((n) => !old.has(n.id)).slice(0, 8).map((n) => n.id)
          }
          fetchKey.current = key
          return d
        })
      })
    }
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [name, type, q, community])

  const value = { sources, name, setName, type, setType, q, setQ, community, setCommunity, data, pendingSparks }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
