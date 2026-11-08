# ADR 0001 — One graph drawing component, interchangeable graph sources

- **Status:** Proposed
- **Date:** 2026-11-08
- **Method:** SPARC (Specification, Pseudocode, Architecture, Refinement, Completion), with the layout choices checked against the graph-drawing discipline: classify the graph first, let its meaning pick the drawing convention, keep layout and rendering apart.

## Background

The dashboard draws one graph today: the knowledge graph that graphify writes to `graphify-out/graph.json`. Everything about that graph lives in one place. `src/widgets/graph/GraphView.jsx` (264 lines) holds the force layout, the zoom and pan, the fisheye and the sparks, and also graphify's node types, colours and edge confidences. `GraphContext.jsx` fetches graphify's feed and exports graphify's colour table. On the server, `server/graph.mjs` and `server/github-graph.mjs` each carry their own copy of the code that reads NetworkX node-link JSON; they differ only in where the file comes from.

Two more graphs are coming: the backlog's dependency graph across all spaces, and one work item's dependency subgraph (the items it needs), drawn in its detail view with each node's status. Written the way the knowledge graph is, each would be another copy of the drawing code wired to one more data format.

The aim is the opposite: the drawing component knows how to draw a graph and nothing about where the graph came from. The graph is only the source of information, the model. Any source should plug in: graphify's output, the backlog's graph index, a JSON document in a schema we define, and the well-known exchange formats (Graphviz DOT, GraphML, GEXF, the JSON Graph Format).

### The graphs, measured (2026-11-08)

| Graph | Nodes | Edges | Directed | Cycles | Depth | Notes |
|---|---|---|---|---|---|---|
| graphify knowledge graph (this instance) | 17,869 | 44,278 | no | n/a | n/a | 33 MB of JSON; the server already caps a view at 1,000 nodes (default 400) with a per-type stratified pick |
| Backlog dependency graph, every space | 1,371 | 1,646 | yes | none (Tarjan SCC) | 18 layers | m/n = 1.2, sparse; highest in-degree 15 |
| One work item's dependency subgraph | median 2, 95th percentile 14, largest 38 | — | yes | none | ≤ 18 | small enough to lay out in the browser on every open |

These numbers decide the layout strategies below; they are re-measured when a new source is added.

## Specification

### Functional

