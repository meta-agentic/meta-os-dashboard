// Derives the first-run onboarding state from live feed data. Every backend
// reader degrades to { available: false, reason } (server/readers.mjs) — both at
// the feed level and per sub-source (sources[]/spaces[]). We aggregate those REAL
// signals into actionable setup steps; nothing here is a hardcoded checklist, so
// the surface tracks whatever the instance is actually missing right now.

// Feed → the config field a reader complains about, used only to order/label
// steps. Absence from this map is fine; such reasons still surface verbatim.
const FEED_LABELS = {
  meta: 'Instance',
  lanes: 'Sprint backlogs',
  report: 'Scrum report',
  events: 'Activity',
  usage: 'Engine usage',
  ontology: 'Knowledge graph',
  memory: 'Memory',
  registry: 'Registry',
  automations: 'Automations',
  lint: 'Lint',
  outputs: 'Outputs',
}

// Sub-source arrays a feed may carry, each element being its own {available,reason}.
const SOURCE_KEYS = ['sources', 'spaces']

function pushIssue(issues, feed, source, reason) {
  if (!reason) return
  issues.push({ feed, source: source || null, reason: String(reason) })
}

// Walk one feed's payload, collecting every available:false it exposes.
function collectFeed(issues, feed, payload) {
  if (!payload || typeof payload !== 'object') return
  if (payload.available === false) pushIssue(issues, feed, null, payload.reason)
  for (const key of SOURCE_KEYS) {
    const arr = payload[key]
    if (!Array.isArray(arr)) continue
    for (const entry of arr) {
      if (entry && entry.available === false) {
        pushIssue(issues, feed, entry.name || entry.space || entry.source, entry.reason)
      }
    }
  }
}

// data: { feed → payload }, as assembled in App.refresh(). Returns the live
// onboarding model. `fresh` means "looks like an unconfigured instance" — the
// majority of feeds that report availability are unavailable — which is the
// trigger for the full first-run surface rather than a passive banner.
export function deriveOnboarding(data) {
  const issues = []
  const feedsWithAvail = []
  const unavailableFeeds = []
  for (const [feed, payload] of Object.entries(data || {})) {
    if (payload && typeof payload.available === 'boolean') {
      feedsWithAvail.push(feed)
      if (payload.available === false) unavailableFeeds.push(feed)
    }
    collectFeed(issues, feed, payload)
  }

  // One step per distinct reason; a reason emitted by several feeds/sources is
  // merged so the user sees one actionable line, not duplicates.
  const byReason = new Map()
  for (const it of issues) {
    const key = it.reason.trim().toLowerCase()
    if (!byReason.has(key)) {
      byReason.set(key, { reason: it.reason, feeds: new Set(), sources: new Set() })
    }
    const step = byReason.get(key)
    step.feeds.add(FEED_LABELS[it.feed] || it.feed)
    if (it.source) step.sources.add(it.source)
  }
  const steps = [...byReason.values()].map((s) => ({
    reason: s.reason,
    feeds: [...s.feeds],
    sources: [...s.sources],
  }))

  const fresh =
    unavailableFeeds.length > 0 &&
    unavailableFeeds.length >= Math.ceil(feedsWithAvail.length / 2)

  return {
    steps,
    fresh,
    missingCount: steps.length,
    checkedFeeds: feedsWithAvail.length,
    unavailableFeeds: unavailableFeeds.length,
    complete: feedsWithAvail.length > 0 && unavailableFeeds.length === 0 && steps.length === 0,
  }
}

// The bootstrap conversation (AC4) handed to the MOS-7 prompt console as an
// EDITABLE prompt — the user reviews/edits before sending, not fire-and-forget.
// Uses only non-secret context already visible in the header.
export function buildBootstrapPrompt(meta) {
  const instance = meta?.instance || 'my-instance'
  const root = meta?.instanceRoot || '<instance root>'
  return [
    `Help me bootstrap this meta-os instance ("${instance}", rooted at ${root}).`,
    'Walk me through, and edit this prompt before sending if anything is off:',
    '',
    '1. Instance name — confirm or change the display name for this instance.',
    '2. Backlog model — how should sprints/backlogs be structured, and which',
    '   spaces should I configure under "backlogs" in instance.config.json?',
    '3. Pack selection — which capability packs / systems should this instance load?',
    '4. First project — scaffold an initial project so the dashboard has data.',
    '',
    'Ask me one question at a time and update instance.config.json as we go.',
  ].join('\n')
}
