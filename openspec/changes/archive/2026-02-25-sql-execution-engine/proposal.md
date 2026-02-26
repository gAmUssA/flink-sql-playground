## Why

Raw `TableEnvironment.executeSql()` calls can hang indefinitely on unbounded queries and produce unlimited result sets. The execution engine wraps SQL execution in a `CompletableFuture` with a 30-second timeout, enforces a 1000-row collection limit, and handles job cancellation on timeout. References blueprint section: "Execution model."

## What Changes

- Create `SqlExecutionService` that validates SQL (via `SqlSecurityValidator`), executes it on a session's `TableEnvironment`, and collects results
- Wrap execution in `CompletableFuture` with 30-second timeout
- Limit result collection to 1000 rows
- Cancel Flink jobs on timeout via `TableResult.getJobClient().cancel()`
- Create `QueryResult` model with columns, rows, row count, execution time, and `RowKind` annotations

## Capabilities

### New Capabilities
- `query-execution`: Timeout-bounded SQL execution with row limits, job cancellation, and structured result model

### Modified Capabilities

## Impact

- **Code**: New `com.flinksqlfiddle.execution.SqlExecutionService` and `com.flinksqlfiddle.execution.QueryResult`
- **Dependencies**: Depends on `SqlSecurityValidator` and `SessionManager`
- **Runtime**: Each query runs in a separate thread via `CompletableFuture`
