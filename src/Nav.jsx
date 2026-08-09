import React from 'react'
import { THEMES as PALETTES, VARIANTS } from './themes.js'

const MODES = [
  { v: 'system', label: 'System' },
  { v: 'dark', label: 'Dark' },
  { v: 'light', label: 'Light' },
]

// Which variant the swatch should preview: an explicit mode wins, otherwise follow
// the OS, so the preview always matches what clicking would actually give you.
function previewMode(mode) {
  if (mode === 'light' || mode === 'dark') return mode
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// A theme reads as a miniature of the real thing — page ground, a card on top, the
// accent, and the categorical hues charts will actually use. Showing the data hues
// matters: they are the part a name like "Nord" doesn't tell you.
function Swatch({ t, mode }) {
  const v = t[mode]
  return (
    <span className="sw" style={{ background: v.bg, borderColor: v.card }} aria-hidden="true">
      <span className="sw-card" style={{ background: v.card }}>
        <span className="sw-dot" style={{ background: v.accent }} />
        <span className="sw-cats">
          {v.cat.slice(0, 6).map((c, i) => <i key={i} style={{ background: c }} />)}
        </span>
      </span>
    </span>
  )
}
const DENSITIES = [
  { v: 'comfortable', label: 'Comfortable' },
  { v: 'compact', label: 'Compact' },
]

export default function Nav({ open, onClose, prefs, setPrefs, meta, auth }) {
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
          <label className="nav-lbl">Mode</label>
          <div className="seg">
            {MODES.map((t) => (
              <button
                key={t.v}
                className={'seg-b' + (prefs.theme === t.v ? ' on' : '')}
                onClick={() => set({ theme: t.v })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="nav-lbl">Theme</label>
          {VARIANTS.map((v) => (
            <div key={v.key}>
              <div className="nav-sub" title={v.note}>{v.label}</div>
              <div className="themegrid" role="radiogroup" aria-label={`${v.label} themes`}>
                {PALETTES.filter((t) => t.variant === v.key).map((t) => {
                  const on = (prefs.palette ?? 'graphite') === t.key
                  // Statement themes keep hues the checks would have moved. Say which
                  // trade you are taking rather than hiding it behind a nice swatch.
                  const title = t.tradeoffs.length
                    ? `${t.note}\n\nColour trade-off: ${t.tradeoffs.join('; ')}. Charts stay readable because every series is also labelled.`
                    : t.note
                  return (
                    <button
                      key={t.key}
                      className={'themecard' + (on ? ' on' : '')}
                      role="radio"
                      aria-checked={on}
                      title={title}
                      onClick={() => set({ palette: t.key })}
                    >
                      <Swatch t={t} mode={previewMode(prefs.theme)} />
                      <span className="themename">
                        {t.label}
                        {t.tradeoffs.length > 0 && <span className="tradeoff" aria-label="colour trade-off — see tooltip">*</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="dim small">* keeps its own colours at the cost of some contrast/colour-blind separation; series are always labelled too.</div>
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
          {auth?.status === 'authed' ? (
            <>
              <div className="nav-kv"><span>User</span><code>{auth.user?.name || auth.user?.preferred_username || auth.user?.email || 'signed in'}</code></div>
              {auth.user?.email && <div className="nav-kv"><span>Email</span><code className="wrap">{auth.user.email}</code></div>}
              <button className="nav-btn" onClick={auth.logout}>Sign out</button>
            </>
          ) : auth?.status === 'disabled' || !auth ? (
            <p className="nav-note">
              Single-user mode. Set <code>auth</code> in config to require OIDC sign-in — profiles and
              per-user boards will live here.
            </p>
          ) : (
            <>
              <p className="nav-note">{auth.config?.loginHint ?? 'Sign in to access this dashboard.'}</p>
              <button className="nav-btn" onClick={auth.login}>{auth.config?.loginLabel ?? 'Sign in'}</button>
            </>
          )}
        </details>
      </aside>
    </>
  )
}
