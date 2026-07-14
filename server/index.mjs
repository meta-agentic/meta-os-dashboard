// meta-os dashboard API — reads a private instance vault from disk (read-only).
// Configure via instance.config.json (gitignored) or META_OS_CONFIG env var.
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as read from './readers.mjs'
import { graphSources, graphView } from './graph.mjs'
import { lint } from './lint.mjs'
import { usage } from './usage.mjs'
import * as files from './files.mjs'
import { reports } from './reports.mjs'

const configPath = process.env.META_OS_CONFIG ?? new URL('../instance.config.json', import.meta.url).pathname
let config
try {
  config = JSON.parse(await fs.readFile(configPath, 'utf8'))
} catch {
  console.error(`No config at ${configPath} — copy instance.config.example.json and point it at your instance.`)
  process.exit(1)
}

// Expand ${var} references (config.vars) across the whole config — so backlog paths and any
// other prefixes follow a single variable. Project paths in projects/*.md are expanded in registry().
config = read.expandVars(config, config.vars ?? {})

const instanceRoot = config.instanceRoot
// Framework root defaults to wherever the instance's systems/ symlink points.
const frameworkRoot =
  config.frameworkRoot ?? path.dirname(await fs.realpath(path.join(instanceRoot, 'systems')))

// File-preview roots — the only folders the browse/file endpoints may reach.
const fileRoots = { instance: instanceRoot, framework: frameworkRoot }

const app = express()
const api = (fn) => async (req, res) => res.json(await fn(req))
// like api(), but surfaces thrown status codes (403/404/…) instead of hanging.
const guard = (fn) => async (req, res) => {
  try { res.json(await fn(req)) } catch (e) { res.status(e.status ?? 500).json({ error: e.message }) }
}

app.get('/api/meta', api(async () => ({
  instance: path.basename(instanceRoot), instanceRoot, frameworkRoot, vars: config.vars ?? {},
  roots: Object.keys(fileRoots),
})))
app.get('/api/browse', guard((req) => files.browse(fileRoots, req.query.root || 'instance', req.query.path || '')))
app.get('/api/file', guard((req) => files.readFile(fileRoots, req.query.root || 'instance', req.query.path || '', req.query.mode)))
app.get('/api/ontology', api(() => read.ontology(frameworkRoot)))
app.get('/api/registry', api(() => read.registry(instanceRoot, config.vars ?? {})))
app.get('/api/automations', api(() => read.automations(instanceRoot)))
app.get('/api/memory', api(() => read.memory(instanceRoot)))
app.get('/api/activity', api(() => read.activity(instanceRoot)))
app.get('/api/lanes', api(() => read.lanes(config.backlogs)))
app.get('/api/report', api(() => reports(config.backlogs)))
app.get('/api/events', api(() => read.events(instanceRoot, config.backlogs)))
app.get('/api/outputs', api(() => read.outputs(instanceRoot)))
app.get('/api/usage', api(async () => {
  const reg = await read.registry(instanceRoot, config.vars ?? {})
  return usage(config.claudeHome, reg.projects ?? [])
}))
app.get('/api/lint', api(() => lint(instanceRoot, frameworkRoot)))
app.get('/api/graphs', api(async () => {
  const reg = await read.registry(instanceRoot, config.vars ?? {})
  return graphSources(instanceRoot, reg.projects ?? [])
}))
app.get('/api/graph', api(async (req) => {
  const { name, ...opts } = req.query
  const reg = await read.registry(instanceRoot, config.vars ?? {})
  const { sources } = await graphSources(instanceRoot, reg.projects ?? [])
  const src = sources.find((s) => s.name === name) ?? sources[0]
  if (!src) return { available: false, reason: 'no graphs found' }
  return { name: src.name, ...(await graphView(src.file, opts)) }
}))

// API_PORT, not PORT — dev harnesses set PORT for the web server and we must not collide.
const port = process.env.API_PORT ?? 3777
app.listen(port, () => console.log(`meta-os dashboard api → http://localhost:${port} (instance: ${instanceRoot})`))
