---
# flink-sql-playground-qena
title: 'Backend: watermark sidecar stream'
status: completed
type: task
priority: normal
created_at: 2026-11-22T18:06:37Z
updated_at: 2026-11-22T19:46:13Z
parent: flink-sql-playground-it01
blocked_by:
    - flink-sql-playground-vhun
---

- [x] Identify rowtime column + watermark expr (sources from the EXPLAIN plan, rowtime + watermark from the catalog: push-down hides WatermarkAssigner; ADR 0005)
- [x] Sidecar query: SELECT rowtime, CURRENT_WATERMARK(rowtime) FROM <source>; stream as a new SSE event type
- [x] Respect ExecutionLimits and the slot budget; cancel with the main query
- [x] Smoke test on the canonical Watermark Timeline preset (replaces the Watermark Dial idea): tight watermark yields late records, wide yields none

## Summary of Changes

TimelineService + TimelineResource (POST /timeline/stream, NDJSON meta/tick/end), WindowSpec parsed from the plan. Tests: WindowSpecTest (4), TimelineResourceTest (4), TimelineSmokeTest (5: tight watermark drops, 11s drops none, no event time, LTZ + join, forbidden SQL).
