---
# flink-sql-playground-akvl
title: DROP of a missing table or view answers 500 INTERNAL_ERROR instead of 400
status: completed
type: bug
priority: low
created_at: 2026-11-24T00:23:33Z
updated_at: 2026-11-24T01:27:13Z
---

Seen on production (31d3ac6, 2026-11-24) while checking #88. Any `DROP [TEMPORARY] TABLE|VIEW` without IF EXISTS whose object is missing, or is the other kind, answers HTTP 500 `INTERNAL_ERROR`:

- `DROP TEMPORARY TABLE nope` → 500 "Temporary table or view with identifier 'default_catalog.default_database.nope' does not exist."
- `DROP TEMPORARY TABLE v` where `v` is a view → the same 500.

It is a user mistake, so it should be a 400 with a code the UI can explain, like TABLE_NOT_FOUND (ADR 0007). Not caused by #88: it happens for plain bounded tables and views. The exception falls through to the catch-all in `GlobalExceptionHandler` (line ~119); find which Flink exception type carries it (probably ValidationException wrapped in something the handler does not unwrap).

- [x] Smoke test: DROP of a missing table, a missing view, and a view dropped as TABLE, in both modes → 400
- [x] Map it in GlobalExceptionHandler; say "use DROP VIEW" when the object is a view
- [x] Check the editor/UI shows the message, not "internal error"

## Resolution

The exception is a plain `ValidationException` (nothing wraps it); its three wordings matched no
`TableNotFoundException` pattern. New `ObjectNotFoundException` (dedicated code `OBJECT_NOT_FOUND`, 400,
no Build offer) is raised for a DROP without IF EXISTS in `SqlExecutionService.executeDdlOnBothEnvironments`,
on the planner thread, with a "Use DROP [TEMPORARY] VIEW/TABLE" hint when the object is of the other kind.
`app.js` needed no change. A latent contrast bug surfaced: the error hint was `#f87171` (2.56:1 on cobalt),
now `var(--op-d)`. Decision recorded as an addendum to ADR 0007.
