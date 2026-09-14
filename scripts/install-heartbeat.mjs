// Fills heartbeat.plist.example in from the checkout it is run out of.
//
// launchd needs absolute paths, so the plist cannot avoid naming one. What it can avoid
// is a human remembering to retype four of them: this derives them all from
// `import.meta.url` and `process.execPath`, so moving the repo (or upgrading node) is a
// re-run plus a reload rather than a hand-edit. The heartbeat job was dead for eight
// weeks because a checkout moved under a new parent and its plist kept the old path.
//
//   node scripts/install-heartbeat.mjs [--label com.you.metaos.heartbeat] [--out DIR]
//
// Writes <label>.plist and prints the launchctl commands. It deliberately does not run
// them: loading and unloading is a live change to the user's session, and re-running an
// installer should not be able to silently disturb a job that is currently healthy.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) {
    console.error(`--${name} needs a value`)
    process.exit(2)
  }
  return v
}

const label = arg('label', 'com.example.metaos.heartbeat')
const outDir = path.resolve(arg('out', repoRoot))

// Same literal placeholders the template documents in its header.
const substitutions = [
  ['com.example.metaos.heartbeat', label],
  ['/path/to/node/bin/node', process.execPath],
  ['/path/to/meta-os-dashboard', repoRoot.replace(/\/$/, '')],
  ['/path/to/home', os.homedir()],
]

const templatePath = path.join(repoRoot, 'heartbeat.plist.example')
const template = await fs.readFile(templatePath, 'utf8')

// Guard against the template growing a placeholder this script does not know about — checked
// on the template, never on the output, so that `--label com.example.anything` is not mistaken
// for an unsubstituted value. Comments are excluded: the header deliberately keeps
// `/path/to/...` and `com.example...` as prose, and it is carried into the generated file so
// whoever finds the plist later reads "re-run the installer" rather than editing paths by hand.
let residual = template.replace(/<!--[\s\S]*?-->/g, '')
for (const [from] of substitutions) residual = residual.replaceAll(from, '')
const leftover = residual.match(/\/path\/to\/\S*|com\.example\.\S*/)
if (leftover) {
  console.error(`${templatePath} carries a placeholder this script does not substitute: ${leftover[0]}`)
  console.error('The template and this script have drifted — add it to the substitution list above.')
  process.exit(1)
}

let plist = template
for (const [from, to] of substitutions) plist = plist.replaceAll(from, to)

// The heartbeat itself writes here too, and creates it on demand; do it up front so a
// plist whose StandardErrorPath is the only record of a failed exec has somewhere to land.
await fs.mkdir(path.join(os.homedir(), 'Library/Logs'), { recursive: true })

const outFile = path.join(outDir, `${label}.plist`)
await fs.writeFile(outFile, plist)

const installed = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`)
console.log(`wrote ${outFile}`)
console.log('')
console.log('Install (or reinstall after a move) with:')
console.log(`  cp ${outFile} ${installed}`)
console.log(`  launchctl unload ${installed} 2>/dev/null; launchctl load ${installed}`)
console.log('')
console.log('Then verify — a second column of 0 means the last run exited clean:')
console.log(`  launchctl list | grep ${label}`)
