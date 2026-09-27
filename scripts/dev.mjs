#!/usr/bin/env node
// MOS-146: `npm run dev`'s launcher. Vite already relocates itself when its port is
// taken (5173 -> 5174 -> ...); the API side used to just crash with EADDRINUSE instead.
// This picks one of three outcomes, in order:
//   1. Something answering /api/version on the default port, with a matching sourceHash
//      -> reuse it. Don't spawn a second API process for no reason.
//   2. Something answering /api/version, but its sourceHash is stale (server/ has
//      changed since it started) -> leave it running, start a fresh one on a free port.
//   3. Nothing meta-os-shaped there (free, or some unrelated process) -> use the default
//      port if it's actually free, otherwise the same relocate-to-a-free-port path as 2.
// Either way, Vite's proxy is pointed at whichever port ends up serving.
import { concurrently } from 'concurrently'
import { createServer } from 'node:net'
import { computeSourceHash } from './source-hash.mjs'

const DEFAULT_API_PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3777)
const PROBE_TIMEOUT_MS = 1500

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '0.0.0.0')
  })
}

async function findFreePort(start) {
  let port = start
  // eslint-disable-next-line no-await-in-loop -- inherently sequential: each probe depends
  // on the last one having failed.
  while (!(await isPortFree(port))) port += 1
  return port
}

async function probeExisting(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!res.ok) return { alive: false }
    return { alive: true, data: await res.json() }
  } catch {
    return { alive: false }
  }
}

const expectedHash = await computeSourceHash()
const probe = await probeExisting(DEFAULT_API_PORT)

let apiPort = DEFAULT_API_PORT
let spawnApi = true

if (probe.alive && probe.data.sourceHash === expectedHash) {
  spawnApi = false
  console.log(`[dev] reusing the API already running on :${apiPort} — sourceHash ${probe.data.sourceHash} is current`)
} else if (probe.alive) {
  apiPort = await findFreePort(DEFAULT_API_PORT + 1)
  console.log(
    `[dev] API on :${DEFAULT_API_PORT} is stale (${probe.data.sourceHash} != expected ${expectedHash}) — ` +
    `leaving it running, starting a fresh one on :${apiPort}`,
  )
} else if (!(await isPortFree(DEFAULT_API_PORT))) {
  apiPort = await findFreePort(DEFAULT_API_PORT + 1)
  console.log(`[dev] :${DEFAULT_API_PORT} is taken by something that isn't this API — using :${apiPort} instead`)
}

const commands = [
  { command: 'vite', name: 'web', prefixColor: 'magenta', env: { VITE_API_PROXY: `http://localhost:${apiPort}` } },
]
if (spawnApi) {
  commands.unshift({
    command: 'node server/index.mjs',
    name: 'api',
    prefixColor: 'blue',
    env: { API_PORT: String(apiPort) },
  })
}

const { result } = concurrently(commands, { killOthersOn: ['failure'] })
result.catch(() => process.exit(1))
