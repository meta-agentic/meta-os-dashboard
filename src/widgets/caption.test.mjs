import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionOf } from './caption.js'

test('captionOf keeps what a title adds after its first separator', () => {
  assert.equal(captionOf('Outputs — deliverables inbox'), 'deliverables inbox')
  assert.equal(captionOf('Sprint Stats — committed · scope added · delivered'), 'committed · scope added · delivered')
  assert.equal(captionOf('Cost × Throughput · Size = Turns'), 'Size = Turns')
})

test('captionOf drops a title that is only the name', () => {
  assert.equal(captionOf('Burndown'), null)
  assert.equal(captionOf('Per-session spend'), null)
  assert.equal(captionOf(undefined), null)
})
