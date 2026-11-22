---
# flink-sql-playground-o3jy
title: 'Frontend: render the plan DAG in the Graph tab'
status: completed
type: task
priority: normal
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T18:34:18Z
parent: flink-sql-playground-ip4e
blocked_by:
    - flink-sql-playground-vhun
---

- [x] Replace `deriveJobNodes()` with a call to the explain endpoint on Run (in parallel with execute; don't delay results)
- [x] Lay out the DAG (two-input joins, multi-sink STATEMENT SETs); keep the existing animated edges while RUNNING
- [x] Changelog-mode chips per node, colours shared with the changelog tab; stateful badge
- [x] PLAN_ADVICE panel under the graph
- [x] Fallback when EXPLAIN fails: show the error, no fake graph
- [x] Phone + landscape layouts (horizontal scroll for wide plans); 4.5:1 contrast
- [x] Stub plan in stub-api.js + Playwright tests (desktop, mobile, landscape)

## Summary of Changes

`js/job-graph.js` renders the plan (exchanges as labelled edges, changelog chips, state, update origins, advice, raw plan). `app.js` fetches /explain on Run and when the tab opens; newest request wins; sink count updates without re-rendering. Tests: job-graph.spec.js (11 x chromium/webkit, incl. XSS + contrast in 3 themes), mobile.spec join-on-phone test, src/test/js/job-graph.test.js (10).
