## ADDED Requirements

### Requirement: Per-request execution mode selection
The execution engine SHALL accept an `ExecutionMode` parameter (`BATCH` or `STREAMING`) per execution request and route the query to the corresponding `TableEnvironment`.

#### Scenario: Batch mode execution
- **WHEN** a user executes a SELECT with mode `BATCH`
- **THEN** the query SHALL run on the session's batch `TableEnvironment`

#### Scenario: Streaming mode execution
- **WHEN** a user executes a SELECT with mode `STREAMING`
- **THEN** the query SHALL run on the session's streaming `TableEnvironment`

### Requirement: DDL synchronization across environments
DDL statements (`CREATE TABLE`, `CREATE TEMPORARY VIEW`, `DROP TABLE`, `DROP VIEW`) SHALL be executed on both the batch and streaming environments in the session, regardless of the selected mode.

#### Scenario: CREATE TABLE synced to both environments
- **WHEN** a user executes `CREATE TABLE t (...) WITH ('connector' = 'datagen')` in streaming mode
- **THEN** the table SHALL be available in both the batch and streaming environments

#### Scenario: DROP TABLE synced to both environments
- **WHEN** a user executes `DROP TABLE t` in batch mode
- **THEN** the table SHALL be removed from both environments

### Requirement: Streaming results include RowKind annotations
When executing in streaming mode, each result row SHALL include a `RowKind` annotation: `+I` (INSERT), `-U` (UPDATE_BEFORE), `+U` (UPDATE_AFTER), or `-D` (DELETE).

#### Scenario: Streaming aggregation shows changelog
- **WHEN** a streaming SELECT with GROUP BY produces updates
- **THEN** result rows SHALL include `-U` and `+U` annotations for updated aggregates

#### Scenario: Batch results have INSERT only
- **WHEN** a batch SELECT with GROUP BY completes
- **THEN** all result rows SHALL have RowKind `+I` (final results only)
