## Why

Flink batch and streaming modes produce fundamentally different results — batch gives final aggregates while streaming produces changelog streams with insert/update/retract operations. A key educational goal of the fiddle is letting users see this difference. The UI needs a per-request mode selector, and DDL must be synchronized across both environments. References blueprint section: "Batch and streaming mode differ in fundamental ways."

## What Changes

- Create `ExecutionMode` enum (`BATCH`, `STREAMING`)
- Accept mode selection per execution request
- Synchronize DDL across both environments in a session (CREATE TABLE applied to both)
- Annotate streaming results with `RowKind` (`+I`, `-U`, `+U`, `-D`) changelog markers

## Capabilities

### New Capabilities
- `execution-modes`: Per-request batch/streaming mode selection, DDL synchronization, and changelog annotation

### Modified Capabilities

## Impact

- **Code**: New `ExecutionMode` enum, modifications to `SqlExecutionService` and `QueryResult`
- **API**: Execution requests include a `mode` field
- **UX**: Streaming results include changelog operation column
