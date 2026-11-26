import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimAge, claimState, cmpClaim } from './claim.js'

// The rule is the backlog tool's own `expired`: expired once the expiry is at or before now;
// an expiry that cannot be read keeps the claim live (fail closed).
const NOW = Date.parse('2026-11-26T12:00:00Z')
const claim = (expires, at = '2026-11-26T10:00:00Z') => ({ by: 'lane-a', at, expires })

const STATES = [
  ['no claim', null, null],
  ['a claim with no holder', { by: null, at: null, expires: '2026-11-27T00:00:00Z' }, null],
  ['expiry in the future', claim('2026-11-26T12:00:01Z'), 'live'],
  ['expiry exactly now', claim('2026-11-26T12:00:00Z'), 'expired'],
  ['expiry in the past', claim('2026-11-26T11:59:59Z'), 'expired'],
  ['no expiry recorded', claim(null), 'live'],
  ['an unreadable expiry', claim('soon'), 'live'],
]
for (const [name, c, want] of STATES) {
  test(`claimState: ${name} → ${want}`, () => assert.equal(claimState(c, NOW), want))
}

const AGES = [
  ['taken just now', '2026-11-26T12:00:00Z', '0m'],
  ['taken 59 minutes ago', '2026-11-26T11:01:00Z', '59m'],
  ['taken an hour ago', '2026-11-26T11:00:00Z', '1h'],
  ['taken 47 hours ago', '2026-11-24T13:00:00Z', '47h'],
  ['taken two days ago', '2026-11-24T12:00:00Z', '2d'],
  ['a stamp in the future (clock skew)', '2026-11-26T12:05:00Z', '0m'],
  ['an unreadable stamp', 'yesterday', null],
  ['no stamp', null, null],
]
for (const [name, at, want] of AGES) {
  test(`claimAge: ${name} → ${want}`, () => assert.equal(claimAge(claim('2026-11-27T00:00:00Z', at), NOW), want))
}

test('the state and age tables cover every case the chip renders', () => {
  assert.deepEqual([...new Set(STATES.map((s) => s[2]))].sort(), ['expired', 'live', null].sort())
})

test('cmpClaim: live claims first, then expired, then unclaimed', () => {
  const rows = [
    { id: 'none', claim: null },
    { id: 'expired', claim: claim('2000-01-01T00:00:00Z') },
    { id: 'live', claim: claim('2999-01-01T00:00:00Z') },
  ]
  assert.deepEqual([...rows].sort(cmpClaim).map((r) => r.id), ['live', 'expired', 'none'])
})
