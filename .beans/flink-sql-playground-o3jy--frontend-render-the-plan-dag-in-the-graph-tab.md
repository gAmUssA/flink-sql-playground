---
# flink-sql-playground-o3jy
title: 'Frontend: render the plan DAG in the Graph tab'
status: in-progress
type: task
priority: normal
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T18:21:49Z
parent: flink-sql-playground-ip4e
blocked_by:
    - flink-sql-playground-vhun
---

- [ ] Replace `deriveJobNodes()` with a call to the explain endpoint on Run (in parallel with execute; don't delay results)
- [ ] Lay out the DAG (two-input joins, multi-sink STATEMENT SETs); keep the existing animated edges while RUNNING
- [ ] Changelog-mode chips per node, colours shared with the changelog tab; stateful badge
- [ ] PLAN_ADVICE panel under the graph
- [ ] Fallback when EXPLAIN fails: show the error, no fake graph
- [ ] Phone + landscape layouts (horizontal scroll for wide plans); 4.5:1 contrast
- [ ] Stub plan in stub-api.js + Playwright tests (desktop, mobile, landscape)
