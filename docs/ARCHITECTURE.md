# Architecture

Flink SQL Playground is a Quarkus 3.36 web application that embeds Apache Flink 2.2.1 as an in-process SQL execution engine. Users write and run Flink SQL in their browser — no external cluster required.

**Stack:** Java 25, Quarkus 3.36 (JAX-RS/RESTEasy Reactive, Hibernate ORM + Panache, SmallRye Config), Apache Flink 2.2.1, Gradle Kotlin DSL, H2/PostgreSQL, Caffeine cache, Monaco Editor.

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Monaco Editor │  │ Schema       │  │ Results      │  │
│  │ (DDL + Query) │  │ Browser      │  │ Table        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────▲───────┘  │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          ▼                 ▼                 │
┌─────────────────────────────────────────────────────────┐
│  REST API (Quarkus REST / JAX-RS)                       │
│  /api/sessions  /api/sessions/{id}/execute  /api/fiddles│
├─────────────────────────────────────────────────────────┤
│  SessionManager        SqlExecutionService              │
│  (Caffeine cache)      (validate → execute → collect)   │
├─────────────────────────────────────────────────────────┤
│  FlinkSession (per user)                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Batch        │  │ Streaming    │  │ Planner       │  │
│  │ TableEnv     │  │ TableEnv     │  │ Thread        │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Embedded Flink Runtime (single JVM)                    │
│  datagen connector  ·  faker connector (custom)         │
└─────────────────────────────────────────────────────────┘
```

## Package Structure

```
com.flinksqlfiddle/
├── api/                    JAX-RS resources, DTOs, exception mappers
│   └── dto/                ExecuteRequest/Response, FiddleRequest/Response, etc.
├── execution/              SqlExecutionService, QueryResult, ExecutionMode
├── flink/                  FlinkEnvironmentFactory, FlinkProperties
├── session/                SessionManager, FlinkSession
├── security/               SqlSecurityValidator, SecurityConstants
├── fiddle/                 Fiddle JPA entity, FiddleService, FiddleRepository
└── faker/                  Custom Flink connector (DataFaker-based)
```

## Request Flow

A query execution follows this path:

1. **HTTP** — `POST /api/sessions/{id}/execute` with `{ sql, mode }`.
2. **Resource** — `ExecutionResource` retrieves the `FlinkSession` from `SessionManager`.
3. **Validation** — `SqlSecurityValidator` blocks forbidden SQL (CREATE FUNCTION, ADD JAR, SET, disallowed connectors).
4. **DDL handling** — If the statement is DDL (CREATE TABLE, DROP TABLE), it runs on **both** batch and streaming environments so tables are visible in either mode. CREATE TABLE is made idempotent by prepending DROP TABLE IF EXISTS.
5. **Execution** — The query runs on the session's dedicated planner thread via `session.runOnPlannerThread()`. This is required because Calcite's `RelMetadataQuery` uses thread-local state.
6. **Result collection** — A `CompletableFuture` iterates `TableResult.collect()` with a 15-second collection timeout (for unbounded streams) and a 1000-row cap. A 30-second hard timeout kills the Flink job if collection stalls.
7. **Response** — `ExecuteResponse` returns columns, column types, rows, row kinds (+I, +U, -U, -D), execution time, and a truncated flag.

## Session Management

Each user gets an isolated `FlinkSession` containing separate batch and streaming `TableEnvironment` instances plus a single-threaded `ExecutorService` (the planner thread).

Sessions are stored in a **Caffeine cache**:

| Setting      | Value                                                |
|--------------|------------------------------------------------------|
| Max sessions | 8 (configurable via `flink.max-sessions`)            |
| Idle timeout | 3 minutes (configurable via `flink.session-idle-timeout`) |
| Eviction     | LRU after max, expire-after-access for idle          |
| Cleanup      | Synchronous removal listener calls `session.close()` |

The dedicated planner thread per session exists because Calcite's metadata handler uses thread-local state. Running `executeSql()` from different threads causes `NullPointerException`.

## Flink Embedding

Flink runs in embedded single-JVM mode — no explicit MiniCluster instantiation. `TableEnvironment.create()` internally provisions a `StreamExecutionEnvironment` with an embedded TaskManager.

**Configuration per environment:**
- Parallelism: 1
- Network memory: 8m
- Managed memory: 32m

**Classloader handling:** When a job has no user jars (always true for embedded SQL), Flink deserializes the job graph with `ClassLoader.getSystemClassLoader()`. Under Quarkus, Flink is loaded by the Quarkus classloader, not the JVM system classloader, so that path fails with `ClassNotFoundException` on Flink operator factories. `FlinkEnvironmentFactory` therefore sets `pipeline.classpaths` to the application's own code location, which makes Flink build a user-code classloader parented to the classloader that loaded Flink — resolving both the operator factories and the bundled faker connector. This works uniformly in `quarkusDev`, the packaged fast-jar, and tests, so no uber-jar/classpath-flattening is needed.

## Security Model

All SQL passes through `SqlSecurityValidator` before execution.

**Blocked operations:**
- `CREATE FUNCTION` — UDF code injection
- `ADD JAR` — external code loading
- `CREATE CATALOG` — external data source access
- `SET` — runtime configuration tampering

**Connector whitelist:** Only `datagen`, `faker`, `print`, `blackhole` are allowed in CREATE TABLE statements. All other connectors (file, jdbc, kafka, etc.) are rejected.

**Execution limits:**

| Limit                          | Value      |
|--------------------------------|------------|
| Max result rows                | 1,000      |
| Collection timeout (streaming) | 15 seconds |
| Hard execution timeout         | 30 seconds |

Unbounded streaming queries return partial results after the collection timeout. Bounded queries (datagen with `number-of-rows`) terminate naturally.

## Fiddle Persistence

Fiddles (saved SQL snippets) are stored via JPA in H2 (dev) or PostgreSQL (production).

- **Repository:** Panache (`FiddleRepository implements PanacheRepositoryBase<Fiddle, String>`); writes wrapped in `@jakarta.transaction.Transactional`.
- **Entity:** `Fiddle` with `short_code` (PK), `schema_ddl`, `query`, `mode`, `created_at`
- **Short code:** SHA-256 hash of `schema|query|mode`, truncated to 8 characters. Same input always produces the same code (content-addressable).
- **URL routing:** `/f/{shortCode}` → `SpaResource` returns `index.html`, JavaScript loads the fiddle on init.

## Custom Faker Connector

The `faker` connector (`com.flinksqlfiddle.faker`) generates realistic test data using the DataFaker library. It is registered via Flink SPI (`META-INF/services`).

Features:
- Expression-based field generation (`#{Name.fullName}`, `#{Commerce.productName}`)
- Null rate per column
- Rate limiting (`rows-per-second`) and bounded mode (`number-of-rows`)
- Supports all Flink SQL types including ARRAY, MAP, MULTISET

