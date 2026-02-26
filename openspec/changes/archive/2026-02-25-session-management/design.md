## Context

Each user interaction requires its own `TableEnvironment` instances (one batch, one streaming) to maintain DDL state isolation. With 2-4 GB total RAM and ~100-200 MB per active session, we can support roughly 5 concurrent sessions. Sessions that go idle waste memory and should be evicted.

## Goals / Non-Goals

**Goals:**
- Thread-safe session storage supporting concurrent web requests
- 5 concurrent session hard limit with clear error when exceeded
- 15-minute idle timeout with automatic cleanup
- Clean resource disposal when sessions are evicted

**Non-Goals:**
- Session persistence across server restarts (MVP is in-memory only)
- Authentication or user identity (sessions are anonymous)
- Sticky sessions / load balancing (single-instance MVP)

## Decisions

### 1. ConcurrentHashMap for session storage
**Choice**: `ConcurrentHashMap<String, FlinkSession>` for thread-safe session storage.
**Rationale**: Simple, no external dependency. Lock-free reads, segment-level locking for writes. Sufficient for 5 concurrent sessions.
**Alternatives**: Caffeine cache (adds dependency, over-engineered for 5 entries), Redis (external dependency, overkill for MVP).

### 2. UUID session IDs
**Choice**: `UUID.randomUUID().toString()` for session identifiers.
**Rationale**: Unique, unpredictable, standard. No collision risk at playground scale.

### 3. Scheduled cleanup via @Scheduled
**Choice**: Spring `@Scheduled(fixedRate = 60000)` to scan and evict idle sessions.
**Rationale**: Simple, built into Spring. Checks every 60 seconds, evicts sessions idle for >15 minutes. Avoids complex TTL mechanisms.

## Risks / Trade-offs

- **[Abrupt eviction]** → Sessions are destroyed without warning at 15 minutes. Acceptable for playground use.
- **[No graceful shutdown of Flink jobs]** → On session eviction, running jobs may not be cancelled cleanly. Should attempt `TableResult.getJobClient().cancel()` before disposal.
