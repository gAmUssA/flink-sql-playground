---
# flink-sql-playground-xnn1
title: Unknown-table errors should suggest building the schema first
status: in-progress
type: feature
priority: high
created_at: 2026-11-22T21:46:59Z
updated_at: 2026-11-22T22:53:44Z
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
