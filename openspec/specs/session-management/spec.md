## ADDED Requirements

### Requirement: Caffeine Cache for session storage
The `SessionManager` SHALL use a Caffeine `Cache<String, FlinkSession>` instead of `ConcurrentHashMap` for storing active sessions. The cache SHALL be configured with `expireAfterAccess(15 min)` and a `removalListener` that closes evicted sessions.

#### Scenario: Cache-based session storage
- **WHEN** the `SessionManager` is initialized
- **THEN** it SHALL create a Caffeine cache with 15-minute idle expiration
- **AND** the removal listener SHALL dispose of the `FlinkSession` environments on eviction

### Requirement: Lazy idle eviction via Caffeine
Idle session eviction SHALL be lazy, triggered on cache access, rather than polling on a fixed schedule. There SHALL be no `@Scheduled` cleanup method and no `@EnableScheduling` on the application class.

#### Scenario: Idle session evicted on next access
- **WHEN** a session has not been accessed for more than 15 minutes
- **AND** any cache access occurs (e.g., `getIfPresent`, `estimatedSize`)
- **THEN** Caffeine SHALL lazily evict the expired session
- **AND** the removal listener SHALL close the session's environments

#### Scenario: Active session retained
- **WHEN** a session was accessed within the last 15 minutes
- **THEN** Caffeine SHALL NOT evict it

### Requirement: Session retrieval refreshes access timestamp automatically
The `SessionManager.getSession()` method SHALL use `Cache.getIfPresent()` which automatically refreshes the access timestamp within Caffeine, replacing any manual `lastAccessed` update.

#### Scenario: Valid session lookup
- **WHEN** a client requests a session with a valid ID
- **THEN** `Cache.getIfPresent()` SHALL return the `FlinkSession`
- **AND** the Caffeine access timestamp SHALL be refreshed automatically

#### Scenario: Invalid session lookup
- **WHEN** a client requests a session with an unknown ID
- **THEN** a `SessionNotFoundException` SHALL be thrown

### Requirement: Session deletion via cache invalidation
The `SessionManager.deleteSession()` method SHALL use `Cache.invalidate()` which triggers the removal listener to close the session and dispose of its environments.

#### Scenario: Explicit session deletion
- **WHEN** a client deletes a session by ID
- **THEN** `Cache.invalidate()` SHALL remove the session
- **AND** the removal listener SHALL dispose of the session's environments

### Requirement: Accurate active session count
The `SessionManager.getActiveSessionCount()` method SHALL call `Cache.cleanUp()` before `Cache.estimatedSize()` to ensure evicted entries are flushed before reporting the count.

#### Scenario: Session count after idle eviction
- **WHEN** some sessions have expired but eviction has not yet been triggered
- **AND** `getActiveSessionCount()` is called
- **THEN** `cleanUp()` SHALL flush expired entries
- **AND** `estimatedSize()` SHALL return the accurate count of active sessions

### Requirement: Package-private Ticker constructor for testability
The `SessionManager` SHALL provide a package-private constructor that accepts a `Ticker` parameter, allowing tests to control time progression for verifying eviction behavior.

#### Scenario: Test-controlled time
- **WHEN** a test constructs `SessionManager` with a custom `Ticker`
- **THEN** the Caffeine cache SHALL use that ticker for time-based eviction decisions
- **AND** tests SHALL be able to simulate time advancement without real delays

## REMOVED Requirements

### Requirement: Scheduled cleanup task
~~A scheduled task SHALL run every 60 seconds and remove sessions whose `lastAccessed` timestamp is older than 15 minutes.~~

**Reason:** Replaced by Caffeine's built-in lazy expiration via `expireAfterAccess`.

### Requirement: FlinkSession lastAccessed field
~~The `FlinkSession` SHALL maintain a `lastAccessed` field and accessor, updated on each session access.~~

**Reason:** Caffeine internally tracks access timestamps; manual tracking is redundant.

### Requirement: FlinkSession createdAt field
~~The `FlinkSession` SHALL maintain a `createdAt` field and accessor.~~

**Reason:** No longer needed after migration to Caffeine cache.
