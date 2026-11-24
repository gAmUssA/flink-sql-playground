---
# flink-sql-playground-akvl
title: DROP of a missing table or view answers 500 INTERNAL_ERROR instead of 400
status: todo
type: bug
priority: low
created_at: 2026-11-24T00:23:33Z
updated_at: 2026-11-24T00:23:33Z
---

Seen on production (31d3ac6, 2026-11-24) while checking #88. Any `DROP [TEMPORARY] TABLE|VIEW` without IF EXISTS whose object is missing, or is the other kind, answers HTTP 500 `INTERNAL_ERROR`:

- `DROP TEMPORARY TABLE nope` → 500 "Temporary table or view with identifier 'default_catalog.default_database.nope' does not exist."
- `DROP TEMPORARY TABLE v` where `v` is a view → the same 500.

It is a user mistake, so it should be a 400 with a code the UI can explain, like TABLE_NOT_FOUND (ADR 0007). Not caused by #88: it happens for plain bounded tables and views. The exception falls through to the catch-all in `GlobalExceptionHandler` (line ~119); find which Flink exception type carries it (probably ValidationException wrapped in something the handler does not unwrap).

- [ ] Smoke test: DROP of a missing table, a missing view, and a view dropped as TABLE, in both modes → 400
- [ ] Map it in GlobalExceptionHandler; say "use DROP VIEW" when the object is a view
- [ ] Check the editor/UI shows the message, not "internal error"
