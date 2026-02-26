## Context

The `SessionManager` uses a Caffeine cache with `expireAfterAccess(IDLE_TIMEOUT)` where `IDLE_TIMEOUT` is a hardcoded `Duration.ofMinutes(15)`. Other session knobs (`maxSessions`) are already configurable via the `FlinkProperties` record bound to `flink.*` Spring Boot properties. The timeout should follow the same pattern.

## Goals / Non-Goals

**Goals:**
- Make the idle session timeout configurable via `flink.session-idle-timeout` property
- Default to 15 minutes (no behavioral change for existing deployments)
- Log the configured value on startup for observability

**Non-Goals:**
- Per-session timeout overrides
- Runtime reconfiguration (requires cache rebuild)
- Minimum/maximum validation beyond Duration parsing (operators are trusted)

## Decisions

### 1. Add `Duration sessionIdleTimeout` to `FlinkProperties`

Spring Boot's `@ConfigurationProperties` binding automatically converts property values like `15m`, `30m`, `1h` to `java.time.Duration`. The record's compact constructor provides the default.

**Alternatives considered:**
- Separate `@Value` annotation in `SessionManager` — rejected because it breaks the single-source pattern established by `FlinkProperties`
- `long` field in seconds — rejected because `Duration` is type-safe and Spring Boot handles the conversion

### 2. Pass timeout through `FlinkProperties`, not as a separate parameter

`SessionManager` already receives `FlinkProperties` in its constructor. Reading `flinkProperties.sessionIdleTimeout()` keeps the dependency graph unchanged.

### 3. Default in the compact constructor, not in `application.properties`

Consistent with how `maxSessions`, `parallelism`, `networkMemory`, and `managedMemory` handle defaults — all in the compact constructor with null/zero guards.

## Risks / Trade-offs

- **[Zero/negative duration]** → Compact constructor defaults to 15 minutes if `sessionIdleTimeout` is null or zero, matching the existing pattern for `maxSessions`
- **[Very short timeouts]** → Operators setting sub-second values would cause immediate eviction. Acceptable risk — this is an operator-facing config, not user-facing
