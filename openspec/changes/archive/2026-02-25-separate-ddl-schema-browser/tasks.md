## 1. Backend — Table Introspection Endpoint

- [x] 1.1 Create `TableInfo` and `ColumnInfo` DTOs in `api/dto/` for the table introspection response (`tables: [{name, columns: [{name, type}]}]`). Acceptance: DTOs compile with correct JSON shape.
- [x] 1.2 Add `listTables(FlinkSession session)` method to `SqlExecutionService` that calls `streamEnv.listTables()` and `streamEnv.from(tableName).getResolvedSchema()` on the planner thread. Acceptance: returns list of TableInfo with column metadata.
- [x] 1.3 Add `GET /api/sessions/{sessionId}/tables` endpoint to `SessionController` that calls the new service method. Acceptance: returns 200 with tables JSON, 404 for invalid session.

## 2. Backend — Idempotent DDL Execution

- [x] 2.1 Add a `makeIdempotent(String sql)` helper method to `SqlExecutionService` that parses `CREATE [TEMPORARY] TABLE <name>` and prepends `DROP TABLE IF EXISTS <name>`. Acceptance: regex handles backtick-quoted and unquoted table names.
- [x] 2.2 Update the DDL execution path in `SqlExecutionService.executeDdlOnBothEnvironments()` to call `makeIdempotent()` before executing each DDL statement. Acceptance: running the same DDL twice produces no error.
- [x] 2.3 Write a unit test for `makeIdempotent()` covering plain names, backtick-quoted names, `CREATE TEMPORARY TABLE`, and non-CREATE statements (passthrough). Acceptance: all test cases pass.

## 3. Frontend — Separate Build Schema / Run Query Buttons

- [x] 3.1 Replace the single "Run" button in `index.html` with "Build Schema" (secondary) and "Run Query" (primary) buttons. Acceptance: two buttons visible in controls toolbar, old "Run" button removed.
- [x] 3.2 Implement `buildSchema()` function in `app.js` that sends only schema editor DDL statements to the execute endpoint, then refreshes the schema browser. Acceptance: clicking "Build Schema" executes DDL and shows success/error status.
- [x] 3.3 Refactor `executeSql()` in `app.js` to become `runQuery()` — executes only the query editor contents (no DDL). Acceptance: clicking "Run Query" executes only the query, results render normally.

## 4. Frontend — Schema Browser Panel

- [x] 4.1 Add schema browser HTML structure to `index.html`: a collapsible left sidebar panel with a toggle button, table list container, and empty state message. Acceptance: panel renders and collapses/expands on toggle click.
- [x] 4.2 Add CSS styles for the schema browser in `style.css`: sidebar layout, tree indentation, column type formatting, collapse animation, and empty state. Acceptance: panel matches dark theme, doesn't break editor layout.
- [x] 4.3 Implement `refreshSchemaBrowser()` function in `app.js` that calls `GET /api/sessions/{sessionId}/tables` and renders table names as expandable tree items with columns. Acceptance: tables and columns display after schema build; empty state shows when no tables.
- [x] 4.4 Wire `refreshSchemaBrowser()` to trigger after successful `buildSchema()` and on page load (for shared fiddles). Acceptance: schema browser stays in sync with session state.
