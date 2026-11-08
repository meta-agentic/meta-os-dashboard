// Component-test harness: bundles a .jsx widget with esbuild (React included, so there is
// one copy), stubs the API client, and mounts it in jsdom. No test framework needed.
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function loadWidgets(files) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  window.HTMLElement.prototype.scrollIntoView = function () { globalThis.__scrolled?.push(this) }
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 300, configurable: true })
  globalThis.__api = async () => ({})
  const entry = [
    "export { default as React } from 'react'",
    "export { createRoot } from 'react-dom/client'",
    "export { act } from 'react-dom/test-utils'",
    ...files.map((f, i) => `export { default as W${i} } from ${JSON.stringify(path.join(root, f))}`),
  ].join('\n')
  const out = await build({
    stdin: { contents: entry, resolveDir: root, loader: 'js' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    define: { 'import.meta.env.VITE_STATIC': '"false"', 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.VITE_API_URL': '""' },
    loader: { '.jsx': 'jsx' },
    plugins: [{
      name: 'stub-api',
      setup(b) {
        b.onResolve({ filter: /\/api\.js$/ }, () => ({ path: 'api-stub', namespace: 'stub' }))
        b.onResolve({ filter: /^markdown-to-jsx$/ }, () => ({ path: 'md-stub', namespace: 'stub' }))
        b.onLoad({ filter: /^api-stub$/, namespace: 'stub' }, () => ({
          contents: 'export const apiGet = (p) => globalThis.__api(p); export const isStatic = false',
          loader: 'js',
        }))
        b.onLoad({ filter: /^md-stub$/, namespace: 'stub' }, () => ({
          contents: 'export default ({ children }) => children', loader: 'js',
        }))
      },
    }],
  })
  const code = out.outputFiles[0].text
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wi-test-')), 'bundle.mjs')
  fs.writeFileSync(file, code)
  // React's scheduler would hold a ref'd MessagePort open and the run would never exit.
  globalThis.MessageChannel = class {
    constructor() {
      const ch = this
      this.port1 = { onmessage: null }
      this.port2 = { postMessage: () => setImmediate(() => ch.port1.onmessage?.({})) }
    }
  }
  const mod = await import(pathToFileURL(file).href)
  return { ...mod, close: () => window.close() }
}
