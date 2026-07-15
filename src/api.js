// API client — live API (local or hosted), or pre-built snapshots on static Pages.
import { getAccessToken, logout } from './auth/oidc.js'

const STATIC = import.meta.env.VITE_STATIC === 'true'
const BASE = import.meta.env.BASE_URL
const API_ROOT = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const isStatic = STATIC

function apiUrl(path) {
  if (!path.startsWith('/')) path = `/${path}`
  return API_ROOT ? `${API_ROOT}${path}` : path
}

function snapshotName(path) {
  const [route, query = ''] = path.replace(/^\//, '').split('?')
  if (route === 'api/graph') {
    const name = new URLSearchParams(query).get('name') || 'default'
    return `graph-${name}`
  }
  if (route === 'api/auth/config') return 'auth-config'
  if (route === 'api/boards') return null // localStorage only in static mode
  return route.replace(/^api\//, '').replace(/\//g, '-')
}

export async function apiFetch(path, init) {
  if (STATIC) {
    const snap = snapshotName(path)
    if (!snap) return { ok: false, status: 501 }
    const r = await fetch(`${BASE}snapshots/${snap}.json`)
    if (!r.ok) throw new Error(`snapshot missing: ${snap}`)
    const data = await r.json()
    return { ok: true, status: 200, json: async () => data }
  }
  const token = getAccessToken()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const r = await fetch(apiUrl(path), { ...init, headers })
  if (r.status === 401 && token) {
    logout()
    window.dispatchEvent(new Event('meta-os.auth-expired'))
  }
  return {
    ok: r.ok,
    status: r.status,
    json: () => r.json(),
  }
}

export async function apiGet(path) {
  const r = await apiFetch(path)
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json()
}