## Context

Flink's `TableEnvironment.create()` automatically starts an embedded MiniCluster. However, default settings allocate too much memory (64 MB network buffers, managed memory proportional to heap). For a fiddle serving multiple sessions on a 2-4 GB VM, we need aggressive tuning. The blueprint documents that an empty tuned MiniCluster uses only 20 MB heap.

## Goals / Non-Goals

**Goals:**
- Factory method that creates batch or streaming `TableEnvironment` with tuned configuration
- Minimize per-environment memory footprint
- Spring-managed component for dependency injection

**Non-Goals:**
- Session lifecycle management (handled by `session-management` change)
- Cluster sharing across environments (each `TableEnvironment` gets its own MiniCluster — simplest model for MVP)

## Decisions

### 1. One MiniCluster per TableEnvironment (no sharing)
**Choice**: Let each `TableEnvironment.create()` spin up its own embedded MiniCluster.
**Rationale**: Simplest approach. Flink handles lifecycle automatically. Isolation between sessions is free. Memory cost is acceptable with tuned settings (~100 MB per active environment).
**Alternatives**: Shared MiniCluster via `MiniClusterWithClientResource` — more complex, risks cross-session interference.

### 2. Configuration tuning parameters
**Choice**: `parallelism.default=1`, `taskmanager.memory.network.min/max=8m`, `taskmanager.memory.managed.size=0`
**Rationale**: Per blueprint's "Tiny Flink" research. Parallelism=1 is sufficient for playground queries. Network buffers reduced from 64 MB to 8 MB. Managed memory=0 is safe because HashMap state backend doesn't need it.

### 3. Factory as Spring @Component
**Choice**: `@Component` class with methods `createBatchEnvironment()` and `createStreamingEnvironment()`
**Rationale**: Clean DI pattern. Session manager (future change) will inject this factory to create environments per session.

## Risks / Trade-offs

- **[Single parallelism limits throughput]** → Acceptable for a playground; queries over bounded datagen sources complete fast at parallelism=1.
- **[MiniCluster per environment increases memory]** → Mitigated by aggressive tuning and session limits (max 5 sessions, future change).