## Frontend

Vanilla HTML/CSS/JavaScript with no build step.

| File             | Purpose                                         |
|------------------|-------------------------------------------------|
| `index.html`     | SPA shell                                       |
| `js/app.js`      | Session management, API calls, result rendering, guided tour |
| `js/examples.js` | Preloaded example queries (9 examples)          |
| `css/style.css`  | Theme system (Nebula/Carbon/Cobalt), responsive layout |

The editor uses Monaco Editor (v0.52.2) with SQL language support. Results render as an HTML table with per-column filter inputs, row-kind color coding, and a truncation indicator.

## Configuration

**Default (`application.properties`):**

| Property                          | Value                  |
|-----------------------------------|------------------------|
| `quarkus.http.port`               | 9090                   |
| `quarkus.datasource.jdbc.url`     | `jdbc:h2:mem:fiddledb` |
| `flink.parallelism`               | 1                      |
| `flink.max-sessions`              | 8                      |
| `flink.session-idle-timeout`      | 3m                     |

The `flink.*` and `execution.*` prefixes are bound via SmallRye `@ConfigMapping` interfaces (`FlinkConfig`, `ExecutionConfig`) and mapped into the `FlinkProperties` / `ExecutionLimits` domain records by `AppConfig`.

**Production (`application-supabase.properties`, profile `supabase`):** Switches to PostgreSQL via Supabase with a small Agroal pool (3 max, 1 min idle) and Flyway migrations.

## Docker

Multi-stage build:

1. **Build stage** (`eclipse-temurin:25-jdk`) — `./gradlew quarkusBuild` (Quarkus augmentation requires JDK 25)
2. **Runtime stage** (`eclipse-temurin:25-jre`) — copy the fast-jar layout (`build/quarkus-app/`, `lib/` first for layer caching), run `quarkus-run.jar` with tuned JVM flags

```
JVM: -Xms768m -Xmx1536m -XX:+UseZGC
     -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m
```

CI builds the fast-jar once natively, then `Dockerfile.runtime` packages it per-architecture (avoids compiling Flink under QEMU). Docker Compose allocates a 3GB memory limit for the container.

## Test Structure

| Layer     | Tests                                                                   | Pattern                                       |
|-----------|-------------------------------------------------------------------------|-----------------------------------------------|
| Resources | `SessionResourceTest`, `ExecutionResourceTest`, `FiddleResourceTest`    | `@QuarkusTest` + REST Assured + `@InjectMock` |
| Execution | `SqlExecutionServiceTest`, `StreamingExecutionTest`, `ExampleQueriesSmokeTest` | Real Flink environments (tag `smoke`)  |
| Sessions  | `SessionManagerTest`                                                    | Caffeine `Ticker` for time control            |
| Security  | `SqlSecurityValidatorTest`                                              | Direct method calls                           |
| Config    | `FlinkPropertiesTest`, `FlinkEnvironmentFactoryTest`, `ApplicationContextTest` | Constructor validation + `@QuarkusTest` boot |

**Smoke test adaptations:** Streaming examples in `ExampleQueriesSmokeTest` convert `PROCTIME()` to deterministic event-time columns with watermarks so windows fire when the bounded source finishes, making tests deterministic without real-time waits.
