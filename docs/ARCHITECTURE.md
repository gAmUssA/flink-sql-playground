# Architecture

Flink SQL Playground is a Spring Boot 4.0.3 web application that embeds Apache Flink 2.2.0 as an in-process SQL execution engine. Users write and run Flink SQL in their browser — no external cluster required.

**Stack:** Java 21, Spring Boot 4.0.3, Apache Flink 2.2.0, Gradle Kotlin DSL, H2/PostgreSQL, Caffeine cache, Monaco Editor.

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
│  REST API (Spring MVC)                                  │
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
├── api/                    REST controllers, DTOs, exception handler, CORS
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
2. **Controller** — `ExecutionController` retrieves the `FlinkSession` from `SessionManager`.
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
| Max sessions | 3 (configurable)                                     |
| Idle timeout | 5 minutes (configurable)                             |
| Eviction     | LRU after max, expire-after-access for idle          |
| Cleanup      | Synchronous removal listener calls `session.close()` |

The dedicated planner thread per session exists because Calcite's metadata handler uses thread-local state. Running `executeSql()` from different threads causes `NullPointerException`.

## Flink Embedding

Flink runs in embedded single-JVM mode — no explicit MiniCluster instantiation. `TableEnvironment.create()` internally provisions a `StreamExecutionEnvironment` with an embedded TaskManager.

**Configuration per environment:**
- Parallelism: 1
- Network memory: 8m
- Managed memory: 32m

**Docker classpath workaround:** The Dockerfile extracts the Spring Boot fat JAR to a flat classpath (`java -Djarmode=tools -jar app.jar extract`). This is necessary because Flink's TaskManager classloaders use the system classloader, which cannot see classes nested inside a fat JAR. Without extraction, connector discovery (SPI) fails.

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

- **Entity:** `Fiddle` with `short_code` (PK), `schema_sql`, `query_sql`, `mode`, `created_at`
- **Short code:** SHA-256 hash of `schema|query|mode`, truncated to 8 characters. Same input always produces the same code (content-addressable).
- **URL routing:** `/f/{shortCode}` → `SpaForwardingController` forwards to `index.html`, JavaScript loads the fiddle on init.

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
| `js/app.js`      | Session management, API calls, result rendering |
| `js/examples.js` | Preloaded example queries (9 examples)          |
| `js/tour.js`     | Product tour (Driver.js)                        |
| `css/style.css`  | Dark theme, responsive layout                   |

The editor uses Monaco Editor (v0.52.2) with SQL language support. Results render as an HTML table with per-column filter inputs, row-kind color coding, and a truncation indicator.

## Configuration

**Default (`application.yaml`):**

| Property                     | Value                  |
|------------------------------|------------------------|
| `server.port`                | 9090                   |
| `spring.datasource.url`      | `jdbc:h2:mem:fiddledb` |
| `flink.parallelism`          | 1                      |
| `flink.max-sessions`         | 3                      |
| `flink.session-idle-timeout` | 5m                     |

**Production (`application-supabase.yaml`):** Switches to PostgreSQL via Supabase with HikariCP connection pooling (3 max, 1 min idle) and Flyway migrations.

## Docker

Multi-stage build:

1. **Build stage** (`eclipse-temurin:21-jdk`) — Gradle build, skip tests
2. **Runtime stage** (`eclipse-temurin:21-jre`) — Extract JAR, run with tuned JVM flags

```
JVM: -Xms512m -Xmx1024m -XX:+UseSerialGC
     -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m
```

Docker Compose allocates a 2GB memory limit for the container.

## Test Structure

| Layer       | Tests                                                                      | Pattern                            |
|-------------|----------------------------------------------------------------------------|------------------------------------|
| Controllers | `SessionControllerTest`, `ExecutionControllerTest`, `FiddleControllerTest` | `@WebMvcTest` + `@MockitoBean`     |
| Execution   | `SqlExecutionServiceTest`, `ExampleQueriesSmokeTest`                       | Real Flink environments            |
| Sessions    | `SessionManagerTest`                                                       | Caffeine `Ticker` for time control |
| Security    | `SqlSecurityValidatorTest`                                                 | Direct method calls                |
| Config      | `FlinkPropertiesTest`, `FlinkEnvironmentFactoryTest`                       | Constructor validation             |

**Smoke test adaptations:** Streaming examples in `ExampleQueriesSmokeTest` convert `PROCTIME()` to deterministic event-time columns with watermarks so windows fire when the bounded source finishes, making tests deterministic without real-time waits.
