## 1. Configuration Property

- [x] 1.1 Add `Duration sessionIdleTimeout` field to `FlinkProperties` record. Default to `Duration.ofMinutes(15)` in the compact constructor when null or zero. Acceptance: `new FlinkProperties(1, "8m", "32m", 3, null)` returns 15m; `new FlinkProperties(1, "8m", "32m", 3, Duration.ofMinutes(30))` returns 30m.

## 2. SessionManager Integration

- [x] 2.1 Remove `private static final Duration IDLE_TIMEOUT` constant from `SessionManager`. Read the timeout from `flinkProperties.sessionIdleTimeout()` in the constructor and pass it to `Caffeine.expireAfterAccess()`. Acceptance: cache expiration uses the configured value, not a hardcoded constant.

## 3. Startup Logging

- [x] 3.1 Update the `onReady()` log line in `FlinkSqlFiddleApplication` to include the session idle timeout value. Acceptance: startup log shows `sessionIdleTimeout=15m` (or whatever is configured).

## 4. Tests

- [x] 4.1 Update `SessionManagerTest` — pass the timeout via `FlinkProperties` instead of relying on a hardcoded value. Verify the eviction test still uses `FakeTicker` with the configured timeout. Acceptance: all existing tests pass, eviction test reflects the timeout from properties.
- [x] 4.2 Add a unit test for `FlinkProperties` default: assert `sessionIdleTimeout()` returns 15 minutes when constructed with null or zero. Acceptance: test passes.

## 5. Verification

- [x] 5.1 Run `./gradlew build` — all tests pass, no compilation errors. Acceptance: BUILD SUCCESSFUL.
