# Roadmap — widget extensions

Implementation plan for the extensions adopted in the framework's
[systems/interface-extensions.md](https://github.com/meta-agentic/meta-os/blob/main/systems/interface-extensions.md)
(verdicts and contract rationale live there; this file is the app-level how). Ordering
follows the contract's MVP order: observability before triggers.

Already covered, no new work: knowledge graph (Graph widget), task kanban (Lanes over
the backlog mirrors — the tracker stays authoritative). Rejected on principle: one-click
skill buttons and a standalone chat pane — both fold into the prompt console (phase 4).

## Phase 1 — derive from what exists (no contract change)

**Upcoming-runs strip (`Automations`).** The automations table's `cadence` column is
already cron or a cron nickname. Add next-run computation in `server/readers.mjs`
(small cron parser — support the nicknames plus 5-field expressions; no dependency
needed) and return `nextRuns` alongside the existing rows. The widget gains a 24–48h
horizontal strip: one tick per scheduled run, event-driven rows excluded. Rows whose
cadence can't be parsed degrade visibly with the reason, per house rule.

**Unified event timeline (`Activity`).** New `/api/events` in `server/readers.mjs`
composing, newest-first with a `source` field:

- instance git log (already read for `/api/activity`)
- `automations/runs.jsonl` (already read for `/api/automations`)
- backlog changelogs from the configured `backlogs` (stage transitions — same files the
  lanes forecasts use)

Normalized shape: `{ ts, source, actor, action, target, note? }`. The Activity widget
becomes the feed with source filter chips; `/api/activity` stays until the widget flips.

**Blocked + age (`Lanes`).** Surface `blocked` item state and item-age-in-stage from the
backlog mirror (both already specified in the ontology's `flow.metrics.instant`). Render
as a per-lane badge with the oldest-blocked age.

## Phase 2 — new read surfaces

**Output inbox (`Outputs` widget, `/api/outputs`).** Walk `memory/output/` plus recent
promotions into `memory/wiki/` (file-adds from the instance git log carry the
timestamps). Return front-matter type + tags for ontology facets; newest first; badge
items newer than N days. Degrades to its reason when the folders are empty or missing.

**Engine usage (`Usage` widget, `/api/usage`).** New optional config key `claudeHome`
(default `~/.claude`). Parse the engine's per-project session JSONL logs, aggregate
usage per model × project × day (tokens; cost if the log carries it — never estimate
prices in code, they rot). Cache by file mtime like `server/graph.mjs`. Missing
`claudeHome` or no logs → widget shows the reason, not zeros. Read-only and local-only:
session logs contain instance content and must never be exported or committed.

## Phase 3 — live telemetry

Hooks (framework `hooks-automation` skill) append agent/tool events to the instance's
`automations/events.jsonl` — shape per the framework contract:
`{ ts, actor, action, target, note? }`. The server watches `events.jsonl` +
`runs.jsonl` (fs.watch, debounced) and pushes over SSE at `/api/stream`; the events feed
goes live instead of 30s polling. The ontology gains the `events.jsonl` entry contract
when this ships.

## Phase 4 — trigger surface (last, per MVP order)

The prompt console — absorbing the "skill panel" and "context chat" ideas:

- **Palette:** skill catalog from `skills/_index.md` (already a contract read surface);
  selecting a skill prefills an *editable* prompt — never a fire-and-forget button.
- **Context prefill:** the console seeds the prompt with what you're looking at (focused
  widget + its current filter), which is the legitimate core of the "context chat"
  proposal.
- **Run:** `POST /api/run` spawns the engine headless (`claude -p`) with cwd =
  `instanceRoot`, streaming stdout over SSE. One run at a time; outputs land in
  `memory/raw/` / `memory/output/` per normal discipline — the dashboard displays
  results, it never owns them.

## Config additions

| Key | Phase | Meaning |
|-----|-------|---------|
| `claudeHome` | 2 | Engine home for usage logs (optional; default `~/.claude`) |

Both stay in the gitignored `instance.config.json` — the repo remains generic and
public-safe.
