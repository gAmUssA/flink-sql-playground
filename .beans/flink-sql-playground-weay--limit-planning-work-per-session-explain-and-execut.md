---
# flink-sql-playground-weay
title: Limit planning work per session (/explain and /execute)
status: todo
type: task
priority: low
created_at: 2026-11-22T18:34:18Z
updated_at: 2026-11-22T18:34:18Z
---

From the adversarial review of ip4e (Copilot, 2026-11-22).

Both /execute and /explain plan on the session's single planner thread with no timeout, and a Calcite plan can't be interrupted. /explain takes no MiniCluster slot, so a client can call it in a tight loop or with a deeply nested query and keep that session's planner busy. The impact stays inside that session (one planner thread per session), but it costs server CPU.

- [ ] Per-session rate limit on /explain (and /execute planning), e.g. a token bucket in SessionManager
- [ ] Cap statement complexity cheaply before planning (nesting depth / join count), or a planner time budget that fails the session's next request
- [ ] 429 with a clear code; frontend shows it in the Graph tab
- [ ] Note in ADR 0004
