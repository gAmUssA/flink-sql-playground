---
# flink-sql-playground-qena
title: 'Backend: watermark sidecar stream'
status: todo
type: task
priority: normal
created_at: 2026-11-22T18:06:37Z
updated_at: 2026-11-22T18:06:43Z
parent: flink-sql-playground-it01
blocked_by:
    - flink-sql-playground-vhun
---

- [ ] Identify rowtime column + watermark expr from the EXPLAIN plan
- [ ] Sidecar query: SELECT rowtime, CURRENT_WATERMARK(rowtime) FROM <source>; stream as a new SSE event type
- [ ] Respect ExecutionLimits and the slot budget; cancel with the main query
- [ ] Smoke test on the Watermark Dial preset: tight watermark yields late records, wide yields none
