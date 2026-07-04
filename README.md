# meta-os dashboard

Layer 3 of a [meta-os](https://github.com/mova77/meta-os) Agentic OS: an
observability-first command center over your instance vault. **The vault is the
database** — no proprietary store. Everything here reads git-tracked markdown
front-matter and JSON artifacts from disk, and the one write path (headless skill runs)
lands results back into the vault exactly like a terminal session would.

Built prompt-first, not button-first: this is a cockpit for the operator, not a
click-to-run panel for delegation. See
[systems/interface-layer.md](https://github.com/mova77/meta-os/blob/main/systems/interface-layer.md)
and
[systems/ontology.md](https://github.com/mova77/meta-os/blob/main/systems/ontology.md)
in the framework repo for the full contract this app implements.

## What it shows

- **Lanes** — active sprint flow per swarm lane: todo/wip/done as filled slots (not just
  counts), a sprint burn line, story points, and forecasts (velocity, median-baseline
  acceleration, Little's-Law ETA).
- **Knowledge graph** — a live, pannable/zoomable view over
  [graphify](https://github.com/mova77/meta-os/tree/main/skills/graphify) output.
  Type-stratified so rare categories (docs, decisions, spikes) aren't drowned out by
  code volume, with community drill-down, per-type hub lists, a mouse-hover fisheye
  effect, and ambient + real-event node sparks when the graph changes.
- **Memory** — the raw → wiki → output promotion pipeline as fill-slot gauges (capacity
  = 24h high-water mark), plus federated-vault context (navigation, not canon).
- **Automations** — the instance's automation table with cadence and last-run/outcome,
  read from a simple `runs.jsonl` append log.
- **Registry** — the project estate, linked out to each repo.
- **Ontology lint** — front-matter in the instance validated against the framework's
  `ontology.yaml`; violations surface here instead of rotting silently.
- **Vault activity** — recent instance commits.

Every widget degrades visibly instead of guessing: a missing feed shows its reason, not
a zero.

## Setup

```bash
npm install
cp instance.config.example.json instance.config.json
```

Edit `instance.config.json`:

```json
{
  "instanceRoot": "/absolute/path/to/your/instance-vault",
  "frameworkRoot": "(optional) /absolute/path/to/meta-os — defaults to resolving the instance's systems/ symlink",
  "backlogs": [
    { "space": "example", "path": "/absolute/path/to/scrum/<space>/backlog.json" }
  ]
}
```

`instance.config.json` is gitignored — this repo stays generic and public-safe; your
instance data (paths, backlog locations) only ever exists locally.

```bash
npm run dev
```

Starts the API (`server/index.mjs`, default port `3777` — override with `API_PORT`) and
the Vite dev server (port `5173`, proxying `/api` to the API) together.

## Heartbeat automation

`scripts/heartbeat.mjs` is a standalone OS self-check: it runs the ontology linter, flags
stale unpromoted `raw/` notes, and catches shipped scheduled automations that have never
logged a run. Findings are filed as a `heartbeat` note to the instance's `memory/raw/`,
and the run itself is appended to `automations/runs.jsonl`.

Run it manually:

```bash
node scripts/heartbeat.mjs
```

Or schedule it (e.g. via `launchd` on macOS or `cron`) for a daily pulse — see the
`automations/_index.md` row it's designed to power.

## Architecture

```
server/
  index.mjs     — Express app, route wiring
  readers.mjs   — registry, automations, memory, activity, lanes (backlog mirrors)
  graph.mjs     — graphify graph.json parsing, caching, degree-ranked + type-stratified
                  subgraph queries
  lint.mjs      — ontology front-matter validation
src/
  App.jsx       — polls each feed, lays out the widget grid
  widgets/      — one component per card (Lanes, Graph, Memory, Automations, Registry,
                  Lint, Activity)
scripts/
  heartbeat.mjs — the scheduled self-check (see above)
```

No database, no build-time coupling to any specific instance — everything is read fresh
from `instanceRoot` on each request (with a small in-memory cache for the potentially
large graphify graphs, invalidated on file mtime change).
