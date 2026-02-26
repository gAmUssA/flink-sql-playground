## Why

Running a fiddle twice produces `Temporary table already exists` errors because the frontend always re-executes DDL from the schema editor before running the query. Users must manually clear the session or edit DDL to avoid this. Additionally, users have no visibility into which tables already exist in their session, forcing them to remember or re-read the schema panel. As described in the blueprint's UX model (inspired by SQL Fiddle's "Build Schema" / "Run SQL" separation), DDL application and query execution should be distinct actions.

## What Changes

- **Separate DDL and query execution into distinct buttons**: Replace the single "Run" button with "Build Schema" (applies DDL, drops-and-recreates tables if needed) and "Run Query" (executes only the query editor contents)
- **Add a schema browser panel**: New collapsible panel showing tables currently registered in the session's `TableEnvironment`, with column names and types for each table
- **Add a backend endpoint for table introspection**: New API to list tables and their schemas from the session's catalog
- **Handle DDL idempotency**: Use `CREATE OR REPLACE` or `DROP IF EXISTS` + `CREATE` to prevent "already exists" errors on re-run

## Capabilities

### New Capabilities
- `schema-browser`: Panel displaying existing tables and their column structure from the session catalog
- `ddl-query-separation`: Separate buttons and execution paths for DDL (schema setup) vs DQL/DML (queries)

### Modified Capabilities
<!-- No existing spec-level requirement changes -->

## Impact

- **Frontend**: `index.html` (new panel + buttons), `app.js` (split execution logic, new API calls), `style.css` (schema browser styles)
- **Backend API**: New `GET /api/sessions/{id}/tables` endpoint returning table names and column metadata
- **Backend service**: `SqlExecutionService` updated for idempotent DDL handling
- **No new dependencies** — uses existing Flink catalog introspection APIs (`listTables()`, `from(tableName).getResolvedSchema()`)
