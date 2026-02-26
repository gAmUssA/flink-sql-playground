## ADDED Requirements

### Requirement: Create a new session
The `SessionManager` SHALL create a new `FlinkSession` with a unique UUID, batch and streaming `TableEnvironment` instances, and return the session ID.

#### Scenario: Successful session creation
- **WHEN** a client requests a new session and fewer than 5 sessions exist
- **THEN** a new session SHALL be created and its UUID SHALL be returned

### Requirement: Enforce concurrent session limit
The `SessionManager` SHALL reject session creation when 5 active sessions already exist.

#### Scenario: Session limit exceeded
- **WHEN** a client requests a new session and 5 sessions already exist
- **THEN** a `SessionLimitExceededException` SHALL be thrown

### Requirement: Retrieve an existing session
The `SessionManager` SHALL allow retrieval of a session by its ID and update the last-accessed timestamp on each access.

#### Scenario: Valid session lookup
- **WHEN** a client requests session with a valid ID
- **THEN** the `FlinkSession` SHALL be returned and `lastAccessed` SHALL be updated to current time

#### Scenario: Invalid session lookup
- **WHEN** a client requests session with an unknown ID
- **THEN** a `SessionNotFoundException` SHALL be thrown

### Requirement: Delete a session
The `SessionManager` SHALL allow explicit deletion of a session, releasing its resources.

#### Scenario: Session deletion
- **WHEN** a client deletes a session by ID
- **THEN** the session SHALL be removed from storage and its environments disposed

### Requirement: Evict idle sessions after 15 minutes
A scheduled task SHALL run every 60 seconds and remove sessions whose `lastAccessed` timestamp is older than 15 minutes.

#### Scenario: Idle session eviction
- **WHEN** a session has not been accessed for 16 minutes
- **THEN** the next cleanup cycle SHALL remove it from storage

#### Scenario: Active session retained
- **WHEN** a session was accessed 5 minutes ago
- **THEN** the cleanup cycle SHALL NOT remove it
