# Spike — a graph query language for the drawing component

- **Date:** 2026-11-16 · **Design context:** ADR-MOS-18 (Approved), part 5, the query.
- **Question:** can one read-only language select nodes, edges and subgraphs over any graph the component draws, in a notation that reads like graph theory, and be checked?
- **Method:** the algebra first, with no syntax; four fixture graphs, one per combination of the axes that matters, each at most 11 nodes; the expected answer of every query derived by hand before any code; a throwaway evaluator (`spike/graph-query/algebra.mjs`, about 400 lines, not part of the product or of `npm test`; run it with `node --test spike/graph-query`) that must reproduce them; then three textual surfaces compared on the corpus.
- **Verdict:** the algebra closes over the corpus with eleven operator families and no addition; 35 of 35 queries reproduce; five hand answers disagreed with the machine, and in four of them the hand was wrong, which is the argument for a checkable language over a human reading a drawing.

## 1. The corpus

Thirty-five natural-language queries, tagged **D**irected / **U**ndirected · **C**onnected / **X** disconnected · **L**abelled / **N** structure only · **W**eighted / **Q** unweighted. The full list with the fixture each runs on is `spike/graph-query/corpus.test.mjs`; the categories: nodes (1–8), edges (9–15), nodes and edges together (16–19), subgraphs with a property (20–27), nested queries (28–30), and five added during review: a diff between versions (31), constrained paths (32), motifs (33), dead ends (34), facts about the whole graph (35).

Three rules keep one query text valid across all sixteen kinds: **direction belongs to the graph**, not the query (predecessor and reachable read `directed`; on an undirected graph they mean neighbour); **weight defaults to 1** (degree, path length and spanning trees run unchanged on an unweighted graph); **a missing property makes a predicate false**, never an error.

## 2. The fixtures

| Fixture | Kinds | Shape | Nodes / edges |
|---|---|---|---|
| `f1-dag` | D · C · L · W | work items under three epics: `dependency` and `child` edges, status, group, story points as node weight; a second version `f1-dag-v2` one change later | 10 / 16 |
| `f2-undirected` | U · X · N · Q | two triangles joined by a bridge, a pendant leaf, a path of three, an isolated node | 11 / 10 |
| `f3-cycles` | D · X · L · Q, multigraph | a 3-cycle feeding a 2-cycle with a duplicated edge; a chain; an isolated node | 9 / 9 |
| `f4-weighted` | U · C · L · W | a hub with two concept triangles, a paper triangle with a heavy pendant, a memo bridging them | 10 / 13 |

Small enough that every answer is a hand computation a reviewer can repeat.

## 3. The algebra

Types: `Graph` (a canonical model), `NodeSet`, `EdgeSet`, `Path`, `Table` (one row per bound element), `Scalar`, `Bool`, `Diff`, `[Graph]`. Every operator is total and pure; a graph-valued result is a canonical model again, so it can be drawn, listed, or queried further. That closure is what makes nesting free: no query in the corpus needed a construct beyond composing the operators below.

