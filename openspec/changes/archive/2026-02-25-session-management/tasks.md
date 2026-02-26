## 1. Session Model

- [x] 1.1 Create `com.flinksqlfiddle.session.FlinkSession` class with fields: `sessionId` (String), `batchEnv` (TableEnvironment), `streamEnv` (TableEnvironment), `createdAt` (Instant), `lastAccessed` (Instant). Acceptance: class compiles with getters and `updateLastAccessed()` method.

## 2. Session Manager

- [x] 2.1 Create `com.flinksqlfiddle.session.SessionManager` as a Spring `@Service` with a `ConcurrentHashMap<String, FlinkSession>` field. Acceptance: component scan picks it up.
- [x] 2.2 Implement `createSession()` that checks session count against limit (5), creates environments via `FlinkEnvironmentFactory`, stores the session, and returns the session ID. Throw `SessionLimitExceededException` when limit reached. Acceptance: 6th session creation throws exception.
- [x] 2.3 Implement `getSession(String id)` that returns the session and updates `lastAccessed`, or throws `SessionNotFoundException`. Acceptance: valid ID returns session, invalid ID throws.
- [x] 2.4 Implement `deleteSession(String id)` that removes the session from the map. Acceptance: deleted session is no longer retrievable.

## 3. Idle Cleanup

- [x] 3.1 Implement `@Scheduled(fixedRate = 60000)` cleanup method that iterates sessions and removes those with `lastAccessed` older than 15 minutes. Acceptance: idle sessions are evicted after 15 minutes.
- [x] 3.2 Add `@EnableScheduling` to the application configuration. Acceptance: scheduled tasks run.

## 4. Exception Classes

- [x] 4.1 Create `SessionNotFoundException` and `SessionLimitExceededException` in `com.flinksqlfiddle.session` package. Acceptance: exceptions are throwable with message.
