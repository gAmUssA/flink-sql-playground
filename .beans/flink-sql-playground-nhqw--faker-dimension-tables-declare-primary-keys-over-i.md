---
# flink-sql-playground-nhqw
title: Faker dimension tables declare PRIMARY KEYs over insert-only data
status: in-progress
type: bug
priority: normal
created_at: 2026-11-22T21:44:27Z
updated_at: 2026-11-23T20:40:00Z
parent: flink-sql-playground-e6yy
---

From Copilot's Flink SQL review (2026-11-22, PR for the timeline zoom + preset audit), finding 1.

E-Commerce Streaming and Brewmaster Monitoring declare PRIMARY KEY (...) NOT ENFORCED on faker tables that emit INSERT rows only, with duplicate keys (e.g. 50 rows over 5-10 ids). The key is an assertion Flink trusts: regular joins can treat each new insert as the one row for that key without retracting earlier join results, so the output is plausible but not upsert semantics.

- [x] Decide: drop the PRIMARY KEYs (dimension rows become events, joins keep all), or derive keyed changelogs with a deduplication view, or make the faker connector emit upserts. Measure first: a ROW_NUMBER 'latest per key' view drops out-of-order rows (it left 35-50% of Temporal Join txns without a rate, so #80 reverted it there)
- [x] Keep the presets' comments truthful about what 'dimension' means here
- [x] Check the Job Graph's changelog modes before and after

## Resolution (2026-11-23)

Measured on a MiniCluster, first 1000 result rows (ADR 0009 has the table):

- PRIMARY KEY on the insert-only faker table (as shipped): 251 of 385 E-Commerce orders and 205 of 368 Brewmaster windows were shown more than once, all `+I`.
- No PRIMARY KEY: worse, 230 of 270 and 178 of 185.
- Latest row per key, `ROW_NUMBER` over `PROCTIME()`: 0 duplicates, real `-U`/`+U`. Processing time has no disorder, so nothing is dropped (the #80 problem was event time).

Fix:

- Dimensions are now `<name>_updates` faker tables plus a view named after the dimension. The queries are unchanged, so `t.` autocomplete still works.
- Job Graph: each join's dimension input is a `Rank` (rank 1) emitting `I,UB,UA`, where the join used to trust a declared unique key over `[I]`.
- Views over unbounded tables used to fail Build Schema in the batch environment. They are now created for Streaming only, and BATCH answers `STREAMING_ONLY_VIEW`.
- `DimensionPresetSmokeTest` replays both presets' changelogs. ADR 0009 and an AGENTS.md rule cover it.
