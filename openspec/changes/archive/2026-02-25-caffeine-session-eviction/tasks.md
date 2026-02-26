# Tasks: Caffeine Session Eviction

All tasks completed.

- [x] **Task 1**: Add `com.github.ben-manes.caffeine:caffeine:3.2.0` to `build.gradle.kts`
- [x] **Task 2**: Remove `lastAccessed`/`createdAt` fields and accessors from `FlinkSession.java`
- [x] **Task 3**: Replace `ConcurrentHashMap` with `Caffeine Cache` in `SessionManager.java`, remove `@Scheduled` method
- [x] **Task 4**: Remove `@EnableScheduling` from `FlinkSqlFiddleApplication.java`
- [x] **Task 5**: Rewrite `SessionManagerTest.java` with fake ticker (no reflection, no Thread.sleep)
