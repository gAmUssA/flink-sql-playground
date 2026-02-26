# Proposal: Replace ConcurrentHashMap + @Scheduled with Caffeine Cache

## Problem

`SessionManager` uses a hand-rolled `ConcurrentHashMap<String, FlinkSession>` with a `@Scheduled(fixedRate = 60_000)` cleanup loop to evict idle sessions. This approach has drawbacks:

- **Custom eviction logic** — iterating the entire map every 60 seconds, with manual cutoff comparison
- **Reflection in tests** — the idle eviction test uses `Field.setAccessible(true)` to manipulate `lastAccessed`
- **`@EnableScheduling` overhead** — pulled into the entire application just for one 60-second timer
- **Timing gap** — sessions can persist up to 60 seconds past the idle timeout before cleanup runs

## Solution

Replace with [Caffeine](https://github.com/ben-manes/caffeine), a high-performance caching library that provides `expireAfterAccess`, `removalListener`, and `Ticker` (for deterministic testing) out of the box.

## Benefits

- **Less custom code** — remove `@Scheduled` method, `lastAccessed` field, `updateLastAccessed()`
- **Better eviction** — Caffeine evicts lazily on access, no polling loop needed
- **Deterministic tests** — `FakeTicker` replaces `Field.setAccessible` reflection hacks
- **No `@EnableScheduling`** — removed from the application class entirely
