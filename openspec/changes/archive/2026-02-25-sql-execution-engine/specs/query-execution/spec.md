## ADDED Requirements

### Requirement: Validate SQL before execution
The execution engine SHALL validate all SQL through the `SqlSecurityValidator` before passing it to `TableEnvironment.executeSql()`.

#### Scenario: Invalid SQL is rejected
- **WHEN** a user submits `CREATE FUNCTION evil AS 'com.bad.Udf'`
- **THEN** execution SHALL be rejected with a `SecurityException` before reaching the TableEnvironment

### Requirement: Execute SQL with 30-second timeout
The execution engine SHALL wrap SQL execution in a `CompletableFuture` with a 30-second timeout.

#### Scenario: Query completes within timeout
- **WHEN** a bounded SELECT query completes in 5 seconds
- **THEN** the `QueryResult` SHALL be returned with results and `executionTimeMs` set

#### Scenario: Query exceeds timeout
- **WHEN** a query runs for more than 30 seconds
- **THEN** an `ExecutionTimeoutException` SHALL be thrown and the Flink job SHALL be cancelled

### Requirement: Limit result collection to 1000 rows
The execution engine SHALL collect at most 1000 rows from `TableResult.collect()` and indicate if results were truncated.

#### Scenario: Results within limit
- **WHEN** a query produces 50 rows
- **THEN** all 50 rows SHALL be returned and `truncated` SHALL be `false`

#### Scenario: Results exceed limit
- **WHEN** a query produces 5000 rows
- **THEN** only the first 1000 rows SHALL be returned and `truncated` SHALL be `true`

### Requirement: Return structured QueryResult
The execution engine SHALL return a `QueryResult` containing column names, column types, row data, row kinds, row count, execution time in milliseconds, and a truncated flag.

#### Scenario: QueryResult contains column metadata
- **WHEN** a query `SELECT user_id, COUNT(*) AS cnt FROM t GROUP BY user_id` completes
- **THEN** `columnNames` SHALL be `["user_id", "cnt"]` and `columnTypes` SHALL reflect the Flink types

### Requirement: Cancel Flink job on timeout
When a timeout occurs, the execution engine SHALL call `TableResult.getJobClient().get().cancel()` to stop the Flink job.

#### Scenario: Job is cancelled after timeout
- **WHEN** a query times out
- **THEN** the underlying Flink job SHALL be cancelled and resources released
