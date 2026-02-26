## Context

Flink SQL queries against datagen sources are bounded and typically complete in under 10 seconds. However, poorly constructed queries or unbounded sources could run indefinitely. The execution engine must enforce hard limits while providing structured results that include column metadata, row data, and streaming changelog annotations.

## Goals / Non-Goals

**Goals:**
- Validate SQL before execution (via `SqlSecurityValidator`)
- Execute SQL with 30-second timeout via `CompletableFuture`
- Collect up to 1000 rows from `TableResult.collect()`
- Cancel Flink jobs on timeout
- Return structured `QueryResult` with columns, rows, RowKind, execution time

**Non-Goals:**
- Server-Sent Events for streaming results (defer to post-MVP)
- Parallel query execution within a session (one query at a time per session)
- Query result caching

## Decisions

### 1. CompletableFuture for timeout enforcement
**Choice**: Wrap `executeSql()` + `collect()` in `CompletableFuture.supplyAsync()` with `.get(30, SECONDS)`.
**Rationale**: Standard Java concurrency pattern. Clean timeout with `TimeoutException`. On timeout, cancel the future and the Flink job.
**Alternatives**: Separate watchdog thread — more complex, same outcome.

### 2. QueryResult as a simple POJO
**Choice**: `QueryResult` record/class with `List<String> columnNames`, `List<String> columnTypes`, `List<List<Object>> rows`, `List<String> rowKinds`, `int rowCount`, `long executionTimeMs`, `boolean truncated`.
**Rationale**: Clean separation between execution and serialization. The API layer converts this to JSON DTOs.

### 3. Row collection with RowKind tracking
**Choice**: For each `Row` from `collect()`, capture `row.getKind()` (INSERT, UPDATE_BEFORE, UPDATE_AFTER, DELETE) alongside field values.
**Rationale**: Essential for streaming mode to show changelog behavior. Batch mode will only have INSERT kinds.

## Risks / Trade-offs

- **[Thread pool exhaustion]** → Each query uses a thread from `ForkJoinPool.commonPool()`. With max 5 sessions, this is manageable. Could switch to a dedicated executor if needed.
- **[Job cancellation may not be immediate]** → Flink job cancellation is asynchronous. The thread may linger briefly after timeout.
