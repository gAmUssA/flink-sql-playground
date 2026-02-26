# Design: Caffeine Session Eviction

## Key Decisions

### Explicit SessionLimitExceededException preserved
Caffeine's `maximumSize` silently evicts LRU entries. We keep the manual size check + exception in `createSession()`, setting `maximumSize(maxSessions + 1)` as a safety net only. `cleanUp()` is called before size check to force pending evictions so `estimatedSize()` is accurate.

### Synchronous removal listener
`executor(Runnable::run)` makes the removal listener run synchronously. This is safe because `session.close()` calls `plannerExecutor.shutdownNow()` which is non-blocking. Synchronous execution ensures deterministic behavior in tests and avoids deferred cleanup.

### Ticker-based testing
The `SessionManager` accepts an optional `Ticker` parameter (package-private constructor). Tests use an `AtomicLong`-based fake ticker to advance time without `Thread.sleep` or reflection.

### FlinkSession simplified
Removed `lastAccessed` field, `getLastAccessed()`, `updateLastAccessed()`, and `createdAt` field with `getCreatedAt()`. Caffeine handles all access tracking internally via `expireAfterAccess`.

### @EnableScheduling removed
No more `@Scheduled` methods anywhere in the application, so `@EnableScheduling` is no longer needed on `FlinkSqlFiddleApplication`.

## Cache Configuration

```java
Caffeine.newBuilder()
    .expireAfterAccess(Duration.ofMinutes(15))
    .maximumSize(maxSessions + 1)  // safety net only
    .ticker(ticker)
    .executor(Runnable::run)
    .removalListener((key, session, cause) -> {
        if (session != null) {
            session.close();
            log.info("Evicted session {} (cause={})", key, cause);
        }
    })
    .build();
```
