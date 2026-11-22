---
# flink-sql-playground-vhun
title: 'Backend: EXPLAIN endpoint returning a structured plan'
status: completed
type: task
priority: normal
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T18:21:49Z
parent: flink-sql-playground-ip4e
---

- [x] `POST /api/sessions/{id}/explain` taking the query text
- [ ] Run `EXPLAIN CHANGELOG_MODE, PLAN_ADVICE` in the session's TableEnvironment
- [ ] Parse into nodes {id, operator, details, changelogMode, stateful, inputs[]} + advice[]
- [ ] Security: EXPLAIN goes through SqlSecurityValidator like execute; tests for EXPLAIN INSERT into a forbidden connector
- [ ] Unit tests for the parser on plans from every shipped preset (examples.js); smoke test against the MiniCluster
