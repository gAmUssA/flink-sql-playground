---
# flink-sql-playground-xnn1
title: Unknown-table errors should suggest building the schema first
status: completed
type: feature
priority: high
created_at: 2026-11-22T21:46:59Z
updated_at: 2026-11-22T23:26:52Z
---

Reported by Vik, 2026-11-22.

## Problem
A new visitor loads the page and clicks Run Query without clicking Build Schema. The preset's query references tables that don't exist in the session yet, so Flink fails with a raw validation error, e.g. `SQL validation failed. From line 4, column 6 to line 4, column 11: Object 'orders' not found`. That's accurate but unhelpful: the person doesn't know the schema editor has to be built first.

## Goal
When a query (or EXPLAIN / timeline request) fails because a table or view isn't found, the output says so in plain words and points at the fix, e.g.:

> Table `orders` doesn't exist in this session yet. Did you build the schema? Click **Build Schema** (it runs the CREATE TABLE statements on the left), then run the query again.

Keep Flink's original message available underneath for people who want it.

## Notes
- Detect Flink's `Object '<name>' not found` (ValidationException / SqlValidatorException) on the backend and return a dedicated error code (e.g. `TABLE_NOT_FOUND` with the table name), so the frontend doesn't regex English text. Applies to /execute, /execute/stream, /explain (INVALID_SQL today) and /timeline/stream.
- If the name appears in the schema editor's CREATE TABLE/VIEW statements but not in the session, say "build the schema"; if it isn't declared anywhere, say "no table named X — declare it in the schema editor" (likely a typo). The editor's parseCreateTables already knows the declared names.
- Consider an action button in the error state: **Build Schema and run** (builds, then reruns the query).
- Also covers: the Job Graph and Timeline tabs opened before building the schema (they show the same raw error today).
- Tests: unit test for the error mapping, e2e for the first-visit flow (load page → Run Query → helpful message + button), phone layout, contrast.

- [x] Backend: TABLE_NOT_FOUND error code with the table name on all four endpoints
- [x] Frontend: friendly message + Flink's original detail, Build Schema and run action
- [x] Declared-but-not-built vs not-declared wording
- [x] Job Graph / Timeline empty states use it too
- [x] Tests (unit, e2e desktop + phone)


## Summary of Changes

- Backend: `TableNotFoundException.detect` maps Flink's missing-table errors (Calcite's `Object 'x' not found [within 'p']`, `Cannot find table ... in any of the catalogs`, `Tables or views with the identifier ... doesn't exist`) to HTTP 400 `TABLE_NOT_FOUND` with `table`, `path` and Flink's `suggestion`, on execute (both modes, DDL), the stream, explain and the timeline probe. It reads the identifier at Calcite's span in the statement (comments between parts skipped, quoted dots kept), so a missing database or column is never reported as a missing table; an ambiguous span fails closed. ADR 0007 records the contract.
- Frontend: the Table, Job Graph and Timeline views explain a missing table. Declared in the schema editor but not built offers **Build Schema and run**; not declared, a case mismatch, or the same name in another database each get their own wording. Flink's message stays underneath. Names are compared qualified (`other_db.orders` is not the declared `orders`).
- Build Schema and run runs the query and mode it was clicked for: an edit, a mode switch or another running query during the build means it only builds, says so, and redraws the button.
- Rebuilding a schema drops and recreates its views too (`dropStatementFor`), so a retry after a partial build gets past them.
- Tests: unit (`TableNotFoundExceptionTest`, `SqlExecutionServiceTest`, resource tests), MiniCluster smoke (`TableNotFoundSmokeTest`), node (`declaredTablePaths`), Playwright e2e on desktop and phones, contrast in three themes.
- Copilot's adversarial review (six findings) was fixed on this branch; see the PR comment on #81.
