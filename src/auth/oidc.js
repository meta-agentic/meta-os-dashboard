// OIDC Authorization Code + PKCE for a public SPA. Works with Google, Tessera, or any
// compliant provider. Google access tokens are opaque — we send the JWT id_token to the API.
const SESSION_KEY = 'oidc.session'
const PENDING_KEY = 'oidc.pending'

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const rand = (n = 48) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return b64url(a.buffer)
}
const sha256 = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))

// Must match Google Console "Authorized redirect URIs" exactly (slash included).
function resolveRedirectUri(cfg) {
  if (cfg.redirectUri) return cfg.redirectUri
  const base = import.meta.env.BASE_URL || '/'
  const path = base.startsWith('/') ? base : `/${base}`
  const normalized = path.endsWith('/') ? path : `${path}/`
  return `${window.location.origin}${normalized}`
}

async function endpoints(cfg) {
  if (cfg.authorizeUrl && cfg.tokenUrl) return { authorize: cfg.authorizeUrl, token: cfg.tokenUrl, userinfo: cfg.userinfoUrl }
  const r = await fetch(cfg.issuer.replace(/\/$/, '') + '/.well-known/openid-configuration')
  if (!r.ok) throw new Error('OIDC discovery failed')
  const d = await r.json()
  return { authorize: d.authorization_endpoint, token: d.token_endpoint, userinfo: d.userinfo_endpoint }
}

export async function beginLogin(cfg) {
  const ep = await endpoints(cfg)
  const verifier = rand()
  const challenge = b64url(await sha256(verifier))
  const state = rand(16)
  const redirectUri = resolveRedirectUri(cfg)
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, redirectUri }))
  const u = new URL(ep.authorize)
  for (const [k, v] of Object.entries({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: cfg.scope || 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })) u.searchParams.set(k, v)
  window.location.assign(u.toString())
}

// Handle the ?code=…&state=… redirect back from the provider. Returns the session
// (and cleans the URL) on success, null when there's no code to process.
export async function completeLogin(cfg) {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return null
  const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null')
  if (!saved || saved.state !== params.get('state')) throw new Error('OIDC state mismatch')
  const ep = await endpoints(cfg)
  const tr = await fetch(ep.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: saved.redirectUri,
      client_id: cfg.clientId,
      code_verifier: saved.verifier,
    }),
  })
  if (!tr.ok) {
    const raw = await tr.text()
    let detail = raw
    try {
      const err = JSON.parse(raw)
      detail = err.error_description || err.error || raw
    } catch { /* use raw */ }
    throw new Error(`token exchange failed: ${detail || tr.status}`)
  }
  const tok = await tr.json()
  let user = {}
  if (tok.id_token) {
    try { user = parseJwt(tok.id_token) } catch { /* fall through */ }
  }
  if (ep.userinfo && tok.access_token && !user.email) {
    const ur = await fetch(ep.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}` } })
    if (ur.ok) user = { ...user, ...(await ur.json()) }
  }
  sessionStorage.removeItem(PENDING_KEY)
  window.history.replaceState({}, '', saved.redirectUri)
  const expMs = tok.id_token
    ? (parseJwt(tok.id_token).exp ?? 0) * 1000
    : Date.now() + (tok.expires_in ? tok.expires_in * 1000 : 3600e3)
  const session = {
    user,
    idToken: tok.id_token ?? null,
    accessToken: tok.access_token ?? null,
    expiresAt: expMs || Date.now() + 3600e3,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

function parseJwt(jwt) {
  const body = jwt.split('.')[1]
  return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
}

export function currentSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    if (s && s.expiresAt > Date.now()) return s
  } catch { /* ignore */ }
  return null
}

// API Bearer token — id_token for Google (JWT); access_token for providers that issue JWT access tokens.
export function getAccessToken() {
  const s = currentSession()
  if (!s) return null
  return s.idToken ?? s.accessToken ?? null
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}
