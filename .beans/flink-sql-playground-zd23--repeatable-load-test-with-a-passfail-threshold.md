---
# flink-sql-playground-zd23
title: Repeatable load test with a pass/fail threshold
status: todo
type: task
priority: normal
created_at: 2026-11-25T08:22:46Z
updated_at: 2026-11-25T08:22:46Z
---

`scripts/load-test.mjs` (added with the talk-capacity PR) creates N sessions and runs DDL, batch and stream queries, printing p50/p95/max per request kind and error codes. Make it a documented check: a Gradle or npm task, a threshold (no timeouts, p95 batch under a limit at the production session cap), and a line in AGENTS.md. Depends on the hang bug being fixed.

## Acceptance
- One command runs it against a local build and exits non-zero over the threshold.
- Documented in AGENTS.md.
