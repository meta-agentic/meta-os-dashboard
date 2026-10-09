import React, { useEffect, useRef, useState } from 'react'
import { isStatic } from '../api.js'

const join = (dir, name) => (dir ? `${dir}/${name}` : name)
const parent = (p) => p.split('/').slice(0, -1).join('/')
const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`)

function hexRows(base64) {
  const bin = atob(base64)
  const rows = []
  for (let o = 0; o < bin.length; o += 16) {
    const bytes = []
    for (let i = o; i < Math.min(o + 16, bin.length); i++) bytes.push(bin.charCodeAt(i))
    rows.push({
      off: o.toString(16).padStart(6, '0'),
      hex: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
      ascii: bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join(''),
    })
  }
  return rows
}

// `target` ({ root, path, line? }) opens straight onto one file, scrolled to and
// marking `line` — how the ADR register shows a whole ADR or one of its sections. A
// new target needs a new mount (key it on the path); `line` may change in place.
export default function FilePreview({ roots, target }) {
  const rootKeys = roots?.length ? roots : ['instance']
  const [root, setRoot] = useState(target?.root ?? rootKeys[0])
  const [cwd, setCwd] = useState(target ? parent(target.path) : '')
  const pending = useRef(target?.path ?? null)
  const codeRef = useRef(null)
  const [listing, setListing] = useState(null)
  const [file, setFile] = useState(null)
  const [hex, setHex] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setFile(null)
    if (isStatic) return setErr('File preview needs the live API — not available on static GitHub Pages')
    setErr(null)
    fetch(`/api/browse?root=${root}&path=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setListing(d)))
      .catch((e) => setErr(String(e)))
    if (pending.current) {
      openPath(pending.current)
      pending.current = null
    }
  }, [root, cwd])

  const mark = file && target && file.path === target.path ? target.line : null
  useEffect(() => {
    if (!mark || !codeRef.current) return
    const row = codeRef.current.children[mark - 1]
    if (row) codeRef.current.scrollTop = row.offsetTop - codeRef.current.offsetTop
  }, [file, mark])

  const open = (name, forceHex = false) => openPath(join(cwd, name), forceHex)
  const openPath = (p, forceHex = false) => {
    setErr(null)
    fetch(`/api/file?root=${root}&path=${encodeURIComponent(p)}${forceHex ? '&mode=hex' : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setErr(d.error)
        setFile(d)
        setHex(d.kind === 'binary')
      })
      .catch((e) => setErr(String(e)))
  }
  const reveal = () => {
    const p = file ? file.path : cwd
    fetch(`/api/reveal?root=${root}&path=${encodeURIComponent(p)}`).catch(() => {})
  }
  const toggleHex = () => {
    const next = !hex
    setHex(next)
    if (next && file?.kind === 'text') open(file.name, true) // refetch raw bytes for hex
    else if (!next && file?.kind === 'binary') open(file.name, false)
  }

  return (
    <div className="fp">
      <div className="fp-bar">
        {rootKeys.length > 1 && (
          <select className="fp-root" value={root} onChange={(e) => { setRoot(e.target.value); setCwd('') }}>
            {rootKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <span className="fp-path mono">/{file ? file.path : listing?.path || ''}</span>
        <span className="spacer" />
        <button className="fp-btn" onClick={reveal} title="Reveal in the OS file manager (Finder / Explorer)">⤴ reveal</button>
        {file && <button className="fp-btn" onClick={() => setFile(null)} title="Back to folder">← files</button>}
        {file && <button className={'fp-btn' + (hex ? ' on' : '')} onClick={toggleHex} title="Toggle hex view">hex</button>}
      </div>

      {err && <div className="degraded">{err}</div>}

      {!file && listing && (
        <ul className="fp-list">
          {cwd && (
            <li><button className="fp-entry dir" onClick={() => setCwd(parent(cwd))}><span className="fp-ic">↰</span> ..</button></li>
          )}
          {listing.entries.map((e) => (
            <li key={e.name}>
              <button
                className={'fp-entry ' + e.type}
                onClick={() => (e.type === 'dir' ? setCwd(join(cwd, e.name)) : open(e.name))}
              >
                <span className="fp-ic">{e.type === 'dir' ? '▸' : '·'}</span>
                <span className="fp-name">{e.name}</span>
                <span className="fp-size dim">{fmtSize(e.size)}</span>
              </button>
            </li>
          ))}
          {!listing.entries.length && <li className="dim small" style={{ padding: '0.4rem' }}>empty folder</li>}
        </ul>
      )}

      {file && (
        <div className="fp-view">
          <div className="fp-meta dim small">
            {file.ext || 'no ext'} · {fmtSize(file.size)}
            {file.pretty && <span className="chip eta">pretty JSON</span>}
            {file.truncated && <span className="chip">truncated</span>}
          </div>
          {hex || file.kind === 'binary' ? (
            <div className="hex">
              {hexRows(file.base64).map((r, i) => (
                <div className="hex-row" key={i}>
                  <span className="hex-off">{r.off}</span>
                  <span className="hex-bytes">{r.hex}</span>
                  <span className="hex-ascii">{r.ascii}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="code" ref={codeRef}>
              {file.text.split('\n').map((ln, i) => (
                <div className={'cl' + (i + 1 === mark ? ' mark' : '')} key={i}>
                  <span className="ln">{i + 1}</span>
                  <span className="lc">{ln || ' '}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
