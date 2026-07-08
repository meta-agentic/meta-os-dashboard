# Roadmap — widget extensions

Implementation plan for the extensions adopted in the framework's
[systems/interface-extensions.md](https://github.com/mova77/meta-os/blob/main/systems/interface-extensions.md)
(verdicts and contract rationale live there; this file is the app-level how). Ordering
follows the contract's MVP order: observability before triggers.

Already covered, no new work: knowledge graph (Graph widget), task kanban (Lanes over
the backlog mirrors — the tracker stays authoritative). Rejected on principle: one-click
skill buttons and a standalone chat pane — both fold into the prompt console (phase 4).

## Phase 1 — derive from what exists (no contract change) — SHIPPED

**Upcoming-runs strip (`Automations`).** The automations table's `cadence` column is
already cron or a cron nickname. `server/cron.mjs` (nicknames + 5-field expressions, no
dependency) computes each scheduled row's occurrences over the next 48h; the widget
gains a "next" column and a horizontal strip — one tick per run, shipped rows accented,
candidates dim, event-driven rows excluded. Rows whose cadence can't be parsed degrade
visibly with the reason, per house rule.

**Unified event timeline (`Activity`).** `/api/events` composes, newest-first with a
`source` field:

- instance git log (already read for `/api/activity`)
- `automations/runs.jsonl` (already read for `/api/automations`)
- sprint open/close transitions from the configured backlog mirrors, with delivered
  counts at close — the only timestamps the mirror carries; per-story transition events
  wait for the tracker changelog (phase 2+)

Normalized shape: `{ ts, source, actor, action, target, note? }`; each source degrades
independently. The Activity widget is the feed with source filter chips;
`/api/activity` remains for compatibility.

**Blocked (`Lanes`).** The mirror has no BLOCKED status and no timestamps, so blocked is
*derived*: a not-done sprint story with an unfinished `dependencies` edge to a story the
mirror knows (unknown ids don't count — no guessing). Rendered as a warn outline on the
story's queue slot plus a per-lane count; blocked *age* stays n/a for the same reason as
cycle-time and says so.

## Phase 2 — new read surfaces — SHIPPED

**Output inbox (`Outputs` widget, `/api/outputs`).** Walks `memory/output/` plus recent
promotions into `memory/wiki/`; timestamps from instance git add-dates with mtime
fallback for uncommitted files (and it says which basis it used). Front-matter type +
`project/*` tag rendered as facet chips; fresh items (7d) dotted. Pairs with the
registry's "delivers to" column: a project node's `output:` field (ontology optional
field) names an external delivery repo/path; blank means deliverables land here.

**Engine usage (`Usage` widget, `/api/usage`).** Optional config key `claudeHome`
(default `~/.claude`). Parses the engine's per-project session JSONL logs
(`message.usage` lines), aggregates per model × project × day over a 30d window,
cached per file by mtime. Engine project slugs map back to registry projects via their
`path` field. Cost is reported n/a — the logs carry no cost field and prices are never
estimated in code. Missing `claudeHome`/logs → the widget shows the reason, not zeros.
Read-only and local-only: session logs contain instance content and must never be
exported or committed.

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
