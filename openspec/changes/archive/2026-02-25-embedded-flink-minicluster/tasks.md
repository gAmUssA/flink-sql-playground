## 1. Factory Implementation

- [x] 1.1 Create `com.flinksqlfiddle.flink.FlinkEnvironmentFactory` as a Spring `@Component` with `createBatchEnvironment()` and `createStreamingEnvironment()` methods. Acceptance: class compiles and is picked up by component scan.
- [x] 1.2 Implement private `createConfiguration()` method that returns a Flink `Configuration` with `parallelism.default=1`, `taskmanager.memory.network.min=8m`, `taskmanager.memory.network.max=8m`, `taskmanager.memory.managed.size=0`. Acceptance: configuration values match spec.
- [x] 1.3 Implement `createBatchEnvironment()` using `EnvironmentSettings.inBatchMode()` with the tuned configuration. Acceptance: returned environment can execute `SELECT 1`.
- [x] 1.4 Implement `createStreamingEnvironment()` using `EnvironmentSettings.inStreamingMode()` with the tuned configuration. Acceptance: returned environment can execute a datagen-based SELECT.

## 2. Verification

- [x] 2.1 Manually verify that both environment types can execute `CREATE TABLE ... WITH ('connector' = 'datagen')` followed by a `SELECT` query. Acceptance: rows are collected without error.
