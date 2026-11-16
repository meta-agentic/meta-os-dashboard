# ADR-MOS-19 — The graph component and the query language as one open-source repository, `meta-graph`, with modules

- **Status:** Proposed
- **Date:** 2026-11-16
- **Status log:**
  - 2026-11-16 — Proposed, from the PO's direction of the same day: three repositories now, an aggregator later; licence MIT.
  - 2026-11-16, later — Revised by the PO: one umbrella repository `meta-agentic/meta-graph` with the three as modules under it, one pipeline and one release train, to avoid a repository explosion. The record below is the revised decision.

## Background

ADR-MOS-18 extracted one graph drawing component and a canonical graph model from the dashboard's knowledge-graph widget (slice 1, #44), and the spike of #45 showed that a read-only query language closes over a 35-query corpus with eleven operator families. Both are general: nothing in them knows an instance, a source or a widget (the purity test proves it on every run), and the next two pieces of work, the layered layout and the query interpreter, are general too.

The dashboard is already a large project: a server with a dozen readers, thirty widgets, a static build, a heartbeat. A general-purpose library inside an application keeps its boundary only as long as a test polices it. The PO's direction (2026-11-16): deliver the component and the language as open source under the meta-agentic organisation, so they can be reused and so the dashboard shrinks; do it before the layered layout and the interpreter are built, so they are born in their home instead of being extracted a second time; and keep them in **one repository with modules**, the way a Maven parent holds its modules, so there is one CI, one version and one release train instead of three of each.

## Decision

### One repository, four packages

`meta-agentic/meta-graph`, public from its first commit, MIT, with npm workspaces:

| Module (`packages/…`) and npm package | Holds | Runtime dependencies |
|---|---|---|
| **`model`** → `@meta-agentic/graph-model` | The canonical model: the JSON Graph Format v2 profile `meta-graph/1` and its JSON Schema; `nodesOf`, `edgesOf`, `degrees`, `validateModel`; the reader registry and the readers (NetworkX node-link now; DOT, GraphML, GEXF, GML, Cytoscape JSON as ADR-MOS-18 slice 6 adds them) | none |
| **`react`** → `@meta-agentic/graph-react` | The style specification and its resolver, the layout strategies (`forceLayout`; the layered strategy of ADR-MOS-18 slice 2), `GraphCanvas`, `GraphList`, the behaviours (fisheye, sparks) | `graph-model`, `d3-force`, `@dagrejs/dagre`; `react` and `react-dom` as peer dependencies |
| **`query`** → `@meta-agentic/graph-query` | The query algebra (typed operators closed over the model), the interpreter, the textual surface and its parser, the four fixture graphs and the 35-query corpus as the acceptance suite | `graph-model` |
| **`meta-graph`** → `@meta-agentic/meta-graph` | The aggregator: depends on the three at the same version and re-exports them, so a consumer that wants everything installs one name. The npm analogue of a Maven aggregator with a BOM. Exists from the first release; it is one file | the three |

The parent `package.json` declares the workspaces, the shared scripts (`test`, `build`, `lint`, `release`) and the attribution gate the estate uses everywhere. One CI runs every package's tests on every push and pull request. The repository carries `LICENSE` (MIT), a `README` per package and at the root, and `docs/adr/`, where ADR-MOS-18 and this record move with the code.

### Versions: lockstep, one release train

All four packages share one version, bumped together, one tag per release, one changelog: the Maven parent-version pattern. A release publishes the four to the public npm registry under the `@meta-agentic` scope (these are JavaScript packages; Maven Central would enter only if a Java module joined the parent, which the layout allows under `modules/` beside `packages/`). Independent versions per package are a later option if a package's cadence diverges; starting in lockstep is the cheap choice.

The profile version (`graph.metadata.profile = "meta-graph/1"`) is independent of the package version: a change that breaks documents bumps the profile to `meta-graph/2` and the packages' major together, and readers state which profiles they accept.

