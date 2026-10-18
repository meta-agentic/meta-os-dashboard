import React from 'react'
import { captionOf } from './caption.js'

// Shared card shell. Feeds that report { available: false } render their reason —
// the interface-layer rule: degrade visibly, don't fake precision.
// Every card sits in a widget frame whose header already names it, so the card shows
// only what its title adds (captionOf), never the name again.
export default function Card({ title, data, span, children }) {
  const caption = captionOf(title)
  return (
    <section className="card" style={span ? { gridColumn: `span ${span}` } : undefined}>
      {caption && <div className="card-caption dim small">{caption}</div>}
      {data && data.available === false ? (
        <div className="degraded">unavailable — {data.reason}</div>
      ) : (
        children
      )}
    </section>
  )
}