| Family | Operators | Notes |
|---|---|---|
| Selectors | `nodes(G, p)`, `edges(G, p)`; `deg`, `indeg`, `outdeg`, `wdeg`; label and property access on nodes and on an edge's endpoints | `p` is any predicate; an absent property compares false |
| Neighbourhood and reach | `N(v, dir)`, `reach(G, S, dir, depth, kind)` → distances; `closure` = unbounded reach | `dir ∈ {out, in, any}`; on an undirected graph all three are `any` |
| Set algebra | `∪`, `∩`, `\`, membership | on node sets and edge sets alike |
| Quantifiers | `all`, `any`, `none` over a set with a predicate | |
| Aggregates | `count`, `sum`, `max`, `min`, nearest-rank `percentile`, `top k by`, `group by`, `for each` → `Table` | ties by id with numeric collation, stated once |
| Structure | `components` (weak), `scc`, `articulation points`, `bridges`, `cycle edges`, `duplicate edges`, `mutual edges` | all linear in n + m |
| Paths | `shortest path` (weight, or hops when unweighted), `simple paths` with a length bound and an avoided predicate, `critical path` (longest path in a DAG by node weight) | |
| Centrality, cores, trees, motifs, facts | `betweenness`, `k-core`, `mst` (forest when disconnected), `triangles`, `diameter` (null when disconnected, per component always), `is acyclic / connected / bipartite / tree` | |
| Constructors | `G[S]` induced, `G{E}` edge-induced, `closure graph` (depth on each node), `quotient by key` (members, within-class and crossing counts) | results are graphs |
| Sets of graphs | `diff(G₁, G₂)` (nodes and edges added, removed, changed), `join on id where key differs` | the version is part of the model's metadata |

Laws the evaluator respects and a product interpreter must keep: `G[S]` is monotone in `S`; `closure(closure(S)) = closure(S)`; `components` partition `V`; on an undirected graph `indeg = outdeg = deg` and `reach(·, out) = reach(·, in)`; `quotient` preserves `|V|` as the sum of member counts and `|E|` as within plus crossing counts; `diff(G, G)` is empty and `diff` is antisymmetric in added/removed.

Two conventions the corpus forced the language to state, because a human and a machine chose differently until it did:
- **Ties on "heaviest" go to the lowest edge index** (q18). Any deterministic rule would do; it has to be written down.
- **A critical path ends at the last node that adds weight** (q26): trailing zero-weight nodes are not on it, even though a path through them weighs the same.

## 4. Hand against machine

| Query | Hand | Machine | Who was right | Why |
|---|---|---|---|---|
| q1 sources on f1 | `C, G` | `C` | machine | B depends on G, so G has an incoming edge; the hand forgot an edge added late in the fixture's design |
| q18 heaviest edge for F and E3 | lowest-index tie | out-before-in tie | hand (the helper was wrong) | the test helper walked incident edges out-then-in and broke the declared tie rule |
| q19 heavy edges between papers on f4 | 3 edges | 4 edges | machine | L is a paper too, and L–p2 weighs 12 |
| q26 critical path on f1 | `…D, H, E1` | `…D, H` | neither: a convention was missing | both weigh 20; the rule above was adopted |
| q35 diameter of f3's big component | 4 | 3 | machine | the hand walked the arrows P→Q→R→S→T; a diameter is on the underlying undirected graph, where R→P gives P–R–S–T |

Thirty agreed on the first run; after the five adjudications, 35 of 35. The fixture files are unchanged; only expectations (and one test helper) moved, each with the reason beside it in the test.

## 5. Three textual surfaces, compared on the corpus

| | A. GQL patterns + algebra keywords | B. Pipeline | C. Rule form (Datalog-like) |
|---|---|---|---|
| Example (q28) | `nodes where status = 'TO DO' and any(closure(it, out, kind = dependency), status = 'NO GO')` | `nodes \| where status = 'TO DO' \| where closure(out, kind = dependency) \| any status = 'NO GO'` | `blocked(X) :- node(X, status, 'TO DO'), dep*(X, Y), node(Y, status, 'NO GO').` |
| Reads like graph theory | yes: `G[S]`, `N⁺`, `closure`, `quotient` are words of the algebra | partly: operators are stages, not expressions | no: everything is a relation |
| Nesting | natural (an expression is a value) | awkward past one level | natural but verbose |
| Algorithms (q8, q21, q25, q29) | keywords: `articulation points of G`, `mst of G` | stages: `\| articulation` | must be written as rules or imported as built-ins, which breaks the model |
| Motifs (q33) | `match (a)-[:child]->(e), (b)-[:child]->(e) where a.group <> b.group` borrowed from GQL | needs a join stage | native |
| Written unaided by a model | good: close to GQL, which is in every training set | good | poor: the recursion is error-prone |
| Parse and check | an expression grammar with a static type per operator (set, graph, scalar) | trivial | needs stratification checks |
| Verdict | **recommended** | sugar for chains (`a \| b` as `b(a)`) | rejected for the product; kept as the reference semantics for reach and closure |

Surface A, with B's pipe as sugar, is the recommendation. Its 35 queries:

```
-- nodes
q1   sources := nodes where indeg = 0 ; sinks := nodes where outdeg = 0
q2   nodes where label starts with 'ADR-' and deg >= 5
q3   top 10 of nodes by wdeg
q4   nodes where deg = 0
q5   reach({G}, out, depth <= 3)                        -- a distance per node
q6   anc := closure({A}, in) ∩ closure({H}, in) ; nearest := argmin anc by dist(it, A) + dist(it, H)
q7   nodes where status = 'DONE' and any(N⁻(it), status <> 'DONE')
q8   articulation points of G
-- edges
q9   edges where source.group <> target.group
q10  p := percentile(weight of edges, 90) ; edges where weight > p
q11  cycle edges of G
q12  bridges of G
q13  edges where relation = 'depends' and target.status = 'NO GO'
q14  duplicate edges of G
q15  mutual edges of G ; edges \ mutual edges of G
-- nodes and edges together
q16  for each v in nodes where status = 'IN PROGRESS':
       edges where source = v and kind = 'dependency' and target.status <> 'DONE'
