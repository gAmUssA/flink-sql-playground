---
# flink-sql-playground-e6yy
title: Teach the streaming model visually
status: todo
type: epic
priority: high
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T18:06:36Z
---

Three features that make the playground show *why* Flink behaves the way it does, not just *what* it outputs. Proposed 2026-11-22.

- Real job graph from EXPLAIN (replaces the regex-faked Graph tab)
- Watermark timeline (event time vs watermark, windows closing, late records dropped)
- Embed mode for shared fiddles (runnable Flink SQL in blogs, docs, slides)

Suggested order: EXPLAIN graph first (fixes something misleading today; the watermark timeline can reuse its plan data), embed mode any time (independent, cheapest).
