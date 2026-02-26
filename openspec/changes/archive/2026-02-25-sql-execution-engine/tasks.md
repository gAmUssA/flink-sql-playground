## 1. Result Model

- [x] 1.1 Create `com.flinksqlfiddle.execution.QueryResult` class with fields: `columnNames` (List<String>), `columnTypes` (List<String>), `rows` (List<List<Object>>), `rowKinds` (List<String>), `rowCount` (int), `executionTimeMs` (long), `truncated` (boolean). Acceptance: class compiles.

## 2. Execution Service

- [x] 2.1 Create `com.flinksqlfiddle.execution.SqlExecutionService` as a Spring `@Service` injecting `SqlSecurityValidator`. Acceptance: component scan picks it up.
- [x] 2.2 Implement `execute(TableEnvironment tEnv, String sql)` that validates SQL via `SqlSecurityValidator`, then calls `tEnv.executeSql(sql)`. Acceptance: valid SQL executes, invalid SQL throws SecurityException.
- [x] 2.3 Wrap result collection in `CompletableFuture.supplyAsync()` with `.get(30, TimeUnit.SECONDS)` timeout. SQL execution runs on calling thread (Calcite planner requires thread-local state). On timeout, throw `ExecutionTimeoutException`. Acceptance: a 30+ second query throws ExecutionTimeoutException.
- [x] 2.4 Implement row collection loop: iterate `TableResult.collect()`, capture `Row.getKind()` as RowKind string, extract field values, stop at 1000 rows, set `truncated=true` if more rows exist. Acceptance: 5000-row query returns exactly 1000 rows with truncated=true.
- [x] 2.5 Extract column metadata from `TableResult.getResolvedSchema()` — column names and data type strings. Acceptance: QueryResult.columnNames matches schema.

## 3. Job Cancellation

- [x] 3.1 On `TimeoutException`, call `tableResult.getJobClient().ifPresent(client -> client.cancel())` to stop the Flink job. Acceptance: timed-out jobs are cancelled.

## 4. Exception Classes

- [x] 4.1 Create `ExecutionTimeoutException` in `com.flinksqlfiddle.execution` package. Acceptance: exception is throwable with message.