q17  nodes where deg < 3 and wdeg > 10
q18  for each v in nodes: argmax incident(v) by weight         -- ties: lowest edge index
q19  edges where weight > 5 and source.type = 'paper' and target.type = 'paper'
-- subgraphs with a property
q20  components of G ; component of G containing X
q21  scc of G where count >= 2
q22  shortest path A to B                                  -- by weight, or hops when unweighted
q23  closure graph of {C} out kind = 'dependency'           -- nodes carry depth
q24  kcore 2 of G
q25  mst of G
q26  critical path of G by weight
q27  quotient of G by group
-- nested
q28  nodes where status = 'TO DO' and any(closure(it, out, kind = 'dependency'), status = 'NO GO')
q29  for each c in components of G where count > 5: argmax c by betweenness of G[c]
q30  epics := nodes where type = 'epic'
     items(e) := closure({e}, in, kind = 'child') where type <> 'epic'
     epics where status <> 'DONE' and count(items(it)) > 0 and all(items(it), status in ['DONE', 'NO GO'])
     join f1@1, f1@2 on id where status differs
q31  diff f1@1 f1@2
q32  simple paths C to D maxlen 3 avoiding (status = 'NO GO')
q33  triangles of G ; match (a)-[:child]->(e), (b)-[:child]->(e) where a.group <> b.group return e
q34  sinks := nodes where outdeg = 0 ; nodes where it ∉ sinks and none(closure({it}, out), it ∈ sinks)
q35  is acyclic G ; is connected G ; is bipartite G ; is tree G ; count(components of G) ; diameter of G
```

`it` is the bound element inside a predicate; `{X}` is a singleton set; `f1@2` is a source at a version. Nothing modifies a graph.

## 6. Budget

Costs on a view of n nodes and m edges (the server already caps a view at 1,000 nodes), and the caps an interpreter would enforce on untrusted input:

| Operator | Cost | Cap |
|---|---|---|
| selectors, reach, closure, components, scc, articulation, bridges, cycle edges, quotient, diff, k-core | O(n + m) (k-core O(k(n + m)) peeled naively) | the view cap |
| shortest path, mst | O(m log n) | the view cap |
| critical path | O(n + m) on a DAG; refused with the cycle named otherwise | |
| triangles | O(m · Δ) | the view cap |
| betweenness | O(n · m) | n ≤ 1,000: about 5·10⁷ steps on the densest view today |
| diameter | O(n (n + m)) | same |
| simple paths | exponential in the length bound | `maxlen ≤ 8`, at most 1,000 paths returned |
| whole program | | a step budget and a result-size cap, a time limit, no I/O, no side effects |

## 7. What follows (the PO decides)

1. The surface: A, with the pipe as sugar, pending the PO's choice.
2. **Interpreter in the query layer** (`server/graph/query.mjs`): the algebra as the typed core, the surface parsed on the server, results as canonical models or tables; the knowledge graph's filter and search become two programs.
3. **The surfaces on the widgets**: a query box on the dependency graph (MOS-282) and the item subgraph (MOS-320); the epic tree is q30 drawn with the layered layout (MOS-345).
4. **The agent-facing tool**: the language and the text twin as one MCP tool, so an agent can ask the graph a question and read the answer.
5. The evaluator is discarded once the interpreter exists; the fixtures and the corpus test move with it as its acceptance suite.
