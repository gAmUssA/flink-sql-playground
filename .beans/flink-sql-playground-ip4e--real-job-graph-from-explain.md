---
# flink-sql-playground-ip4e
title: Real job graph from EXPLAIN
status: in-progress
type: feature
priority: high
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T18:12:31Z
parent: flink-sql-playground-e6yy
---

## Problem
The Graph tab is fake. `deriveJobNodes()` (src/main/resources/META-INF/resources/js/app.js ~L574) regex-matches the query text and always draws Source → one operator → Sink. `renderJobGraph()` (~L1021) puts the same changelog counts on every node. A JOIN with a GROUP BY shows only GroupAggregate; a CTE or subquery source shows the wrong table.

## Goal
Run `EXPLAIN CHANGELOG_MODE, PLAN_ADVICE <query>` on the backend and render the real optimized physical plan:
- every operator, in DAG shape (joins have two inputs)
- each operator's changelog mode (`[I]`, `[I,UB,UA]`, `[I,UB,UA,D]`), colour-coded to match the changelog tab's +I/-U/+U/-D
- stateful operators flagged (GroupAggregate, Join, Rank, Deduplicate, SinkUpsertMaterializer)
- Flink's PLAN_ADVICE text shown under the graph

This is what explains *why* a query emits retractions: the changelog tab shows the effect, the graph shows the cause.

## Notes
- EXPLAIN only plans; no job is submitted, so it's cheap and needs no MiniCluster slot.
- Run it with the same session TableEnvironment so the user's DDL is visible.
- `SqlSecurityValidator` doesn't block EXPLAIN today, but check that EXPLAIN of a forbidden statement can't bypass the connector allowlist (EXPLAIN INSERT INTO a forbidden sink, EXPLAIN of CREATE ... AS).
- Static Pages build has no backend in the stub: e2e tests need a stub plan in `src/test/e2e/stub-api.js`.
- Plan text format: parse the indented `== Optimized Physical Plan ==` section, or use `EXPLAIN JSON_EXECUTION_PLAN` for structure and merge in changelog modes. Pick one and document why.
- Per-node row counts are not available from EXPLAIN; drop them or show only source/sink counts honestly.
