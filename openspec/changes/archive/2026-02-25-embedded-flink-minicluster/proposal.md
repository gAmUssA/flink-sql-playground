## Why

The Flink SQL Fiddle needs to execute SQL queries within the Spring Boot process. Flink's `TableEnvironment` can run on an embedded MiniCluster with no external cluster required, but it needs proper initialization with tuned memory settings. This change creates the `FlinkEnvironmentFactory` that produces batch and streaming `TableEnvironment` instances optimized for a resource-constrained single-JVM deployment. References blueprint section: "Flink SQL runs in a single JVM with surprisingly little memory."

## What Changes

- Create `FlinkEnvironmentFactory` Spring component that produces `TableEnvironment` instances in batch or streaming mode
- Configure MiniCluster tuning: parallelism=1, network memory=8m, managed memory=0
- Expose factory as a Spring `@Component` for injection into session management (future change)

## Capabilities

### New Capabilities
- `flink-environment`: Factory for creating tuned batch and streaming `TableEnvironment` instances on an embedded MiniCluster

### Modified Capabilities

## Impact

- **Code**: New `com.flinksqlfiddle.flink.FlinkEnvironmentFactory` class
- **Dependencies**: Uses Flink APIs already declared in `spring-boot-project-scaffold`
- **Runtime**: MiniCluster starts lazily on first `TableEnvironment` creation (~20 MB heap when tuned)
