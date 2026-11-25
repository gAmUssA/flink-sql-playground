---
# flink-sql-playground-483m
title: Batch query hangs to the 30s timeout after a streaming query on the same session
status: todo
type: bug
priority: high
created_at: 2026-11-25T08:22:46Z
updated_at: 2026-11-25T08:22:46Z
---

Found by `scripts/load-test.mjs` (2026-11-25, local prod build, 4 CPUs emulated, -Xmx1536m). With 8 to 40 concurrent users doing DDL, batch, stream three times each, 3 to 4 batch queries per run hit `408 EXECUTION_TIMEOUT` (30s). The count stays about the same from 8 to 40 users, so it is not capacity. One-round runs at 4 and 8 users are clean, and so is 1 user with 3 rounds.

Re-checked after the load-test script started rejecting stream error frames and a missing end frame (PR 97 review): no stream failures, only batch timeouts (4 at 32 users with -Xmx2048m; 0 at 8 users in that run, so it is intermittent).

Suspect: a batch job submitted after a streaming job on the same session waits for task slots the streaming job still holds. Not confirmed.

## Acceptance
- Reproduce with `node scripts/load-test.mjs http://localhost:9090 8 3` against a local build.
- Find the cause (slot release after a bounded stream ends, cancel on client disconnect, or planner thread).
- Fix, then the same run shows 0 timeouts at 8, 20 and 32 users.
- Test at smoke level.
