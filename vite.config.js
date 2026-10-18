import { hostname } from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { computeSourceHash } from './scripts/source-hash.mjs'

// MOS-146: computed here (not read from an env var) so `vite build`/`vite preview` get a
// correct value even outside scripts/dev.mjs's launcher — the frontend's own "what backend
// do I expect" baked in at build time, the same way server/index.mjs computes its own copy
// at boot. See scripts/source-hash.mjs for why this is a content hash and not a version.
const expectedApiHash = await computeSourceHash()

// Listen on every interface by default, like the API (server/index.mjs binds 0.0.0.0), so
// the dashboard opens from another machine on the LAN or the tailnet and not only from
// localhost. VITE_HOST=localhost restores loopback-only.
const host = process.env.VITE_HOST || true

// Vite rejects a request whose Host header is a name it does not know (an IP always
// passes). Allow this machine's own name, short and qualified, and Tailscale MagicDNS
// names (`*.ts.net`, which also covers `tailscale serve`/`funnel`); VITE_ALLOWED_HOSTS
// adds more, comma-separated.
const machine = hostname()
const allowedHosts = [
  ...new Set([machine, machine.split('.')[0], '.ts.net']),
  ...(process.env.VITE_ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
]

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  // react-grid-layout / react-draggable read process.env.NODE_ENV at runtime; the
  // dev server doesn't define `process` in the browser, so without this the drag
  // handlers throw "process is not defined" and dragging silently fails (build is
  // unaffected — esbuild inlines it). Define it for dev too.
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    global: 'globalThis',
    'import.meta.env.VITE_EXPECTED_API_HASH': JSON.stringify(expectedApiHash),
  },
  server: {
    host,
    allowedHosts,
    port: Number(process.env.PORT || 5173),
    proxy: { '/api': process.env.VITE_API_PROXY || 'http://localhost:3777' },
  },
  // `vite preview` (the built bundle) takes the same reachability; its proxy defaults to
  // server.proxy.
  preview: { host, allowedHosts },
}))
