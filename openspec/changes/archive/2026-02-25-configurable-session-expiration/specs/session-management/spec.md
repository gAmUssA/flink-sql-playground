## ADDED Requirements

### Requirement: Configurable session idle timeout property
The `FlinkProperties` record SHALL include a `sessionIdleTimeout` field of type `java.time.Duration`, bound to the Spring Boot property `flink.session-idle-timeout`. The compact constructor SHALL default the value to 15 minutes when it is null or zero.

#### Scenario: Default timeout when property is not set
- **WHEN** the `flink.session-idle-timeout` property is not configured
- **THEN** `FlinkProperties.sessionIdleTimeout()` SHALL return `Duration.ofMinutes(15)`

#### Scenario: Custom timeout from property
- **WHEN** `flink.session-idle-timeout` is set to `30m`
- **THEN** `FlinkProperties.sessionIdleTimeout()` SHALL return `Duration.ofMinutes(30)`

#### Scenario: Zero timeout defaults to 15 minutes
- **WHEN** `flink.session-idle-timeout` is set to `0s`
- **THEN** `FlinkProperties.sessionIdleTimeout()` SHALL return `Duration.ofMinutes(15)`

### Requirement: Startup log includes configured timeout
The application startup log line SHALL include the configured session idle timeout value alongside existing Flink configuration.

#### Scenario: Timeout logged on startup
- **WHEN** the application starts
- **THEN** the startup log line SHALL include the session idle timeout value

## MODIFIED Requirements

### Requirement: Caffeine Cache for session storage
The `SessionManager` SHALL use a Caffeine `Cache<String, FlinkSession>` instead of `ConcurrentHashMap` for storing active sessions. The cache SHALL be configured with `expireAfterAccess` using the timeout value from `FlinkProperties.sessionIdleTimeout()` and a `removalListener` that closes evicted sessions.

#### Scenario: Cache-based session storage
- **WHEN** the `SessionManager` is initialized
- **THEN** it SHALL create a Caffeine cache with idle expiration matching `FlinkProperties.sessionIdleTimeout()`
- **AND** the removal listener SHALL dispose of the `FlinkSession` environments on eviction

### Requirement: Lazy idle eviction via Caffeine
Idle session eviction SHALL be lazy, triggered on cache access, rather than polling on a fixed schedule. The eviction duration SHALL be determined by `FlinkProperties.sessionIdleTimeout()`.

#### Scenario: Idle session evicted on next access
- **WHEN** a session has not been accessed for longer than the configured timeout
- **AND** any cache access occurs (e.g., `getIfPresent`, `estimatedSize`)
- **THEN** Caffeine SHALL lazily evict the expired session
- **AND** the removal listener SHALL close the session's environments

#### Scenario: Active session retained
- **WHEN** a session was accessed within the configured timeout period
- **THEN** Caffeine SHALL NOT evict it
