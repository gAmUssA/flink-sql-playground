## Why

The session idle timeout is hardcoded to 15 minutes in `SessionManager.IDLE_TIMEOUT`. Operators deploying via Docker or cloud need to tune this per environment (e.g., shorter for high-traffic public instances, longer for internal workshops) without rebuilding the image. Every other session knob (`maxSessions`, `parallelism`) is already configurable through `FlinkProperties`; the idle timeout should follow the same pattern.

## What Changes

- Add a `sessionIdleTimeout` field to the `FlinkProperties` record, exposed as `flink.session-idle-timeout` (Spring Boot property binding)
- Accept a `Duration` value (e.g., `15m`, `30m`, `1h`) with a sensible default of 15 minutes
- Remove the hardcoded `IDLE_TIMEOUT` constant from `SessionManager` and read the value from `FlinkProperties` instead
- Update the startup log line to include the configured timeout

## Capabilities

### New Capabilities

_(none — this extends an existing capability)_

### Modified Capabilities

- `session-management`: The idle timeout becomes a configurable property rather than a hardcoded constant

## Impact

- **Code**: `FlinkProperties.java` (new field), `SessionManager.java` (read from config), `SessionManagerTest.java` (pass timeout through properties)
- **Config**: New optional property `flink.session-idle-timeout` (defaults to `15m`, no breaking change)
- **API**: No REST API changes
- **Dependencies**: None
