import React, { createContext, useContext, useEffect, useState } from 'react'
import { beginLogin, completeLogin, currentSession, logout } from './oidc.js'

// status: loading | disabled (auth off ⇒ open) | anon (must sign in) | authed | error
const AuthCtx = createContext({ status: 'disabled', user: null, config: null, login: () => {}, logout: () => {} })
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, config: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let cfg = { enabled: false }
      try { cfg = await (await fetch('/api/auth/config')).json() } catch { /* open on failure */ }
      if (cancelled) return
      if (!cfg?.enabled) return setState({ status: 'disabled', user: null, config: cfg })
      try {
        const done = await completeLogin(cfg) // consumes a ?code redirect if present
        if (cancelled) return
        if (done) return setState({ status: 'authed', user: done.user, config: cfg })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: String(e.message || e), config: cfg })
        return
      }
      const s = currentSession()
      setState(s ? { status: 'authed', user: s.user, config: cfg } : { status: 'anon', user: null, config: cfg })
    })()
    return () => { cancelled = true }
  }, [])

  const value = {
    ...state,
    login: () => state.config && beginLogin(state.config).catch((e) => setState((s) => ({ ...s, status: 'error', error: String(e.message || e) }))),
    logout: () => { logout(); setState((s) => ({ ...s, status: 'anon', user: null })) },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
