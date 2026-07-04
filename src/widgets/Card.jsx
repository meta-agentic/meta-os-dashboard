import React from 'react'

// Shared card shell. Feeds that report { available: false } render their reason —
// the interface-layer rule: degrade visibly, don't fake precision.
export default function Card({ title, data, span, children }) {
  return (
    <section className="card" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <h2>{title}</h2>
      {data && data.available === false ? (
        <div className="degraded">unavailable — {data.reason}</div>
      ) : (
        children
      )}
    </section>
  )
}
