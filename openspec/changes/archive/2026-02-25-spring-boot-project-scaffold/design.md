## Context

The Flink SQL Fiddle is a greenfield project. No code exists yet. The blueprint (`docs/flink-sql-fiddle-blueprint.md`) specifies a Spring Boot backend with embedded Flink MiniCluster. This change establishes the project skeleton that all subsequent changes build upon.

## Goals / Non-Goals

**Goals:**
- Buildable Gradle project producing a runnable fat JAR
- All Flink 2.2.0 dependencies at implementation scope (no external cluster)
- Spring Boot 3.5.11 application entrypoint that starts cleanly
- Base `application.yaml` configuration

**Non-Goals:**
- No Flink environment initialization (handled by `embedded-flink-minicluster` change)
- No REST endpoints (handled by `rest-api-endpoints` change)
- No frontend assets (handled by `frontend-monaco-editor` change)
- No Docker configuration (handled by `docker-deployment` change)

## Decisions

### 1. Spring Boot 3.5.x as web framework
**Choice**: Spring Boot 3.5.11 with `spring-boot-starter-web`
**Rationale**: Blueprint specifies Spring Boot. Version 3.5.x requires Java 17+ and supports Java 21. Spring MVC provides the REST layer needed for the API.
**Alternatives**: Vert.x (used by SQL Fiddle v3 — more complex, less ecosystem), Quarkus (viable but less familiar to most Java devs).

### 2. Gradle with Kotlin DSL as build tool
**Choice**: Gradle 8.14 with `build.gradle.kts` (Kotlin DSL) and wrapper
**Rationale**: Faster incremental builds than Maven, concise dependency declarations, Kotlin DSL provides type-safe configuration. Spring Boot Gradle plugin handles fat JAR packaging.
**Alternatives**: Maven — more verbose, slower incremental builds but more widely known.

### 3. Flink dependencies at implementation scope
**Choice**: All 7 Flink artifacts as `implementation` scope (not `compileOnly`)
**Rationale**: There is no external Flink cluster — the MiniCluster runs embedded. `flink-table-planner-loader` isolates planner internals via a separate classloader. Flink 2.x removed Scala DataStream/DataSet APIs, so no Scala suffix is needed.

### 4. Java 21 toolchain
**Choice**: Java 21 via Gradle `java.toolchain.languageVersion`
**Rationale**: Flink 2.x officially supports Java 21. Virtual threads, pattern matching, and other modern features available. Spring Boot 3.5.x fully supports Java 21.

### 5. Java package structure
**Choice**: `com.flinksqlfiddle` as base package
**Rationale**: Simple, descriptive, matches the project domain. Sub-packages will be added by subsequent changes (e.g., `.session`, `.execution`, `.api`).

## Risks / Trade-offs

- **[Flink/Spring Boot version conflicts]** → Pin exact versions; Flink 2.2.0 and Spring Boot 3.5.11 are compatible on Java 21.
- **[Large fat JAR size]** → Expected ~150-200 MB due to Flink dependencies. Acceptable for a single-deployment architecture.
- **[No tests in scaffold]** → Intentional. Test infrastructure will be added as features land.
