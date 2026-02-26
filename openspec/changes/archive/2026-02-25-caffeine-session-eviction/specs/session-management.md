# Session Management — Caffeine Eviction Delta

## Changed Behavior

- **Idle eviction** is now lazy (triggered on cache access) instead of polling every 60 seconds
- **`getSession()`** uses `Cache.getIfPresent()` which automatically refreshes the access timestamp
- **`deleteSession()`** uses `Cache.invalidate()` which triggers the removal listener to close the session
- **`getActiveSessionCount()`** calls `cleanUp()` before `estimatedSize()` for accuracy

## Removed

- `@Scheduled cleanupIdleSessions()` method
- `FlinkSession.lastAccessed` field and accessors
- `FlinkSession.createdAt` field and accessor
- `@EnableScheduling` on application class

## Added

- Package-private `SessionManager(factory, properties, ticker)` constructor for testability
- Caffeine `Cache<String, FlinkSession>` with `expireAfterAccess(15 min)` and `removalListener`
