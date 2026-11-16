# ADR-MOS-19 — The graph component and the query language as separate open-source repositories

- **Status:** Proposed
- **Date:** 2026-11-16
- **Status log:**
  - 2026-11-16 — Proposed, from the PO's direction of the same day: three repositories now, an aggregator later; licence MIT.

## Background

ADR-MOS-18 extracted one graph drawing component and a canonical graph model from the dashboard's knowledge-graph widget (slice 1, #44), and the spike of #45 showed that a read-only query language closes over a 35-query corpus with eleven operator families. Both are general: nothing in them knows an instance, a source or a widget (the purity test proves it on every run), and the next two pieces of work, the layered layout and the query interpreter, are general too.

The dashboard is already a large project: a server with a dozen readers, thirty widgets, a static build, a heartbeat. A general-purpose library inside an application keeps its boundary only as long as a test polices it. The PO's direction (2026-11-16): deliver the component and the language as open-source repositories of their own under the meta-agentic organisation, so they can be reused and so the dashboard shrinks; and do it before the layered layout and the interpreter are built, so they are born in their repositories instead of being extracted a second time.

## Decision

### Four repositories, three now

| Repository and npm package (`@meta-agentic/…`) | Holds | Runtime dependencies |
|---|---|---|
| **`meta-graph-model`** | The canonical model: the JSON Graph Format v2 profile `meta-graph/1` and its JSON Schema; `nodesOf`, `edgesOf`, `degrees`, `validateModel`; the reader registry and the readers (NetworkX node-link now; DOT, GraphML, GEXF, GML, Cytoscape JSON as ADR-MOS-18 slice 6 adds them) | none |
| **`meta-graph-react`** | The style specification and its resolver, the layout strategies (`forceLayout`; the layered strategy of ADR-MOS-18 slice 2), `GraphCanvas`, `GraphList`, the behaviours (fisheye, sparks) | `meta-graph-model`, `d3-force`, `@dagrejs/dagre`; `react` and `react-dom` as peer dependencies |
| **`meta-graph-query`** | The query algebra (typed operators closed over the model), the interpreter, the textual surface and its parser, the four fixture graphs and the 35-query corpus as the acceptance suite | `meta-graph-model` |
| **`meta-graph`** (later) | The aggregator: one package that depends on the three at pinned versions and re-exports them, so a consumer that wants everything installs one name. The npm analogue of a Maven aggregator with a BOM. Created when the three have stable majors, not before | the three |

Repository names and package names are the same. Each repository is public from its first commit, carries `LICENSE` (MIT), a `README`, `docs/adr/` for its own records, and a CI that runs its tests on every push and pull request.

### The dependency rule

```
meta-graph-model  ←  meta-graph-react
meta-graph-model  ←  meta-graph-query
meta-graph        →  model, react, query   (later)
meta-os-dashboard →  react, query          (model arrives transitively)
```

`react` and `query` never depend on each other. Nothing depends on the dashboard. A dependency that would run the other way (a layout that needs a query, a query that needs a drawing) is a design fault, refused at review.

### Licence

**MIT**, decided by the PO on 2026-11-16 (it closes ADR-MOS-18's open decision 4 for the extracted code). It fits every dependency in use: d3-force (ISC), dagre (MIT), React (MIT). It excludes bundling `elkjs` (EPL-2.0) as the layered layout; if dagre's crossings prove poor on the measured graphs, elkjs may be an optional peer the consumer installs, never a dependency of `meta-graph-react`. The dashboard's own licence is a separate decision and stays open.

### Versions and the profile

Each package has its own semantic version. The profile version (`graph.metadata.profile = "meta-graph/1"`) is independent of package versions: a change that breaks documents bumps the profile to `meta-graph/2` and the model package's major together, and readers state which profiles they accept. `react` and `query` declare the model versions they work with as a semver range.

### What moves, what stays

| From the dashboard | To | Note |
|---|---|---|
| `server/graph/model.mjs`, `server/graph/readers/`, `src/graph/model.js` | `meta-graph-model` | one definition for both sides, as today |
| `src/graph/style.js`, `src/graph/layout/`, `src/graph/GraphCanvas.jsx`, `src/graph/GraphList.jsx`, `src/graph/behaviours/`, their tests, `src/graph/purity.test.mjs` | `meta-graph-react` | the purity test becomes "`meta-graph-react` imports nothing from any application" |
| `spike/graph-query/` (fixtures, corpus, evaluator), `docs/spikes/graph-query-language/` | `meta-graph-query` | the evaluator is replaced by the interpreter; fixtures and corpus become its acceptance suite |
| `server/graph/sources.mjs` (local file under a root, GitHub file), `server/graph/query.mjs` (the view, hubs, stratified cap), `server/graph.mjs`, `server/github-graph.mjs`, the widgets under `src/widgets/graph/`, `scripts/snapshot.mjs` | stay | sources and the view are the dashboard's infrastructure; the generic query the view implements may later be expressed in `meta-graph-query` |
| `docs/adr/ADR-MOS-18`, this record | stay | the dashboard's records of why; each new repository's README cites them until it has records of its own |

Extraction keeps history: `git filter-repo` over each path set, as ADR-INF-11 did for `isohub-brand`, so the golden tests and their commits travel with the code. During the transition the dashboard depends on the packages through `file:` links or npm workspaces; once published, through versions.

### Public safety

Nothing instance-specific exists in the moved paths (the purity test and the fixtures' neutral ids), and the moved ADR text names no instance. The measurements in ADR-MOS-18 (node and edge counts of this instance's graphs) are numbers without names and stay.

## Consequences

- The dashboard loses about 1,500 lines and 60 tests and gains two dependencies; its `npm test` drops to the readers, widgets and scripts.
- Three CIs instead of one; a change to the model is three pull requests when it ripples. The aggregator exists to make the consumer's side of that cheap, later.
- The layered layout (MOS-345) is built in `meta-graph-react` and the query interpreter in `meta-graph-query`, not in the dashboard: the extraction precedes them.
- Repository creation under the organisation and the npm scope are the PO's actions; the extraction is a story in the backlog.

## Options considered and rejected

- **One repository with three workspace packages.** Simpler releases and one CI; rejected by the PO for now because independent repositories make the boundaries hard and let each piece find its own users; the aggregator recovers the single-install convenience when the three are stable.
- **Keep both inside the dashboard until a third consumer exists.** The earlier plan; superseded because the next two pieces of work would then be extracted twice.
- **A fourth repository for the layouts now (`meta-graph-layout`).** Layouts are pure geometry with no React in them, so the split is natural; deferred until a non-React consumer (server-side SVG for an agent tool, for instance) asks for it. Open item 1.

## Open items

1. Whether the layout strategies split out of `meta-graph-react` into `meta-graph-layout`; decided when a non-React consumer appears.
2. The dashboard's own licence.
3. When `meta-graph` is created: the three at stable majors.
