import React from 'react'
import { useAuth } from './AuthProvider.jsx'

// Gate the app when auth is enabled. Disabled or authed ⇒ render the dashboard.
export default function LoginGate({ children }) {
  const a = useAuth()

  if (a.status === 'loading') return <div className="authscreen"><div className="dim">connecting…</div></div>
  if (a.status === 'authed') return children
  if (a.status === 'disabled') return children

  const label = a.config?.loginLabel ?? 'Sign in'
  const hint = a.config?.loginHint ?? 'Sign in to access this instance dashboard.'

  return (
    <div className="authscreen">
      <div className="authcard">
        <div className="authmark">meta-os</div>
        <h1 className="authtitle">Sign in to observe the mission</h1>
        <p className="dim">{hint}</p>
        {a.status === 'error' && <div className="degraded">Sign-in error: {a.error}</div>}
        <button className="authbtn" onClick={a.login}>{label}</button>
      </div>
    </div>
  )
}
