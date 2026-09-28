// Helpers shared by the usage widgets (Engine usage, Per-session spend, Cost ×
// Throughput), which all read the `usage` feed.

export const fmt = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n)
export const pct = (n) => `${Math.round(n * 100)}%`

export const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Output tokens per turn: the throughput axis of the scatter.
export const perTurn = (s) => (s.turns ? s.out / s.turns : 0)

// A chart needs at least two sessions to say anything; below that, say so.
export const tooFewSessions = (list) =>
  list.length > 1 ? null : `${list.length} session${list.length === 1 ? '' : 's'} in the window — need 2 or more to chart`
