## Why

Each user needs their own isolated `TableEnvironment` instances so DDL created by one user doesn't interfere with another. The fiddle needs session lifecycle management — creation, access tracking, idle timeout, and concurrent session limits — to prevent resource exhaustion on a memory-constrained deployment. References blueprint section: "Session management."

## What Changes

- Create `FlinkSession` model holding a session ID, batch and streaming `TableEnvironment` instances, creation time, and last-accessed time
- Create `SessionManager` Spring service backed by `ConcurrentHashMap<String, FlinkSession>`
- Enforce 5 concurrent session limit
- Implement 15-minute idle timeout with scheduled cleanup task

## Capabilities

### New Capabilities
- `session-lifecycle`: Session creation, lookup, eviction, concurrent limit, and idle timeout management

### Modified Capabilities

## Impact

- **Code**: New `com.flinksqlfiddle.session.FlinkSession` and `com.flinksqlfiddle.session.SessionManager`
- **Dependencies**: Depends on `FlinkEnvironmentFactory` from `embedded-flink-minicluster` change
- **Runtime**: Scheduled task runs every minute to evict idle sessions
