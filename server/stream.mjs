// Live telemetry: an SSE stream of new timeline events, so clients see appends to
// automations/events.jsonl and automations/runs.jsonl without re-polling /api/events.
// The stream carries only deltas — the client's initial /api/events poll is the base
// state, and the connection is seeded with it so a change never re-emits history.
// A dropped stream is transparent: the client keeps polling, so the feed is never blank.
import fs from 'node:fs'
import path from 'node:path'
import * as read from './readers.mjs'

// De-dupe / Last-Event-ID key: identity of a normalized event across reconnects.
// Field values come from events.jsonl (a boundary), so strip CR/LF — an embedded
// newline in the key would break the SSE `id:` frame it is written into.
const keyOf = (e) => `${e.ts}|${e.actor}|${e.action}|${e.target}`.replace(/[\r\n]+/g, ' ')

export function createStream(instanceRoot, backlogs) {
  const watchDir = path.join(instanceRoot, 'automations')
  const watched = new Set(['events.jsonl', 'runs.jsonl'])

  return (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // don't let a reverse proxy buffer the stream
    })
    res.write('retry: 3000\n\n') // client reconnect backoff

    // Everything in `sent` has already reached this client — either from the initial
    // seed (current file state, which the client also has via its /api/events poll) or
    // from a Last-Event-ID carried across a reconnect. Only unseen keys are emitted.
    const sent = new Set()
    const lastId = req.headers['last-event-id']
    if (lastId) sent.add(lastId)
    let seeded = false

    const flush = async (emit) => {
      let snapshot
      try {
        snapshot = await read.events(instanceRoot, backlogs)
      } catch {
        return false // a transient read error means no delta this tick; client still polls
      }
      // events[] is newest-first; replay oldest-first so ids arrive in timeline order.
      for (const e of [...(snapshot.events ?? [])].reverse()) {
        const id = keyOf(e)
        if (sent.has(id)) continue
        sent.add(id)
        if (emit) res.write(`id: ${id}\ndata: ${JSON.stringify(e)}\n\n`)
      }
      return true
    }

    // Seed the baseline without emitting, then arm delta emission. If the seed read
    // fails, stay unseeded so the next change retries the baseline rather than
    // replaying the whole snapshot as if it were new.
    flush(false).then((ok) => { seeded = ok })

    let debounce = null
    const onChange = (_evt, filename) => {
      if (filename && !watched.has(filename)) return
      clearTimeout(debounce)
      // Once seeded, emit deltas; if the initial seed failed, retry it (without
      // emitting) so a change self-heals the baseline instead of dumping history.
      debounce = setTimeout(async () => { seeded = await flush(seeded) || seeded }, 200)
    }
    let watcher
    try {
      watcher = fs.watch(watchDir, onChange)
    } catch { /* no automations/ dir yet — nothing to watch; the client's polling covers it */ }

    const heartbeat = setInterval(() => res.write(':keep-alive\n\n'), 25000)

    req.on('close', () => {
      clearInterval(heartbeat)
      clearTimeout(debounce)
      watcher?.close()
      res.end()
    })
  }
}
