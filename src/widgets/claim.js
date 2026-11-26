// A work item's claim as the vault records it (`backlog.py claim`) and as
// /api/items hands it over: { by, at, expires } or null. Same rule as the backlog tool's own `expired`:
// a claim is expired once its expiry is at or before now, and an expiry that cannot be
// read keeps it live (fail closed: nobody takes work from a claim they cannot date).
// Judged here, against the viewer's clock, so a claim running out while the table is open
// turns expired on the next render without a reload.

const MIN = 60_000

export function claimState(claim, now = Date.now()) {
  if (!claim?.by) return null
  const exp = claim.expires == null ? NaN : Date.parse(claim.expires)
  return !Number.isNaN(exp) && exp <= now ? 'expired' : 'live'
}

// "12m", "3h", "2d": how long ago the claim was taken. Null when the stamp is unreadable.
export function claimAge(claim, now = Date.now()) {
  const at = claim?.at == null ? NaN : Date.parse(claim.at)
  if (Number.isNaN(at)) return null
  const m = Math.max(0, Math.floor((now - at) / MIN))
  if (m < 60) return `${m}m`
  if (m < 48 * 60) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / (24 * 60))}d`
}

// Live claims first, then expired, then unclaimed; by holder name inside each.
export function cmpClaim(a, b) {
  const rank = (r) => ({ live: 0, expired: 1 })[claimState(r.claim)] ?? 2
  return rank(a) - rank(b) || String(a.claim?.by ?? '').localeCompare(String(b.claim?.by ?? ''))
}
