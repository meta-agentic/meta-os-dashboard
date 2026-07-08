// Minimal cron matcher for the automations `cadence` column — the ontology contract
// says cadence is a 5-field cron expression or a nickname (@daily), "—" for
// event-driven. Times are evaluated in the server's local timezone, same clock the
// schedulers (cron/launchd) run on. Scanning minute-by-minute keeps the matcher
// trivially correct; a 48h horizon is only 2880 tests per row.

const NICKNAMES = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

// One field: "*", "n", "a-b", lists, with optional "/step". Returns a Set or null.
function field(spec, min, max) {
  const set = new Set()
  for (const part of spec.split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/)
    if (!m) return null
    const step = m[2] ? Number(m[2]) : 1
    if (step < 1) return null
    let lo = min
    let hi = max
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-').map(Number)
      lo = a
      hi = b ?? (m[2] ? max : a) // "5/2" means "5-max/2" per Vixie cron
    }
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) set.add(v)
  }
  return set
}

export function parseCron(expr) {
  const spec = NICKNAMES[expr] ?? expr
  const parts = spec.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour, dom, mon, dow] = parts
  const f = {
    min: field(min, 0, 59),
    hour: field(hour, 0, 23),
    dom: field(dom, 1, 31),
    mon: field(mon, 1, 12),
    dow: field(dow, 0, 7),
    // Standard cron rule: when BOTH day-of-month and day-of-week are restricted,
    // a date matches if EITHER does; otherwise the restricted one decides.
    domAny: dom === '*',
    dowAny: dow === '*',
  }
  if (!f.min || !f.hour || !f.dom || !f.mon || !f.dow) return null
  if (f.dow.has(7)) f.dow.add(0) // both 0 and 7 are Sunday
  return f
}

// Occurrences of `expr` within (from, from + horizonMs], as ISO strings.
// Returns null when the expression isn't cron/nickname — caller degrades visibly.
export function nextRuns(expr, from = new Date(), horizonMs = 48 * 3600e3, cap = 100) {
  const f = parseCron(expr)
  if (!f) return null
  const out = []
  const end = from.getTime() + horizonMs
  const t = new Date(from)
  t.setSeconds(0, 0)
  t.setMinutes(t.getMinutes() + 1)
  for (; t.getTime() <= end && out.length < cap; t.setMinutes(t.getMinutes() + 1)) {
    if (!f.min.has(t.getMinutes()) || !f.hour.has(t.getHours()) || !f.mon.has(t.getMonth() + 1)) continue
    const domOk = f.dom.has(t.getDate())
    const dowOk = f.dow.has(t.getDay())
    const dateOk =
      f.domAny && f.dowAny ? true : f.domAny ? dowOk : f.dowAny ? domOk : domOk || dowOk
    if (dateOk) out.push(t.toISOString())
  }
  return out
}
