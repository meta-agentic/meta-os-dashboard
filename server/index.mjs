// meta-os dashboard API — reads instance data from disk or GitHub (read-only).
// Configure via instance.config.json (local) or github.config.json (deployed API).
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as read from './readers.mjs'
import { graphSources, graphView } from './graph.mjs'
import { lint } from './lint.mjs'
import { usage } from './usage.mjs'
import * as files from './files.mjs'
import * as boards from './boards.mjs'
import { reports } from './reports.mjs'
import { createGithubContext } from './github.mjs'
import * as gh from './github-readers.mjs'
import * as ghGraph from './github-graph.mjs'
import * as ghFiles from './github-files.mjs'
import { createAuthMiddleware } from './auth.mjs'
import { createStream } from './stream.mjs'

const defaultConfig = new URL('../instance.config.json', import.meta.url).pathname
const configPath = process.env.META_OS_CONFIG ?? defaultConfig
let config
try {
  if (process.env.META_OS_CONFIG_JSON) {
    config = JSON.parse(process.env.META_OS_CONFIG_JSON)
  } else {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  }
} catch (e) {
  console.error(
    process.env.META_OS_CONFIG_JSON
      ? `Config load failed (META_OS_CONFIG_JSON): ${e.message}`
      : `Config load failed — set Fly secret META_OS_CONFIG_JSON (or META_OS_CONFIG file path). Tried: ${configPath}`,
  )
  process.exit(1)
}

const isGithub = config.source === 'github'
let ghCtx = null
let instanceRoot, frameworkRoot, fileRoots, dataDir

if (isGithub) {
  ghCtx = createGithubContext(config)
  instanceRoot = `github:${ghCtx.instance.label()}`
  frameworkRoot = `github:${ghCtx.framework.label()}`
  fileRoots = null
} else {
  config = read.expandVars(config, config.vars ?? {})
  instanceRoot = config.instanceRoot
  frameworkRoot =
    config.frameworkRoot ?? path.dirname(await fs.realpath(path.join(instanceRoot, 'systems')))
  fileRoots = { instance: instanceRoot, framework: frameworkRoot }
}

dataDir = config.dataDir ?? new URL('../.data', import.meta.url).pathname

const app = express()
app.use(express.json({ limit: '4mb' }))

// CORS for GitHub Pages frontend → hosted API (token stays server-side).
const corsOrigins = (process.env.CORS_ORIGINS ?? config.corsOrigins ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
if (corsOrigins.length) {
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
}

const api = (fn) => async (req, res) => res.json(await fn(req))
const guard = (fn) => async (req, res) => {
  try { res.json(await fn(req)) } catch (e) { res.status(e.status ?? 500).json({ error: e.message }) }
}

app.get('/api/auth/config', api(async () => {
  const auth = config.auth ?? { enabled: false }
  return { enabled: false, enforce: false, ...auth }
}))

app.use(createAuthMiddleware(config))

app.get('/api/health', api(async () => ({
  ok: true,
  source: isGithub ? 'github' : 'local',
  instance: isGithub ? ghCtx.instance.label() : path.basename(instanceRoot),
})))

if (isGithub) {
  app.get('/api/meta', api(() => gh.meta(ghCtx)))
  app.get('/api/browse', guard((req) => ghFiles.browse(ghCtx, req.query.root || 'instance', req.query.path || '')))
  app.get('/api/file', guard((req) => ghFiles.readFile(ghCtx, req.query.root || 'instance', req.query.path || '')))
  app.get('/api/reveal', guard(() => ghFiles.reveal()))
  app.get('/api/ontology', api(() => gh.ontology(ghCtx)))
  app.get('/api/registry', api(() => gh.registry(ghCtx, config.vars ?? {})))
  app.get('/api/automations', api(() => gh.automations(ghCtx)))
  app.get('/api/memory', api(() => gh.memory(ghCtx)))
  app.get('/api/activity', api(() => gh.activity(ghCtx)))
  app.get('/api/lanes', api(() => gh.lanes(ghCtx)))
  app.get('/api/report', api(() => gh.reports(ghCtx)))
  app.get('/api/events', api(() => gh.events(ghCtx)))
  app.get('/api/outputs', api(() => gh.outputs(ghCtx)))
  app.get('/api/usage', api(() => gh.usage()))
  app.get('/api/lint', api(() => gh.lint(ghCtx)))
  app.get('/api/graphs', api(() => ghGraph.graphSources(ghCtx)))
  app.get('/api/graph', api(async (req) => {
    const { name, ...opts } = req.query
    const view = await ghGraph.graphView(ghCtx, name, opts)
    return { name: name || ghCtx.instance.repo, ...view }
  }))
} else {
  app.get('/api/meta', api(async () => ({
    instance: path.basename(instanceRoot), instanceRoot, frameworkRoot, vars: config.vars ?? {},
    roots: Object.keys(fileRoots), source: 'local',
  })))
  app.get('/api/browse', guard((req) => files.browse(fileRoots, req.query.root || 'instance', req.query.path || '')))
  app.get('/api/file', guard((req) => files.readFile(fileRoots, req.query.root || 'instance', req.query.path || '', req.query.mode)))
  app.get('/api/reveal', guard((req) => files.reveal(fileRoots, req.query.root || 'instance', req.query.path || '')))
  app.get('/api/ontology', api(() => read.ontology(frameworkRoot)))
  app.get('/api/registry', api(() => read.registry(instanceRoot, config.vars ?? {})))
  app.get('/api/automations', api(() => read.automations(instanceRoot)))
  app.get('/api/memory', api(() => read.memory(instanceRoot)))
  app.get('/api/activity', api(() => read.activity(instanceRoot)))
  app.get('/api/lanes', api(() => read.lanes(config.backlogs)))
  app.get('/api/report', api(() => reports(config.backlogs)))
  app.get('/api/events', api(() => read.events(instanceRoot, config.backlogs)))
  // Live delta stream over the same normalized timeline (local source only — SSE relies
  // on fs.watch, which has no remote-GitHub equivalent). Guarded by the auth middleware
  // above, same as every other /api/* read. Not wrapped in api()/guard(): it owns res.
  app.get('/api/stream', createStream(instanceRoot, config.backlogs))
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
}

app.get('/api/boards', guard((req) => boards.loadBoards(dataDir, req.query.user).then((doc) => ({ doc }))))
app.put('/api/boards', guard((req) => boards.saveBoards(dataDir, req.query.user, req.body)))

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3777)
const host = process.env.API_HOST ?? '0.0.0.0'
app.listen(port, host, () => {
  console.log(`meta-os dashboard api → http://${host}:${port} (${isGithub ? `github: ${ghCtx.instance.label()} + ${ghCtx.vault.label()}` : `instance: ${instanceRoot}`})`)
})