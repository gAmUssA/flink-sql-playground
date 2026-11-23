---
# flink-sql-playground-5q2j
title: USE db runs in one environment only, so streaming-only view lookups miss
status: todo
type: bug
priority: low
created_at: 2026-11-23T23:35:38Z
updated_at: 2026-11-23T23:35:38Z
parent: flink-sql-playground-e6yy
---

From Bob's adversarial review of #86 (2026-11-24), finding 3. Not reproduced yet.

`SqlExecutionService.isDdl` treats only CREATE/DROP TABLE/VIEW as DDL, so only those run in both environments. A `USE db` (or `USE CATALOG c`) runs in the environment of the current mode only. ADR 0009 keys a streaming-only view by the stream env's current catalog and database (`viewKey`), and the BATCH lookup resolves the name against the batch env's. After `USE db2` in Streaming, a BATCH query on `v` can then answer TABLE_NOT_FOUND instead of STREAMING_ONLY_VIEW. The batch and streaming envs also disagree on where unqualified CREATEs land, which is a wider issue than the marks.

No shipped preset runs USE, so the presets are not affected.

- [ ] Reproduce in a smoke test: USE db2 in Streaming, CREATE a dedup view, then BATCH SELECT and a BATCH CREATE in each mode
- [ ] Decide: sync USE / USE CATALOG to both environments (like DDL), or key lookups by the env that created the view
- [ ] Also from the same review, unchecked: marks surviving DROP DATABASE ... CASCADE and ALTER VIEW ... RENAME TO
- [ ] From Bob's review of the marks fix (finding 4): a temporary streaming-only view over a permanent bounded view of the same name. BATCH resolves the permanent one, so the two modes query different definitions with no STREAMING_ONLY_VIEW answer. Same "the environments diverge" family as USE.
