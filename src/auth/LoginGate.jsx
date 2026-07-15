import React from 'react'
import { useAuth } from './AuthProvider.jsx'

// Gate the app when auth is enabled. Disabled or authed ⇒ render the dashboard.
export default function LoginGate({ children }) {
  const a = useAuth()

  if (a.status === 'loading') return <div className="authscreen"><div className="dim">connecting…</div></div>
  if (a.status === 'authed') return children
  if (a.status === 'disabled') return children

  const label = a.config?.loginLabel ?? 'Sign in with Google'
  const hint = a.config?.loginHint ?? 'Sign in to access this instance dashboard.'
  const apiDown = a.status === 'error' && !a.config

  return (
    <div className="authscreen">
      <div className="authcard">
        <div className="authmark">meta-os</div>
        <h1 className="authtitle">{apiDown ? 'API not reachable' : 'Sign in to observe the mission'}</h1>
        <p className="dim">{apiDown ? 'The dashboard UI is live on GitHub Pages, but the hosted API is not running yet.' : hint}</p>
        {a.status === 'error' && <div className="degraded">{a.error}</div>}
        {!apiDown && <button className="authbtn" onClick={a.login}>{label}</button>}
        {apiDown && <button className="authbtn" onClick={() => window.location.reload()}>Retry</button>}
      </div>
    </div>
  )
}
