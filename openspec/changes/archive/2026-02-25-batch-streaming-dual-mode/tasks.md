## 1. Mode Enum

- [x] 1.1 Create `com.flinksqlfiddle.execution.ExecutionMode` enum with values `BATCH` and `STREAMING`. Acceptance: enum compiles and is usable in execution requests.

## 2. Mode-Aware Execution

- [x] 2.1 Modify `SqlExecutionService.execute()` to accept an `ExecutionMode` parameter and select the appropriate `TableEnvironment` from the `FlinkSession`. Acceptance: BATCH mode uses batchEnv, STREAMING mode uses streamEnv.
- [x] 2.2 Implement DDL detection: check if the parsed SQL is a DDL statement (CREATE TABLE, CREATE VIEW, DROP TABLE, DROP VIEW). Acceptance: DDL statements are correctly identified.
- [x] 2.3 Implement DDL sync: when a DDL statement is detected, execute it on both batch and streaming environments in the session. Acceptance: CREATE TABLE in streaming mode makes the table available in batch mode.

## 3. RowKind Annotation

- [x] 3.1 Map `Row.getKind()` to display strings: `INSERT` → `+I`, `UPDATE_BEFORE` → `-U`, `UPDATE_AFTER` → `+U`, `DELETE` → `-D`. Include in `QueryResult.rowKinds`. Acceptance: streaming aggregation results contain `-U` and `+U` entries.
- [x] 3.2 Verify that batch mode results always have `+I` row kinds. Acceptance: batch GROUP BY query returns only `+I` kinds.
