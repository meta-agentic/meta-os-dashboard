#!/usr/bin/env node
// Build-time API snapshots for static hosting (GitHub Pages). Reuses the same
// readers as server/index.mjs so the deployed page shows the same data shape.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as read from '../server/readers.mjs'
import { graphSources, graphView } from '../server/graph.mjs'
import { lint } from '../server/lint.mjs'
import { reports } from '../server/reports.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(root, '../public/snapshots')

const configPath = process.env.META_OS_CONFIG ?? path.join(root, '../instance.config.json')
let config
try {
  config = JSON.parse(await fs.readFile(configPath, 'utf8'))
} catch (e) {
  console.error(`No config at ${configPath} — copy instance.config.example.json first.`)
  process.exit(1)
}

config = read.expandVars(config, config.vars ?? {})
const instanceRoot = config.instanceRoot
const frameworkRoot =
  config.frameworkRoot ?? path.dirname(await fs.realpath(path.join(instanceRoot, 'systems')))

async function write(name, data) {
  await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify(data))
  console.log(`  ${name}.json`)
}

console.log(`Snapshot → ${outDir}`)
console.log(`  instance: ${instanceRoot}`)
await fs.mkdir(outDir, { recursive: true })

const registry = await read.registry(instanceRoot, config.vars ?? {})
const projects = registry.projects ?? []

await write('meta', {
  instance: path.basename(instanceRoot),
  instanceRoot,
  frameworkRoot,
  vars: config.vars ?? {},
  roots: ['instance', 'framework'],
  mode: 'static',
})
await write('auth-config', config.auth ?? { enabled: false })
await write('ontology', await read.ontology(frameworkRoot))
await write('registry', registry)
await write('automations', await read.automations(instanceRoot))
await write('memory', await read.memory(instanceRoot))
await write('events', await read.events(instanceRoot, config.backlogs))
await write('lanes', await read.lanes(config.backlogs))
await write('lint', await lint(instanceRoot, frameworkRoot))
await write('outputs', await read.outputs(instanceRoot))
await write('report', await reports(config.backlogs))
await write('usage', { available: false, reason: 'engine usage is local-only — not included in static snapshots' })

const { sources, ...graphsMeta } = await graphSources(instanceRoot, projects)
await write('graphs', { ...graphsMeta, sources })

for (const src of sources ?? []) {
  const view = await graphView(src.file, {})
  await write(`graph-${src.name}`, { name: src.name, ...view })
}

console.log('Done.')