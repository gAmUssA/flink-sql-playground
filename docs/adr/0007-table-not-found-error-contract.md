# 0007. A missing table is its own API error, detected on the backend

## Status

accepted

## Date

2026-11-23

## Context

A first-time visitor clicks Run Query before Build Schema. Flink answers with
`SQL validation failed. From line 4, column 6 to line 4, column 11: Object 'orders' not found`.
That is accurate and useless to someone who does not know the schema editor has to be built
first. The same text shows up in the Job Graph and Timeline tabs, which plan the query on open.

The frontend could match that English sentence, but it would have to know Calcite's message
shapes (`Object 'x' not found`, `... within 'cat.db'`, `; did you mean 'y'?`), Flink's own
(`Cannot find table ... in any of the catalogs`, `Tables or views with the identifier ... doesn't
exist`), and the ones that look alike and mean something else: a missing column
(`Column 'x' not found in any table`), an unknown alias (`Table 'u2' not found`), a missing
database (`FROM nodb.orders` reports `Object 'nodb' not found`). Those shapes move with Flink
upgrades, and only the backend sees the exception chain and the statement together.

## Decision

- `TableNotFoundException.detect` reads the planner's exception chain, trusting only
  `ValidationException`, `CalciteContextException` and `SqlValidatorException` (a job that fails
  at runtime with similar words is not a missing table). For an unqualified `Object 'x' not
  found` it reads the identifier at Calcite's reported span in the statement: when the statement
  wrote a qualified name there and `x` is its first part, `x` is a catalog or database, not a
  table. When the span points outside the statement (a view's expanded text), the reported name
  stands.
- `SqlExecutionService` applies it to every planning step: execute (both modes, DDL included),
  the streaming path before the first byte, explain, and the timeline probe's preparation.
- The API answers HTTP 400 with

  ```json
  { "error": "<Flink's message, unchanged>", "code": "TABLE_NOT_FOUND",
    "table": "orders", "suggestion": "users" }
  ```

  `table` is the missing table's last name part, unquoted, as the statement spelled it.
  `suggestion` is present only when Flink offers a "did you mean" (a name that differs in case).
  `error` stays Flink's text, as for every other code, so a client that reads only `error` loses
  nothing; there is no separate `detail` field.
- The frontend never parses the message. It picks the wording from `table` and the schema
  editor (`FlinkEditor.parseCreateTables`): declared but not built offers **Build Schema and
  run**; not declared says no table has that name. Flink's message is shown underneath.

## Consequences

- A Flink upgrade that changes these messages makes detection fall back to the old behavior
  (`INVALID_SQL` or the raw message), never to a wrong hint. `TableNotFoundSmokeTest` runs the
  real shapes on a MiniCluster (plain, qualified, quoted, case mismatch, a CTE, a temporal join's
  versioned side, an INSERT target, a view over a missing table, and the look-alikes that must
  not match); run it after any Flink bump, together with `ExplainSmokeTest`.
- New endpoints that plan user SQL should go through the same planning wrapper, so they answer
  `TABLE_NOT_FOUND` too.
