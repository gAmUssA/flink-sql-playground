# 0004. Draw the job graph from Flink's EXPLAIN, planned through the collect sink

## Status

accepted

## Date

2026-11-22

## Context

The Job Graph tab was invented in the browser. `deriveJobNodes()` matched the query text with
regular expressions and always drew three boxes: one source, one operator guessed from
keywords (`GROUP BY` meant GroupAggregate, `JOIN` meant Join), and the sink. Every node showed
the same changelog count. A join with an aggregate showed one operator, a CTE showed the wrong
source, and nothing explained why a query emits retractions. The playground teaches
streaming SQL, so a graph that is plausible but wrong is worse than none.

Flink can describe the real plan without running anything. The questions were which API, which
output format, and which plan.

Options considered for the format:

- `EXPLAIN ... JSON_EXECUTION_PLAN`: structured JSON, but it describes the stream graph after
  operator chaining. It has no changelog modes, no plan advice, and its node names carry
  internal ids (`GroupAggregate[10]`).
- The text `== Optimized Physical Plan ==` section with `CHANGELOG_MODE` and `PLAN_ADVICE`:
  one operator per line with every attribute, its changelog mode (`changelogMode=[I,UB,UA]`)
  and links to the advice text. It is not a stable API, but its tree format (`+- `, `:- `,
  `[#N]` / `Reused`) has stayed the same since Flink 1.x.

Options considered for which plan:

- `TableEnvironment.explainSql(select)`: plans the query without a sink. A group aggregate
  then reports `[I,UA]`, because nothing downstream asks for retractions. The changelog tab,
  fed by the real run, shows `-U` rows. The graph would contradict the results next to it.
- Plan the statement the way `executeSql` runs it: wrap the query in a
  `CollectModifyOperation` (the sink `executeSql` attaches for a SELECT) and call
  `TableEnvironmentInternal.explainInternal`. The aggregate then reports `[I,UB,UA]`, which
  matches what the changelog tab shows.

## Decision

- `POST /api/sessions/{id}/explain` with `{ sql, mode }` (same body as execute) returns an
  `ExplainResult`: operator nodes with their inputs, changelog mode, state kind and advice
  ids; the sink ids; the advice list; and the raw plan text.
- `SqlExecutionService.explain` parses the statement with the session's own parser, on the
  session's planner thread, in the environment of the chosen mode. A query is planned through
  a `CollectModifyOperation`. An INSERT (`SinkModifyOperation`, exact class) and a statement
  set made only of INSERTs are planned as written. A leading EXPLAIN is unwrapped. Everything
  else is refused with 400 `NOT_EXPLAINABLE`: DDL and SHOW have no plan, and CTAS/RTAS
  (subclasses of `SinkModifyOperation`) are refused because planning them goes through table
  creation. Planner validation errors (unknown table, syntax) map to 400 `INVALID_SQL`, not
  to a logged 500.
- The statement goes through `SqlSecurityValidator` first, like execute. Planning submits no
  job and takes no MiniCluster slot. Explaining an INSERT can reach only tables that already
  exist, and those were created through the validated DDL path, so explain can do strictly
  less than execute.
- `PlanParser` reads the text physical-plan section. It is lenient: an attribute list it
  cannot split is kept under `_raw` instead of failing the request. Window property
  references print with an unmatched quote (`slice_end('w$)`), so the parser removes that
  quote first and falls back to quote-blind bracket matching.
- Streaming plans request `CHANGELOG_MODE` and `PLAN_ADVICE`. Batch plans request neither:
  the batch planner throws on `PLAN_ADVICE`, and batch operators have no changelog.
- State is classified per operator: `unbounded` (state grows with the key space: regular
  joins, group aggregates, rank, dedup, `SinkUpsertMaterializer`), `time-bounded` (the
  watermark frees it: window operators, interval and temporal joins), and `pattern` for
  MATCH_RECOGNIZE, because only `WITHIN` bounds it and the plan text does not print `WITHIN`.
- The browser (`js/job-graph.js`) draws sources on top and sinks at the bottom. Exchanges
  become labelled edges (`shuffle · hash[user_id]`). The operators whose inputs are
  append-only but which emit updates are marked "updates start here". There are no per-node
  row counts, because EXPLAIN has none; only the collect sink shows the rows it received.
- The plan is fetched alongside every run, and when the Graph tab opens before a run. The
  newest request wins.

## Consequences

- Easier: the graph is the plan Flink will run. Its changelog chips match the changelog tab,
  and the plan advice appears in the playground.
- Harder: the endpoint depends on internal Flink API (`TableEnvironmentInternal`,
  `CollectModifyOperation`) and on the text plan format. A Flink upgrade can change either.
  `ExplainSmokeTest` guards both: it plans every shipped preset (exported by
  `scripts/dump-presets.mjs` through the Gradle `dumpPresets` task) and fails on an
  unreachable operator, a raw attribute list, or a missing changelog mode, and it checks
  that an aggregate reports `[I,UB,UA]` through the collect sink.
- Later work (the watermark timeline) can reuse the plan to find the rowtime column and the
  window spec instead of matching SQL text.
