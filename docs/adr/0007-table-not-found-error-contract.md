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
  at runtime with similar words is not a missing table). For `Object 'x' not found [within 'p']`
  it reads the identifier at Calcite's reported span in the statement, skipping whitespace and
  comments between its parts: `x` is a table only when it is the last part, following the
  written prefix that `p` ends with (`FROM nodb.orders` reports `nodb`, a database). The written
  parts keep their boundaries, which `p` loses: Calcite joins it with unquoted dots, so a database
  named `` `sales.eu` `` renders as `default_catalog.sales.eu`. A span inside the statement that
  holds anything but one dotted name fails closed (no `TABLE_NOT_FOUND`). When the span points
  outside the statement (a view's expanded text), the message alone decides, and only an
  unambiguous `catalog.database` prefix counts.
- `SqlExecutionService` applies it to every planning step: execute (both modes, DDL included),
  the streaming path before the first byte, explain, and the timeline probe's preparation.
- The API answers HTTP 400 with

  ```json
  { "error": "<Flink's message, unchanged>", "code": "TABLE_NOT_FOUND",
    "table": "orders", "path": ["other_db", "orders"], "suggestion": "users" }
  ```

  `table` is the missing table's last name part, unquoted, as the statement spelled it. `path`
  is every part, ending with `table`: as the statement wrote it, or as Flink resolved it
  (`["default_catalog", "other_db", "sink"]` for an INSERT target).
  `suggestion` is present only when Flink offers a "did you mean" (a name that differs in case).
  `error` stays Flink's text, as for every other code, so a client that reads only `error` loses
  nothing; there is no separate `detail` field.
- The frontend never parses the message. It picks the wording from `path` and the schema
  editor (`FlinkEditor.declaredTablePaths`): declared but not built offers **Build Schema and
  run**; not declared says no table has that name. Both sides are compared as qualified names,
  with `default_catalog` and `default_database` prefixes dropped, so `other_db.orders` does not
  match a declared `orders` (building would not create it). Flink's message is shown underneath.
- **Build Schema and run** runs the query it was clicked for. If the query or the mode changed
  while the schema built, or another query is running by then, it builds and does not run, and
  says so in the status bar.

## Consequences

- A Flink upgrade that changes these messages makes detection fall back to the old behavior
  (`INVALID_SQL` or the raw message), never to a wrong hint. `TableNotFoundSmokeTest` runs the
  real shapes on a MiniCluster (plain, qualified, quoted, case mismatch, a CTE, a temporal join's
  versioned side, an INSERT target, a view over a missing table, and the look-alikes that must
  not match); run it after any Flink bump, together with `ExplainSmokeTest`.
- New endpoints that plan user SQL should go through the same planning wrapper, so they answer
  `TABLE_NOT_FOUND` too.

## Addendum: DROP of a missing object is `OBJECT_NOT_FOUND` (2026-11-24)

`DROP [TEMPORARY] TABLE|VIEW` without `IF EXISTS` answered 500 `INTERNAL_ERROR` for a missing
object, or one of the other kind. Measured on the MiniCluster, in both modes: a plain
`ValidationException` (nothing wraps it), worded `Table with identifier '…' does not exist.`,
`View with identifier '…' does not exist.` or `Temporary table or view with identifier '…' does not
exist.` None matches the patterns above, so the catch-all mapped it.

- **A dedicated code, not `TABLE_NOT_FOUND`.** `ObjectNotFoundException` maps to 400
  `OBJECT_NOT_FOUND` with `error` only. `TABLE_NOT_FOUND` makes the UI offer **Build Schema and
  run**; rebuilding cannot make a DROP succeed and could drop a table the build just created (the
  loop ADR 0009 avoided for `STREAMING_ONLY_VIEW`). `app.js` needs no change: any code other than
  `TABLE_NOT_FOUND` renders as "Query failed" with Flink's message. `table-not-found.spec.js` pins
  that, for a name the schema editor declares.
- Detection is the same trust rule: planner validation exceptions only, anchored full-message
  match, and only for a DROP of a table or view that is not `IF EXISTS`
  (`SqlExecutionService.executeDdlOnBothEnvironments`, on the planner thread). Anything else,
  including a runtime failure with similar words, stays 500.
- A view dropped as TABLE, or a table as VIEW, gets a hint after Flink's message:
  `Use DROP [TEMPORARY] VIEW to drop a view.` Flink words that case as a plain "does not exist".
  The hint reads the streaming environment's catalog (it has every object) and is given only for
  an unqualified name, or one qualified with the current catalog and database; otherwise Flink's
  message stands alone.
- A plain `DROP VIEW tv` / `DROP TABLE tt` of a *temporary* object fails differently: `Temporary view
  with identifier '…' exists. Drop it first before removing the permanent view.` It is detected too
  (second anchored pattern), and the hint says `Use DROP TEMPORARY VIEW`. The reverse, `DROP TEMPORARY
  …` of a permanent object, gets `Use DROP VIEW` / `Use DROP TABLE`. `error` carries the matching
  validation exception's own text, even when something wraps it.
- Batch runs first, so a failed DROP leaves both environments as they were.
  `DropMissingSmokeTest` runs the real shapes; run it after a Flink bump.
- Explain and the timeline probe do not plan DDL: they already answer 400 (`NOT_EXPLAINABLE`).
