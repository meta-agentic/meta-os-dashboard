#!/usr/bin/env node
// CI helper: clone repos listed in pages.config.json and write instance.config.json.
import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const cfgPath = path.join(root, '../pages.config.json')
const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8'))
const workDir = path.resolve(root, '..', cfg.workDir ?? '.pages')
const token = process.env.PAGES_CLONE_TOKEN || process.env.GH_TOKEN

await fs.rm(workDir, { recursive: true, force: true })
await fs.mkdir(workDir, { recursive: true })

for (const { repo, dir, ref } of cfg.repos ?? []) {
  const dest = path.join(workDir, dir)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const url = token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`
  const branch = ref ? `-b ${ref}` : ''
  console.log(`clone ${repo} → ${dir}`)
  execSync(`git clone --depth 1 ${branch} ${url} ${dest}`, { stdio: 'inherit' })
}

const vars = { workDir }
const expand = (v) =>
  typeof v === 'string'
    ? v.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? `\${${k}}`)
    : Array.isArray(v)
      ? v.map(expand)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, val]) => [k, expand(val)]))
        : v

const instanceConfig = expand(cfg.instanceConfig)
await fs.writeFile(
  path.join(workDir, 'instance.config.json'),
  JSON.stringify(instanceConfig, null, 2),
)
console.log(`Wrote ${path.join(workDir, 'instance.config.json')}`)