## Context

A `TableEnvironment` is locked to its mode at creation time — batch or streaming. The `FlinkSession` already holds both environment types. This change adds the plumbing to select mode per request and keep DDL state synchronized across both environments so users can switch modes without re-entering their schema.

## Goals / Non-Goals

**Goals:**
- `ExecutionMode` enum for clean mode selection
- DDL (CREATE TABLE, CREATE VIEW, DROP) applied to both environments automatically
- Query (SELECT, INSERT INTO) routed to the selected mode's environment
- Streaming results annotated with RowKind changelog markers

**Non-Goals:**
- Automatic mode switching based on query type
- Side-by-side comparison view (frontend concern)

## Decisions

### 1. DDL sync on execution
**Choice**: When a DDL statement is executed, apply it to both the batch and streaming environments in the session.
**Rationale**: Keeps schema state consistent so users can freely toggle between modes. Cost is negligible — DDL is instant.
**Alternatives**: Replay DDL on mode switch — more complex, error-prone if DROP statements are involved.

### 2. ExecutionMode enum
**Choice**: Simple enum `BATCH` / `STREAMING` included in the execution request.
**Rationale**: Clean, type-safe. Maps directly to which `TableEnvironment` to use from the session.

### 3. RowKind as string annotation
**Choice**: Map `RowKind` enum values to short strings: `+I` (INSERT), `-U` (UPDATE_BEFORE), `+U` (UPDATE_AFTER), `-D` (DELETE).
**Rationale**: Follows Flink CLI convention. Compact for JSON transport. Frontend can color-code based on these.

## Risks / Trade-offs

- **[DDL divergence]** → If a DDL statement succeeds on one environment but fails on the other, state diverges. Mitigate by executing on both and rolling back if either fails.
- **[Double resource usage]** → Two environments per session doubles MiniCluster instances. Acceptable at 5-session limit with tuned memory.
