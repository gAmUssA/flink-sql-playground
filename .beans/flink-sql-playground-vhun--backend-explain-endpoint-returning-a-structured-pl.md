---
# flink-sql-playground-vhun
title: 'Backend: EXPLAIN endpoint returning a structured plan'
status: completed
type: task
priority: normal
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T18:29:18Z
parent: flink-sql-playground-ip4e
---

- [x] `POST /api/sessions/{id}/explain` taking the query text
- [x] Run `EXPLAIN CHANGELOG_MODE, PLAN_ADVICE` in the session's TableEnvironment (through the collect sink for queries; ADR 0004)
- [x] Parse into nodes {id, operator, details, changelogMode, stateful, inputs[]} + advice[]
- [x] Security: EXPLAIN goes through SqlSecurityValidator like execute; tests for EXPLAIN INSERT into a forbidden connector
- [x] Unit tests for the parser on plans from every shipped preset (examples.js); smoke test against the MiniCluster

## Summary of Changes

`ExecutionResource#explain`, `SqlExecutionService#explain` (collect-sink planning, INSERT/statement-set only, CTAS/DDL refused, planner errors -> 400 INVALID_SQL), `execution/plan/PlanParser` + records. Tests: PlanParserTest (11), ExecutionResourceTest explain cases, ExplainSmokeTest (13, every preset via dumpPresets).
