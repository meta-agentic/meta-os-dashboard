import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../api.js'

// One source of truth for source/filter state and the graph payload, so the graph
// viz and the hubs table are two widgets over the SAME data — a community picked in
// one filters the other. Lives above the grid (see main.jsx). The payload is a
// canonical graph view: { version, stats, hubsByType, model }.
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
    apiFetch('/api/graphs').then((r) => r.json()).then((d) => {
      setSources(d)
      if (d.sources?.[0]) setName(d.sources[0].name)
    })
  }, [])

  useEffect(() => {
    if (!name) return
    const key = `${name}|${type}|${q}|${community}`
    const load = () => {
      const params = new URLSearchParams({ name, ...(type && { type }), ...(q && { q }), ...(community !== '' && { group: community }) })
      apiFetch(`/api/graph?${params}`).then((r) => r.json()).then((d) => {
        setData((prev) => {
          if (prev && fetchKey.current === key && prev.version === d.version) return prev
          if (prev && fetchKey.current === key && d.model) {
            const old = new Set(Object.keys(prev.model?.graph.nodes ?? {}))
            pendingSparks.current = Object.keys(d.model.graph.nodes).filter((id) => !old.has(id)).slice(0, 8)
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
