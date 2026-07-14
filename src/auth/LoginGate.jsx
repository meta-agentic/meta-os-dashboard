import React from 'react'
import { useAuth } from './AuthProvider.jsx'

// Gate the app when auth is enabled. Disabled or authed ⇒ render the dashboard.
export default function LoginGate({ children }) {
  const a = useAuth()

  if (a.status === 'loading') return <div className="authscreen"><div className="dim">connecting…</div></div>
  if (a.status === 'disabled' || a.status === 'authed') return children

  return (
    <div className="authscreen">
      <div className="authcard">
        <div className="authmark">meta-os</div>
        <h1 className="authtitle">Sign in to observe the mission</h1>
        <p className="dim">Authenticate against your <strong>Tessera IAM</strong> server to access this instance.</p>
        {a.status === 'error' && <div className="degraded">Sign-in error: {a.error}</div>}
        <button className="authbtn" onClick={a.login}>Sign in with Tessera</button>
      </div>
    </div>
  )
}
