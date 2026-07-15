// Server-side OIDC JWT verification (JWKS). Google ⇒ verify id_token; Tessera/Keycloak ⇒ access or id JWT.
import * as jose from 'jose'

const cache = new Map()

function normIssuer(issuer) {
  return issuer.replace(/\/$/, '')
}

function issuerCandidates(cfg) {
  const base = normIssuer(cfg.issuer)
  const extra = (cfg.issuers ?? []).map(normIssuer)
  const set = new Set([base, `${base}/`, ...extra, 'https://accounts.google.com', 'accounts.google.com'].filter(Boolean))
  return [...set]
}

async function jwksFor(cfg) {
  const issuer = normIssuer(cfg.issuer)
  if (!issuer) throw new Error('auth.issuer is required when auth.enforce is true')
  const cacheKey = cfg.jwksUri ?? issuer
  const hit = cache.get(cacheKey)
  if (hit) return hit

  let jwksUri = cfg.jwksUri
  if (!jwksUri) {
    const discUrl = cfg.discoveryUrl ?? `${issuer}/.well-known/openid-configuration`
    const r = await fetch(discUrl, { headers: { 'User-Agent': 'meta-os-dashboard' } })
    if (!r.ok) throw new Error(`OIDC discovery failed (${r.status})`)
    const doc = await r.json()
    jwksUri = doc.jwks_uri
  }
  if (!jwksUri) throw new Error('OIDC JWKS URI not configured')
  const jwks = jose.createRemoteJWKSet(new URL(jwksUri))
  const entry = { jwks, issuers: issuerCandidates(cfg) }
  cache.set(cacheKey, entry)
  return entry
}

function audienceOk(payload, cfg) {
  const expected = cfg.audience ?? cfg.clientId
  if (!expected) return true
  const aud = payload.aud
  if (Array.isArray(aud) ? aud.includes(expected) : aud === expected) return true
  return payload.azp === expected
}

function identityAllowed(payload, cfg) {
  const email = String(payload.email ?? '').toLowerCase()
  const allowedEmails = (cfg.allowedEmails ?? []).map((e) => e.toLowerCase())
  if (allowedEmails.length && !allowedEmails.includes(email)) {
    const e = new Error('signed-in account is not on the allow-list')
    e.status = 403
    throw e
  }
  const allowedDomains = (cfg.allowedDomains ?? []).map((d) => d.toLowerCase())
  if (allowedDomains.length) {
    const domain = email.split('@')[1] ?? ''
    if (!allowedDomains.includes(domain)) {
      const e = new Error('signed-in email domain is not allowed')
      e.status = 403
      throw e
    }
  }
}

export async function verifyAccessToken(token, cfg) {
  const { jwks, issuers } = await jwksFor(cfg)
  const opts = { clockTolerance: 30 }
  let payload
  let lastErr
  for (const iss of issuers) {
    try {
      ;({ payload } = await jose.jwtVerify(token, jwks, { ...opts, issuer: iss }))
      lastErr = null
      break
    } catch (e) {
      lastErr = e
    }
  }
  if (!payload) {
    const e = new Error('invalid or expired token')
    e.status = 401
    e.cause = lastErr
    throw e
  }
  if (!audienceOk(payload, cfg)) {
    const e = new Error('token audience mismatch')
    e.status = 401
    throw e
  }
  identityAllowed(payload, cfg)
  return payload
}

export function createAuthMiddleware(config) {
  return async (req, res, next) => {
    if (!config.auth?.enforce) return next()
    if (req.path === '/api/health' || req.path === '/api/auth/config') return next()

    const hdr = req.headers.authorization ?? ''
    const m = hdr.match(/^Bearer\s+(\S+)/i)
    if (!m) return res.status(401).json({ error: 'missing Bearer token — sign in first' })

    try {
      req.user = await verifyAccessToken(m[1], config.auth)
      next()
    } catch (e) {
      res.status(e.status ?? 401).json({ error: e.message || 'invalid or expired token' })
    }
  }
}