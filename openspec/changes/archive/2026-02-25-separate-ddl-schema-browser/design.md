## Context

Currently, the frontend has a single "Run" button that sequentially executes all DDL from the schema editor, then the query. Re-running produces `Temporary table already exists` errors because `CREATE TABLE` is not idempotent. Users have no way to see what tables exist in their session.

The backend already maintains per-session `TableEnvironment` instances (batch + streaming) with Flink catalog support. Flink's catalog API provides `listTables()` and resolved schema introspection, which we can expose through a new endpoint.

## Goals / Non-Goals

**Goals:**
- Eliminate "table already exists" errors when re-running a fiddle
- Give users explicit control: "Build Schema" for DDL, "Run Query" for queries
- Show registered tables and their columns in a browsable panel
- Refresh the schema browser after DDL execution

**Non-Goals:**
- Editing table definitions inline from the schema browser
- Supporting `ALTER TABLE` or other schema mutation beyond create/drop
- Schema browser for system catalogs or built-in functions
- Persistent schema across sessions (session-scoped only)

## Decisions

### 1. Idempotent DDL via DROP IF EXISTS + CREATE

**Decision**: Before executing each `CREATE TABLE` statement, automatically prepend a `DROP TABLE IF EXISTS` for the same table name. Parse the table name from the DDL using regex.

**Rationale**: Flink SQL does not support `CREATE OR REPLACE TABLE` for connector-backed tables. The `DROP IF EXISTS` + `CREATE` pattern is the only reliable idempotent approach. Parsing the table name from `CREATE TABLE <name>` is straightforward.

**Alternatives considered**:
- `CREATE TEMPORARY TABLE IF NOT EXISTS` — Flink does not support this syntax
- Session reset before DDL — too destructive, loses other state
- Client-side tracking of created tables — fragile, can desync

### 2. New GET /api/sessions/{id}/tables endpoint

**Decision**: Add a REST endpoint that returns a list of tables with their column metadata by querying the session's `streamEnv` catalog.

**Response shape**:
```json
{
  "tables": [
    {
      "name": "orders",
      "columns": [
        { "name": "order_id", "type": "INT" },
        { "name": "product", "type": "STRING" }
      ]
    }
  ]
}
```

**Rationale**: Use `streamEnv` (not `batchEnv`) since DDL is synced to both environments — either would work, but streaming is the default mode. Use Flink's `tableEnv.from(tableName).getResolvedSchema()` which returns column names and data types.

### 3. Two-button UI: "Build Schema" + "Run Query"

**Decision**: Replace the single "Run" button with two buttons:
- **"Build Schema"** (secondary style): Executes DDL from the schema editor, refreshes the schema browser, shows success/error status
- **"Run Query"** (primary blue): Executes only the query editor contents, renders results

**Rationale**: Matches SQL Fiddle's proven UX pattern. Users typically set up schema once and iterate on queries. Primary visual emphasis on "Run Query" since that's the more frequent action.

### 4. Schema browser as collapsible left sidebar

**Decision**: Add a narrow collapsible panel on the left side showing a tree of table names. Clicking a table expands to show its columns with types. Panel refreshes automatically after "Build Schema" succeeds.

**Rationale**: A sidebar doesn't compete with editor space when collapsed. Tree structure is familiar from database IDE tools. Auto-refresh after DDL keeps it in sync.

## Risks / Trade-offs

- **[DROP + CREATE resets table data]** → Acceptable for a fiddle where `datagen` recreates data on each query. Document this behavior.
- **[Table name regex may miss edge cases]** → Use a simple regex for `CREATE [TEMPORARY] TABLE [IF NOT EXISTS] <name>`. Quoted identifiers with backticks need handling.
- **[Schema browser shows stale state if DDL run from query panel]** → Mitigate by also refreshing after any successful execute, or add a manual refresh button.