### The dependency rule

```
model  ←  react
model  ←  query
meta-graph  →  model, react, query
meta-os-dashboard  →  react, query   (model arrives transitively)
```

`react` and `query` never depend on each other. Nothing depends on the dashboard. Because one repository makes a stray import easy, a test in the parent fails on any edge outside this list.

### Licence

**MIT**, decided by the PO on 2026-11-16 (it closes ADR-MOS-18's open decision 4 for the extracted code). It fits every dependency in use: d3-force (ISC), dagre (MIT), React (MIT). It excludes bundling `elkjs` (EPL-2.0) as the layered layout; if dagre's crossings prove poor on the measured graphs, elkjs may be an optional peer the consumer installs, never a dependency of `graph-react`. The dashboard's own licence is a separate decision and stays open.

### What moves, what stays

| From the dashboard | To | Note |
|---|---|---|
| `server/graph/model.mjs`, `server/graph/readers/`, `src/graph/model.js` | `packages/model` | one definition for both sides, as today |
| `src/graph/style.js`, `src/graph/layout/`, `src/graph/GraphCanvas.jsx`, `src/graph/GraphList.jsx`, `src/graph/behaviours/`, their tests, `src/graph/purity.test.mjs` | `packages/react` | the purity test becomes "`graph-react` imports nothing from any application" |
| `spike/graph-query/` (fixtures, corpus, evaluator), `docs/spikes/graph-query-language/` | `packages/query` | the evaluator is replaced by the interpreter; fixtures and corpus become its acceptance suite |
| `docs/adr/ADR-MOS-18`, this record | `docs/adr/` of `meta-graph` | a pointer stays in the dashboard's `docs/adr/README` |
| `server/graph/sources.mjs` (local file under a root, GitHub file), `server/graph/query.mjs` (the view, hubs, stratified cap), `server/graph.mjs`, `server/github-graph.mjs`, the widgets under `src/widgets/graph/`, `scripts/snapshot.mjs` | stay | sources and the view are the dashboard's infrastructure; the generic query the view implements may later be expressed in `graph-query` |

Extraction keeps history: one `git filter-repo` over the path sets with paths renamed into `packages/*`, as ADR-INF-11 did for `isohub-brand`, so the golden tests and their commits travel with the code. During the transition the dashboard depends on the packages through a workspace or `file:` link; once published, through versions.

### Public safety

Nothing instance-specific exists in the moved paths (the purity test and the fixtures' neutral ids), and the moved ADR text names no instance. The measurements in ADR-MOS-18 (node and edge counts of this instance's graphs) are numbers without names and move with it.

## Consequences

- The dashboard loses about 1,500 lines and 60 tests and gains two dependencies; its `npm test` drops to the readers, widgets and scripts.
- One CI and one release for the four packages; a change to the model and its consumers is one pull request.
- The layered layout (MOS-345) is built in `packages/react` and the query interpreter in `packages/query`, not in the dashboard: the extraction precedes them.
- Repository creation under the organisation and the npm scope are the PO's actions; the extraction is a story in the backlog.

## Options considered and rejected

- **Three repositories now, an aggregator later** (this record's first version). Independent boundaries and users, but three CIs, three release trains and cross-repository pull requests for every model change; rejected by the PO the same day as a repository explosion.
- **Keep both inside the dashboard until a third consumer exists.** The earlier plan; superseded because the next two pieces of work would then be extracted twice.
- **A separate `layout` package now.** Layouts are pure geometry with no React in them, so the split is natural inside the parent; deferred until a non-React consumer (server-side SVG for an agent tool, for instance) asks for it. Open item 1.

## Open items

1. Whether the layout strategies become their own package `graph-layout` under the parent; decided when a non-React consumer appears.
2. The dashboard's own licence.
3. Release tooling: a plain lockstep bump script first; `changesets` if independent versions are ever wanted.