1. A graph source is chosen per widget instance, from a registry, with no change to the drawing code.
2. Formats read in the first slices: NetworkX node-link JSON (graphify), the backlog graph index (`[[A]] -> [[B]]` lines, with `=>`, `--` and `|-` reserved for hard blocks, relates and epic membership), and our canonical JSON. Later: Graphviz DOT, GraphML, GEXF, GML, Mermaid flowcharts, Cytoscape JSON.
3. Attributes can be joined onto a graph from another source by node id, so that a backlog graph, which names only ids, is drawn with each item's status, title and sprint.
4. Server-side queries over any graph: filter by attribute, text search, a capped selection that keeps every node type represented (generalising today's graphify logic), and the transitive subgraph of a root node by edge kind and depth.
5. Visual encoding is declared, not coded: a style specification maps attributes to colour, text label, badge, size and edge stroke, and the legend is derived from it. A status is shown by colour and by a text label, never by colour alone.
6. Layout is a swappable strategy, at least force-directed and layered, and the default comes from the graph's classification.
7. A cycle is drawn, with its reversed edges marked, and named in the view; it is never hidden.
8. Interaction: pan, zoom, reset, hover detail, click to open or drill down, keyboard focus on nodes. The fisheye and the sparks remain, as optional behaviours of the knowledge-graph widget.
9. A text list of the same nodes and edges stays beside every drawing, for keyboard and screen-reader use.

### Non-functional

- **The repository is public:** no instance data in code, fixtures or docs. Paths come from the instance configuration.
- **Untrusted input:** a graph file may come from anywhere. Size is capped before parsing, XML is parsed with entity expansion off (no XXE, no billion-laughs), no external tool (the Graphviz `dot` binary included) is executed, a file is read only under configured roots, and labels reach the page only as text.
- **Rendering budget:** at most 1,000 nodes in one SVG (today's ceiling); labels drawn for at most about 150 nodes at a time, beyond that by zoom threshold; layouts over about 300 nodes run off the main thread.
- **Determinism:** the same graph and options give the same positions, so tests can compare drawings and a poll that brings no change causes no re-layout (today's `mtime` check, kept).

## Pseudocode

```
// server
source   = sources.get(name)                  // where: local file under a root, GitHub file
{bytes, version} = source.read()              // version = mtime or commit time; cache key
reader   = readers.detect(source.format ?? sniff(bytes))
graph    = cache(source, version, () => reader.parse(cap(bytes)))    // canonical model
graph    = enrichers.apply(graph, source.enrich)   // e.g. join item status by id
view     = query(graph, {filter, q, root, kinds, depth, limit})      // subgraph, stratified cap
return { model: view, stats, version, style: source.style }

// client
cls      = classify(model)                    // directed? acyclic? n, m, max degree, components
strategy = options.layout ?? defaultFor(cls)  // directed+acyclic → layered; undirected → force
geom     = strategy.layout(model, opts)       // {positions, routes, reversedEdges, bounds}; pure
<GraphCanvas model geom style={resolve(source.style)} behaviours={[...]} onNodeClick />
<GraphList model style />                     // the accessible text twin
```

## Architecture

Eight parts, each depending only on the ones above it. Nothing below the model knows a file format; nothing above the model knows a pixel until the renderer.

| # | Part | Side | Responsibility | Today |
|---|---|---|---|---|
| 1 | **Source** | server | Where the bytes come from: a local file under a configured root, a file in a GitHub repository. Returns bytes and a version. | duplicated in `graph.mjs` and `github-graph.mjs` |
| 2 | **Reader** | server | One per format: `detect(bytes, hint)` and `parse(bytes) → Graph`. Pure, no I/O. | NetworkX parsing inline in both files |
| 3 | **Canonical model** | both | The one in-memory and wire shape, defined below. Cached per source and version. | implicit, graphify-shaped |
| 4 | **Enricher** | server | Joins attributes by node id from another provider (the work items reader for status, title, sprint). | none |
| 5 | **Query** | server | Filter, search, stratified cap, transitive subgraph by kinds and depth. | graphify-only filter and cap in `graphView()` |
| 6 | **Style specification** | both | Declarative mapping from attributes to colour, label, badge, size, edge stroke; the legend is derived from it. Shipped per source. | `TYPE_COLOR`, `CONF_OPACITY`, `radius()` in code |
| 7 | **Layout strategy** | client (worker when large) | `layout(model, options) → geometry`. Geometry is positions, edge routes (polylines), reversed edges, bounds: coordinates, not pixels. | d3-force inline in `GraphView.jsx` |
| 8 | **Renderer** | client | `GraphCanvas`: draws geometry with the style; pan, zoom, focus, events; behaviours (fisheye, sparks, ambient pulse) as opt-in plugins. `GraphList`: the text twin. | all of it in `GraphView.jsx` |

The widgets become thin shells that pick a source, a style, a layout and behaviours: **knowledge graph** (graphify source, force, fisheye and sparks), **dependency graph** (graph index source, status enricher, layered, clusters later), **item subgraph** (the dependency graph shell with a root and the subgraph query).

### The canonical model: the JSON Graph Format, profiled

We do not invent a graph schema; we adopt the JSON Graph Format (JGF) version 2 (jsongraphformat.info), an open, schema-backed format with directed and undirected graphs and free metadata, and define a **profile**: a JSON Schema file in this repository that fixes the metadata keys the dashboard understands. A JSON document valid against the profile is the "JSON with a schema we define"; it is also plain JGF to any other tool.

```json
{
  "graph": {
    "id": "example", "directed": true,
    "metadata": { "profile": "meta-graph/1", "version": "2026-11-08T00:00:00Z" },
    "nodes": {
      "A-1": { "label": "First item", "metadata": { "type": "story", "group": "epic-7", "status": "DONE", "weight": 3 } },
      "A-2": { "label": "Second item", "metadata": { "type": "story", "status": "TO DO" } }
    },
    "edges": [
      { "source": "A-2", "target": "A-1", "relation": "depends", "metadata": { "kind": "dependency", "confidence": 1.0 } }
    ]
  }
}
```

Profile keys: node `type` (category), `group` (community, cluster or epic), `status`, `weight`, `source` (where the node is defined); edge `kind` (dependency, block, relates, child, or a reader's own), `confidence` (0 to 1), `weight`. Unknown keys pass through untouched, so a source's own attributes stay usable in a style specification. Readers map onto it: graphify's `file_type` → `type`, `community` → `group`, `confidence` (EXTRACTED, INFERRED, AMBIGUOUS) → a number with the original kept; DOT attributes and GraphML `<data>` keys → `metadata` as declared by their `<key>` elements.

### Layout strategies

Chosen by what the graph means, as the measurements above classify it:

| Strategy | For | Phases and guarantees | Library |
|---|---|---|---|
| **Force** (spring model) | undirected or unknown structure: the knowledge graph | d3-force as today, seeded for determinism. Heuristic: no crossing bound; cluster separation is the message. Beyond about 2,000 nodes it would need a multilevel method, but the server cap keeps views far below that. | `d3-force` (in use, ISC) |
| **Layered** (Sugiyama) | directed graphs whose direction means something: dependencies | (1) cycle removal, greedy, reverses at most half the edges, reversed edges marked and drawn as such; (2) layering, network simplex for compactness, longest-path for speed; (3) crossing reduction by iterated barycenter or median sweeps (heuristic, the problem is NP-hard: the count is measured, never claimed minimal); (4) coordinates, Brandes–Köpf style, at most two bends per long edge. Prerequisites at the bottom, dependants above, so the flow reads one way. | `@dagrejs/dagre` (MIT) first; `elkjs` (EPL-2.0) only if dagre's crossings or long-edge routing prove poor on the measured graphs |
| **Tree, radial** | later, when a source is a pure hierarchy (epic trees) | a dedicated tree algorithm, never a general one | when needed |

Default rule: directed and acyclic → layered; directed with cycles → layered with the cycle named; undirected → force. Forcing a layered drawing on an undirected graph would invent a rank the data does not have, and force-directing a dependency graph would hide its flow; the widget allows an override, but the defaults follow the meaning.

Aesthetic priority for the layered view, written down so that a drawing can be checked against it: direction consistent (every dependency edge points one way) > crossings > bends on long edges > width > edge-length uniformity. Labels are part of the layout: node boxes are sized to their label before layout, so the layered strategy leaves room for them instead of dropping them afterwards.

Stability: when a filter changes or a poll brings a new version, the layout is recomputed cleanly and the zoom is kept. Half-pinning old positions reads worse than either full stability or a clean relayout, so the dashboard picks the clean relayout.

### Where things run

Parsing, enrichment and queries on the server: the knowledge graph's raw file is 33 MB and must never reach a browser, and the size caps and XML hardening sit in one place. Layout on the client, because it depends on the viewport and is cheap at the sizes the server lets through; above about 300 nodes it runs in a Web Worker so the page stays responsive.

### Options considered and rejected

- **An own JSON schema from scratch.** Rejected: no tool outside the dashboard would read it. A profile over JGF gives the same control and stays readable by others.
- **Cytoscape.js as the whole stack.** A mature graph library with many layouts, but its JSON and its canvas renderer would become the model and the view; the drawing would no longer be styled with the dashboard's own components, and the text twin and status labels would be fought for. It remains a candidate reader format.
- **Graphviz itself (WebAssembly build) as the layered layout.** Excellent layered drawings, and DOT sources would be laid out as their authors intended. Rejected for the first slices for size (megabytes of WebAssembly in the bundle) and because it would be a second, different engine beside d3-force; kept as a possible later layout strategy behind the same interface, never as an executed binary.
- **Parsing in the browser.** Rejected: the knowledge graph's file size, and the security caps belong on the server.

## Refinement

### Tests

- **Reader conformance matrix.** One fixture graph, with a directed edge, an undirected one, typed attributes, a cycle, an isolated node, a duplicate edge and a non-ASCII label, written by hand in every supported format. Each reader must produce the same canonical model. One test per format and property, with a guard that fails when a new format is registered without its fixture.
- **Profile validation.** Valid and invalid canonical documents against the JSON Schema; an invalid one is refused with the path of its first error.
- **No change to the knowledge graph.** Before and after the extraction, the same payload gives the same nodes, links, colours and, with the seeded simulation, the same positions.
- **Layout ledger per strategy, measured on fixtures:** crossings counted, reversed edges counted, minimum node separation, every dependency edge pointing the declared way, a label placed for every node of a 38-node subgraph at 1280×720.
- **Security.** A file over the cap is refused before parsing; an XML file with entity expansion is refused; a path outside the configured roots is refused; a label containing markup is shown as text.
- **Subgraph query.** On a fixture: transitive dependencies listed once each, the depth limit respected, a cycle named.

### Risks

- dagre's crossing reduction is a heuristic and can leave visible crossings on dense layers. Measured on the real graphs before the layered view ships; elkjs is the fallback.
- A profile is a contract: renaming a key breaks stored documents. The profile carries a version in `graph.metadata.profile`, and readers state which versions they accept.
- Joining status by id assumes ids are unique across the sources joined; the enricher reports conflicts rather than picking one.

## Completion

Slices, each releasable on its own and each leaving the knowledge graph working:

1. **Extract** the canonical model, the source and reader layers, `GraphCanvas`, `GraphList` and the style specification; the graphify reader and source move behind them and the duplicate server copy goes. The knowledge graph looks and behaves as before.
2. **Layered layout** strategy, the classification and the default rule, with the layout ledger tests.
3. **Backlog dependency graph**: the graph index reader, the status enricher, the dependency-graph widget.
4. **Item subgraph**: the subgraph query and the item detail view.
5. **Canonical JSON**: the profile's JSON Schema, its reader and its validation messages.
6. **Exchange formats**: DOT and GraphML readers with the XML hardening; GEXF, GML, Mermaid and Cytoscape JSON when a source needs them.

## Open decisions

1. The canonical model is a JGF version 2 profile (recommended) or an own schema.
2. Layered layout through `@dagrejs/dagre` first (recommended), `elkjs`, or our own implementation of the four phases.
3. Parsing and queries stay on the server (recommended).
4. This repository declares no licence in `package.json` and has no licence file; dependency licences (MIT, ISC, EPL-2.0) should be checked against the one it will carry.
