import React, { useEffect, useState } from 'react'
import { apiGet, isStatic } from '../api.js'

// The questions only the PO can answer: every open decision in the vault's register,
// oldest first, with its space, its recommendation and what it blocks. Read-only —
// answering stays with the vault CLI, and an answered question is gone on the next read.
// Local only: a static snapshot or a GitHub source has no register to read, so the panel
// renders nothing there rather than a fake empty state.

export default function PoQuestions({ refreshSec = 30 }) {
  const [state, setState] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (isStatic) return undefined
    let live = true
    const load = () => apiGet('/api/decisions').then((d) => live && setState(d)).catch(() => live && setState(null))
    load()
    const t = setInterval(load, refreshSec * 1000)
    return () => { live = false; clearInterval(t) }
  }, [refreshSec])

  if (!state || state.available === false) return null
  const rows = state.decisions ?? []
  return (
    <section className="poq" aria-label="PO questions">
      <div className="poq-head">
        <span className="poq-title">PO questions</span>
        <span className="dim small">{rows.length ? `${rows.length} open, oldest first` : 'none open'}</span>
      </div>
      {rows.length > 0 && (
        <ol className="poq-list">
          {rows.map((d) => {
            const key = `${d.space}/${d.id}`
            const on = open === key
            return (
              <li key={key} className="poq-row">
                <button className="poq-q" aria-expanded={on} onClick={() => setOpen(on ? null : key)}>
                  <span className="wi-pill small none">{d.space.toUpperCase()}</span>
                  <span className="mono dim small">{d.id}</span>
                  <span className="poq-text">{d.question}</span>
                  <span className="dim small poq-age" title={`raised ${d.raised}`}>{d.ageDays == null ? '' : `${d.ageDays} d`}</span>
                </button>
                <div className="poq-meta small">
                  {d.recommendation && <span><span className="dim">recommendation</span> {d.recommendation}</span>}
                  {d.blocks.length > 0 && <span><span className="dim">blocks</span> {d.blocks.join(', ')}</span>}
                </div>
                {on && d.options.length > 0 && (
                  <ul className="poq-options small">{d.options.map((o) => <li key={o}>{o}</li>)}</ul>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
