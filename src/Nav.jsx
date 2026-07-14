import React from 'react'

const THEMES = [
  { v: 'system', label: 'System' },
  { v: 'dark', label: 'Dark' },
  { v: 'light', label: 'Light' },
]
const DENSITIES = [
  { v: 'comfortable', label: 'Comfortable' },
  { v: 'compact', label: 'Compact' },
]

export default function Nav({ open, onClose, prefs, setPrefs, meta }) {
  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }))
  const vars = meta?.vars && Object.keys(meta.vars).length ? meta.vars : null

  return (
    <>
      <div className={'nav-scrim' + (open ? ' show' : '')} onClick={onClose} aria-hidden={!open} />
      <aside className={'nav' + (open ? ' open' : '')} aria-hidden={!open} aria-label="Settings">
        <div className="nav-head">
          <span className="nav-title">meta-os</span>
          <button className="nav-x" onClick={onClose} aria-label="Close settings">×</button>
        </div>

        <details className="nav-sec" open>
          <summary>Appearance</summary>
          <label className="nav-lbl">Theme</label>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                key={t.v}
                className={'seg-b' + (prefs.theme === t.v ? ' on' : '')}
                onClick={() => set({ theme: t.v })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="nav-lbl">Density</label>
          <div className="seg">
            {DENSITIES.map((d) => (
              <button
                key={d.v}
                className={'seg-b' + (prefs.density === d.v ? ' on' : '')}
                onClick={() => set({ density: d.v })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </details>

        <details className="nav-sec" open>
          <summary>Parameters</summary>
          <label className="nav-lbl" htmlFor="refresh">Auto-refresh (seconds)</label>
          <input
            id="refresh"
            className="nav-num"
            type="number"
            min="5"
            max="600"
            step="5"
            value={prefs.refreshSec}
            onChange={(e) => set({ refreshSec: Math.max(5, Math.min(600, Number(e.target.value) || 30)) })}
          />
        </details>

        <details className="nav-sec">
          <summary>Environment</summary>
          <div className="nav-kv"><span>Instance</span><code>{meta?.instance ?? '—'}</code></div>
          <div className="nav-kv"><span>Root folder</span><code className="wrap">{meta?.instanceRoot ?? '—'}</code></div>
          {meta?.frameworkRoot && (
            <div className="nav-kv"><span>Framework</span><code className="wrap">{meta.frameworkRoot}</code></div>
          )}
          {vars &&
            Object.entries(vars).map(([k, v]) => (
              <div className="nav-kv" key={k}>
                <span>${k}</span>
                <code className="wrap">{String(v)}</code>
              </div>
            ))}
          <p className="nav-note">Folders &amp; path variables are defined in <code>instance.config.json</code>.</p>
        </details>

        <details className="nav-sec">
          <summary>Account</summary>
          <p className="nav-note">
            Sign-in via <strong>Tessera IAM</strong> arrives with multi-user deployment — profiles and
            per-user boards will live here.
          </p>
          <button className="nav-btn" disabled title="Available after Tessera IAM integration">
            Sign in (coming soon)
          </button>
        </details>
      </aside>
    </>
  )
}
