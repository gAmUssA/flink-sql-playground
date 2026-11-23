# 0009. Preset dimension tables are deduplicated views, and such views are Streaming only

## Status

accepted

## Date

2026-11-23

## Context

E-Commerce Streaming and Brewmaster Monitoring joined a stream with faker "dimension" tables that
declared `PRIMARY KEY (...) NOT ENFORCED`. Faker draws a random key for every row, so a key arrives
again and again with new values (`customers`: 50 rows a second over 250 ids). The tables are
insert-only, but Flink trusts a declared key: the join keeps one row per key
(`rightInputSpec=[JoinKeyContainsUniqueKey]`) and, when a new row for a key arrives, appends a
second joined row without retracting the first. Measured on a MiniCluster over the first 1000
result rows:

| Variant | E-Commerce: orders shown more than once | Brewmaster: windows shown more than once |
|---|---|---|
| PRIMARY KEY on the faker table (shipped until now) | 251 of 385 | 205 of 368 |
| No PRIMARY KEY | 230 of 270 | 178 of 185 |
| Latest row per key, `ROW_NUMBER` over `PROCTIME()` | 0 of 268, with 366 `-U`/`+U` pairs | 0 of 272 |

Dropping the key makes it worse: the join then keeps every version. Teaching the faker connector
to emit upserts would diverge from the upstream flink-faker options the connector mirrors.
A `ROW_NUMBER` view that keeps the latest row by **event time** dropped out-of-order rates in the
Temporal Join preset (#80); by **processing time** nothing is out of order, so nothing is dropped.

Views were never used in presets, and they did not work over an unbounded table: Build Schema
runs every CREATE in both the batch and the streaming environment, and the batch planner refuses
`Querying an unbounded table ... in batch mode is not allowed` while validating the view.

## Decision

- A preset dimension fed by faker is an update stream (`<name>_updates`, with
  `proc_time AS PROCTIME()`, no PRIMARY KEY) plus a view named after the dimension that keeps the
  latest row per key:

  ```sql
  CREATE TEMPORARY VIEW tanks AS
  SELECT tank_id, tank_name, ...
  FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY tank_id ORDER BY proc_time DESC) AS rn
        FROM tank_updates)
  WHERE rn = 1;
  ```

  The query keeps joining `tanks t`, so `t.` autocomplete works unchanged (the editor resolves
  view columns, not CTE columns). Flink plans it as a `Rank` (rank 1) emitting `I,UB,UA`, not a
  `Deduplicate`, because the join materializes `proc_time`; the preset comments say Rank.
- A PRIMARY KEY on a table whose source emits repeated keys as inserts is not allowed in presets.
  `DimensionPresetSmokeTest` runs both presets as shipped and replays their changelogs: no key may
  be live twice.
- `SqlExecutionService` creates a `CREATE VIEW` whose batch planning fails with the unbounded-source
  refusal in the streaming environment only, and records the view's name on the `FlinkSession`.
  A BATCH execute that misses such a view answers HTTP 400 with code `STREAMING_ONLY_VIEW`
  ("View 'tanks' reads an unbounded table, so it exists in Streaming mode only. Switch to Streaming
  to query it."), and a BATCH explain answers `NotExplainableException` with the same code, instead
  of `TABLE_NOT_FOUND` (ADR 0007), whose Build Schema and run offer would loop. Any other batch
  error still fails the CREATE. CREATE or DROP of the same name clears the mark; a DROP of a
  streaming-only view runs in the streaming environment only.

## Consequences

- The two presets show real upsert semantics: the Changelog tab carries `-U`/`+U` whenever a
  customer, product, tank or recipe row is replaced, and the Job Graph shows the Rank feeding
  each join.
- Users can write the same deduplication view over their own faker or datagen streams.
- The batch environment no longer mirrors the streaming one exactly: it lacks these views. Only
  the statements named here diverge.
