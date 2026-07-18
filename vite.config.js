import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  },
  server: {
    port: Number(process.env.PORT || 5173),
    proxy: { '/api': process.env.VITE_API_PROXY || 'http://localhost:3777' },
  },
}))
