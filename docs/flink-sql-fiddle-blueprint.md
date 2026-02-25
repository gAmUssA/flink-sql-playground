# Building a Flink SQL Fiddle: complete technical blueprint

**A web-based interactive playground for Apache Flink SQL is feasible today using an embedded MiniCluster in a single JVM, and no existing open-source tool fills this gap.** The core architecture pairs a Spring Boot backend—managing per-session `TableEnvironment` instances with embedded Flink execution—with a Monaco/CodeMirror frontend. Security relies on classpath-based connector whitelisting and SQL AST validation rather than JVM sandboxing. Bounded `datagen` sources with computed timestamps and watermarks enable full streaming semantics (windows, event-time) over 100–200 elements that terminate cleanly. Deployment requires **2 GB+ RAM** minimum, making $5–10/month VPS or PaaS instances viable for an MVP.

---

## How SQL Fiddle works under the hood

SQL Fiddle v3 (the last open-source version at `zzzprojects/sqlfiddle3`) provides the closest reference architecture. It uses **Vert.x** as the application server, **Docker containers** for each database engine (MySQL, PostgreSQL, Oracle, MSSQL), **Varnish** for HTTP caching, and **PostgreSQL** as a metadata store. The frontend is a single-page app with CodeMirror editors in two panels: schema definition (left) and queries (right).

The execution model is content-addressable. When a user clicks "Build Schema," the DDL is hashed into a `short_code` (e.g., `ed3b0c`). A temporary database is created on the appropriate DB host container. Identical DDL always produces the same short_code, so results can be cached aggressively. Shareable URLs follow the format `/#!{db_type_id}/{short_code}/{query_id}`. The REST API is minimal: `POST /backend/createSchema` returns a short_code, and `POST /backend/executeQuery` returns columns and data arrays.

Security comes from **architectural isolation**: each DB runs in its own container with restricted user privileges, queries have execution timeouts, containers have Kubernetes resource limits, and DB host containers are only network-accessible from the app server. The ClickHouse Fiddle (`fiddle.clickhouse.com`) takes this further—each user query spawns an **ephemeral Docker container** that is killed after execution, achieving full isolation with ~2-second p90 latency.

DB Fiddle (`db-fiddle.com`) follows a similar model but is closed-source. A newer trend is browser-side execution: `dbfiddle.dev` runs SQLite and DuckDB entirely in WebAssembly. This isn't feasible for Flink (JVM-based, complex runtime), but it illustrates the UX expectations users bring.

---

## Flink SQL runs in a single JVM with surprisingly little memory

The most important technical finding: **Flink SQL can execute entirely inside a single JVM process without any external cluster**. When you call `TableEnvironment.create()` locally, Flink automatically starts an embedded MiniCluster (JobManager + TaskManager) behind the scenes. No explicit cluster management is required.

### Minimal embedded setup

```java
import org.apache.flink.configuration.Configuration;
import org.apache.flink.table.api.EnvironmentSettings;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.types.Row;
import org.apache.flink.util.CloseableIterator;

Configuration config = new Configuration();
config.setString("parallelism.default", "1");
config.setString("taskmanager.memory.network.min", "8m");
config.setString("taskmanager.memory.network.max", "8m");

EnvironmentSettings settings = EnvironmentSettings.newInstance()
    .inStreamingMode()
    .withConfiguration(config)
    .build();
TableEnvironment tEnv = TableEnvironment.create(settings);
```

The `executeSql()` method handles all SQL statement types and returns a `TableResult`:

- **DDL** (`CREATE TABLE`, `DROP TABLE`): Returns immediately, no job submitted
- **DML** (`INSERT INTO`): Submits a Flink job, returns a `TableResult` with `getJobClient()` for monitoring
- **DQL** (`SELECT`): Submits a job and returns results lazily via `collect()`

```java
// Execute DDL — returns immediately
tEnv.executeSql("CREATE TABLE orders (...) WITH ('connector' = 'datagen', ...)");

// Execute SELECT — collect results as Row objects
TableResult result = tEnv.executeSql("SELECT product, SUM(amount) FROM orders GROUP BY product");
try (CloseableIterator<Row> it = result.collect()) {
    while (it.hasNext()) {
        Row row = it.next();
        // row.getFieldAs(0), row.getFieldAs("product"), etc.
    }
}

// Schema introspection
ResolvedSchema schema = result.getResolvedSchema();
// schema.getColumnNames() → ["product", "EXPR$1"]
// schema.getColumnDataTypes() → [STRING, INT]
```

### Gradle dependencies (Flink 2.2.x)

```kotlin
// build.gradle.kts
val flinkVersion = "2.2.0"

dependencies {
    implementation("org.apache.flink:flink-streaming-java:$flinkVersion")
    implementation("org.apache.flink:flink-clients:$flinkVersion")
    implementation("org.apache.flink:flink-table-api-java:$flinkVersion")
    implementation("org.apache.flink:flink-table-api-java-bridge:$flinkVersion")
    implementation("org.apache.flink:flink-table-planner-loader:$flinkVersion")
    implementation("org.apache.flink:flink-table-runtime:$flinkVersion")
    implementation("org.apache.flink:flink-connector-datagen:$flinkVersion")
}
```

All dependencies must be `implementation` scope (not `compileOnly`) since there's no external Flink cluster providing them. The `flink-table-planner-loader` isolates planner internals via a separate classloader. Flink 2.x removed the Scala DataStream/DataSet APIs, so no Scala suffix is needed on any artifact.

### Resource requirements

According to Flink committer Robert Metzger's "Tiny Flink" research, an **empty MiniCluster starts with just 20 MB heap** when network buffers are reduced to 8 MB. Practical minimums for SQL queries:

| Configuration | JVM Heap | Total Process Memory |
|---|---|---|
| Empty MiniCluster (tuned) | 20 MB | ~80 MB |
| MiniCluster + simple SQL query | ~106 MB | ~250 MB |
| Comfortable operation for a fiddle | 256–512 MB | ~512 MB–1 GB |

The key tuning parameters: set `taskmanager.memory.network.min/max` to `8m` (default is 64 MB), `taskmanager.memory.managed.size` to `0` (not needed for HashMap state backend), parallelism to `1`, and use `-XX:+UseSerialGC` to reduce GC thread overhead.

---

## No open-source Flink SQL Fiddle exists today

A thorough survey reveals a clear gap. Here is what exists and where each falls short:

**Flink SQL Gateway** (built into Flink since 1.16) is the closest building block. It exposes a REST API on port 8083 with session management: `POST /v1/sessions` creates a session, `POST /v1/sessions/{id}/statements/` submits SQL, and `GET .../operations/{id}/result/0` fetches paginated results. However, it requires a running Flink cluster and provides no web frontend or sandboxing.

**Apache Zeppelin's Flink interpreter** provides `%flink.ssql` (streaming SQL) and `%flink.bsql` (batch SQL) magic commands with result visualization. It can run on an embedded MiniCluster. But it's a full notebook environment—heavyweight, no fiddle-style sharing, and complex to deploy.

**Hue's Flink SQL editor** connects to the Flink SQL Gateway REST API and provides a web-based SQL editor. This is the closest existing thing to a Flink SQL Fiddle, but it requires a full Hue installation, has no URL-shareable queries, and is designed as an enterprise tool, not a lightweight playground.

**Confluent Cloud for Apache Flink** and **Ververica Platform** both offer polished web-based SQL editors with auto-completion, schema browsers, and result visualization—but they're proprietary, cloud-only commercial products.

**Docker-based playgrounds** like `apache/flink-playgrounds` and `fhueske/flink-sql-demo` provide Docker Compose setups with Flink + Kafka + databases, but they use the CLI-based SQL Client inside containers, not a web UI.

The gap is clear: **no browser-based, zero-install, URL-shareable Flink SQL playground exists in open source.**

---

## Simulating bounded streams with event-time windows

The `datagen` connector is the ideal data source for a playground. It generates data in-memory, requires no external dependencies, and supports bounded execution. The key technique for enabling full streaming semantics is combining **sequence-generated fields** with **computed timestamp columns** and **watermark declarations**.

### The canonical pattern

```sql
CREATE TEMPORARY TABLE click_events (
    user_id INT,
    page_id INT,
    click_id INT,
    -- Computed column: spread 200 events across 200 seconds
    event_time AS TIMESTAMPADD(
        SECOND, click_id, TIMESTAMP '2024-01-01 00:00:00'
    ),
    -- Watermark: bounded out-of-orderness
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'datagen',
    'fields.click_id.kind' = 'sequence',
    'fields.click_id.start' = '1',
    'fields.click_id.end' = '200',
    'fields.user_id.min' = '1',
    'fields.user_id.max' = '10',
    'fields.page_id.min' = '1',
    'fields.page_id.max' = '5',
    'rows-per-second' = '50'
);
```

This creates **exactly 200 rows** (bounded via the sequence field's start/end), each with a deterministic timestamp spaced 1 second apart. The watermark declaration makes `event_time` a ROWTIME attribute, enabling event-time windowed aggregations.

### Windowed aggregation over simulated data

```sql
-- Tumbling window: 30-second windows over 200 seconds of data → ~7 windows
SELECT
    window_start,
    window_end,
    COUNT(*) AS click_count,
    COUNT(DISTINCT user_id) AS unique_users
FROM TABLE(
    TUMBLE(TABLE click_events, DESCRIPTOR(event_time), INTERVAL '30' SECOND)
)
GROUP BY window_start, window_end;
```

**The critical behavior that makes this work**: when a bounded source finishes reading all data, Flink emits `Watermark(Long.MAX_VALUE)` downstream. This `MAX_WATERMARK` causes **all remaining open windows to fire**, ensuring complete results even in streaming mode. No special handling is needed—bounded datagen sources work perfectly with windowed aggregations.

### Other data source options

The `VALUES` clause works for small inline datasets (`SELECT * FROM (VALUES (1, 'Alice'), (2, 'Bob')) AS t(id, name)`) but doesn't support watermark declarations and becomes unwieldy beyond ~10 rows. The `fromValues()` Table API method provides a programmatic alternative for the backend to pre-populate tables. The filesystem connector reads CSV/JSON files as bounded sources with watermark support, but requires server-side files. For a playground, **datagen is the clear winner** for primary data sources, with `VALUES` serving as a supplementary option for small lookup tables.

### Hopping and cumulate windows

```sql
-- Hopping (sliding) window: 1-minute windows every 30 seconds
SELECT window_start, window_end, sensor_id,
    ROUND(AVG(temperature), 2) AS avg_temp
FROM TABLE(
    HOP(TABLE sensor_data, DESCRIPTOR(event_time),
        INTERVAL '30' SECOND, INTERVAL '1' MINUTE)
)
GROUP BY window_start, window_end, sensor_id;

-- Cumulate window: progressive aggregation in 10-second steps up to 1 minute
SELECT window_start, window_end,
    SUM(amount) AS cumulative_total
FROM TABLE(
    CUMULATE(TABLE orders, DESCRIPTOR(order_time),
        INTERVAL '10' SECOND, INTERVAL '1' MINUTE)
)
GROUP BY window_start, window_end;
```

Use the Window TVF syntax (`FROM TABLE(TUMBLE(...))`) exclusively—the older `GROUP BY TUMBLE(...)` syntax is deprecated and lacks optimizations like mini-batch aggregation and Window TopN support.

---

## Defense in depth: securing user-submitted Flink SQL

Apache Flink's own security documentation states explicitly: *"Users can submit code to Flink processes, which will be executed unconditionally, without any attempts to limit what code can run."* Flink was never designed to run untrusted code. A Flink SQL Fiddle must implement its own security layers.

### Threat model

The primary attack vectors through Flink SQL are:

- **Filesystem connector**: `CREATE TABLE ... WITH ('connector' = 'filesystem', 'path' = '/etc/passwd')` reads arbitrary files
- **JDBC connector**: Connects to external/internal databases, enables port scanning
- **Kafka/network connectors**: Access arbitrary network endpoints
- **UDF class loading**: `CREATE FUNCTION` with custom JARs executes arbitrary Java code (most dangerous)
- **Configuration manipulation**: `SET` statements can alter Flink's runtime behavior

### Four-layer security model

**Layer 1 — Classpath control (strongest).** Only include JARs for safe connectors (`flink-connector-datagen`) in the application classpath. Flink discovers connectors via Java SPI (`META-INF/services/org.apache.flink.table.factories.Factory`). If `flink-connector-jdbc`, `flink-connector-kafka`, and `flink-connector-files` JARs aren't on the classpath, they simply cannot be instantiated. This is the most reliable defense because it operates at the JVM level.

**Layer 2 — SQL AST validation.** Flink uses a Calcite-based parser (`FlinkSqlParserImpl`). Before executing any user SQL, parse it into a `SqlNode` AST and validate:

```java
// Pseudocode for SQL validation
SqlNode ast = parser.parse(userSql);
if (ast instanceof SqlCreateFunction) throw new SecurityException("CREATE FUNCTION not allowed");
if (ast instanceof SqlAddJar) throw new SecurityException("ADD JAR not allowed");
if (ast instanceof SqlCreateCatalog) throw new SecurityException("CREATE CATALOG not allowed");
if (ast instanceof SqlSet) throw new SecurityException("SET not allowed");
if (ast instanceof SqlCreateTable) {
    // Inspect WITH clause — whitelist only 'datagen', 'print', 'blackhole'
    String connector = extractConnectorProperty(ast);
    if (!ALLOWED_CONNECTORS.contains(connector)) {
        throw new SecurityException("Connector '" + connector + "' not allowed");
    }
}
```

**Layer 3 — Execution limits.** Wrap `TableResult.collect()` in a `Future` with a **30-second timeout**. If exceeded, cancel the Flink job via `TableResult.getJobClient().get().cancel()`. Limit collected results to **1,000 rows** maximum. Set parallelism to 1 and constrain MiniCluster memory.

**Layer 4 — Container isolation (optional, for production).** Run the entire application in a Docker container with restricted syscalls (seccomp profile), read-only filesystem (except `/tmp`), no network egress beyond the frontend, and cgroup CPU/memory limits. For maximum isolation, adopt the ClickHouse Fiddle model: ephemeral container per query execution, killed after timeout.

Note that Java's `SecurityManager` was **permanently removed in JDK 24** (JEP 411) and has no in-JVM replacement. Oracle's official guidance recommends OS-level containers and VMs as the primary sandboxing mechanism.

---

## Architecture for a Flink SQL Fiddle web application

### Backend: Spring Boot + embedded Flink

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌─────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Monaco Editor│  │ Schema   │  │ Results    │ │
│  │ (SQL input) │  │ Panel    │  │ Display    │ │
│  └──────┬──────┘  └────┬─────┘  └─────▲──────┘ │
└─────────┼───────────────┼──────────────┼────────┘
          │  REST API     │              │
┌─────────▼───────────────▼──────────────┼────────┐
│              Spring Boot Backend                 │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ SQL Validator │  │  Session Manager        │  │
│  │ (AST check)  │  │  (Map<id, TableEnv>)    │  │
│  └──────┬───────┘  └──────────┬──────────────┘  │
│         │                      │                 │
│  ┌──────▼──────────────────────▼──────────────┐  │
│  │        Flink MiniCluster (embedded)         │  │
│  │  TableEnvironment per session               │  │
│  │  datagen / print / blackhole connectors     │  │
│  └─────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────┐  │
│  │  PostgreSQL / SQLite (fiddle metadata,      │  │
│  │  shareable links, content-addressed hashes) │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Session management

Each user session gets its own `TableEnvironment` instance. Since modes can't be toggled on an existing environment, maintain **two environments per session** (batch and streaming) or create them on demand:

```java
public class FlinkSession {
    private final String sessionId;
    private final TableEnvironment batchEnv;
    private final TableEnvironment streamEnv;
    private final Instant createdAt;
    private Instant lastAccessed;

    public FlinkSession(String sessionId) {
        this.sessionId = sessionId;
        this.batchEnv = createEnv(EnvironmentSettings.inBatchMode());
        this.streamEnv = createEnv(EnvironmentSettings.inStreamingMode());
        this.createdAt = Instant.now();
    }

    private TableEnvironment createEnv(EnvironmentSettings settings) {
        Configuration config = new Configuration();
        config.setString("parallelism.default", "1");
        config.setString("taskmanager.memory.network.min", "8m");
        config.setString("taskmanager.memory.network.max", "8m");
        return TableEnvironment.create(
            EnvironmentSettings.newInstance()
                .inStreamingMode() // or inBatchMode()
                .withConfiguration(config)
                .build()
        );
    }
}
```

Sessions should be evicted after **15 minutes of inactivity** to free resources. A `ConcurrentHashMap<String, FlinkSession>` with a scheduled cleanup task handles this. For an MVP, limit to **5 concurrent sessions** and queue additional requests.

### REST API design

```
POST /api/sessions                    → Create session, returns sessionId
POST /api/sessions/{id}/execute       → Execute SQL statement
  Body: { "sql": "...", "mode": "streaming" | "batch" }
  Response: { "columns": [...], "rows": [...], "rowCount": N, "executionTimeMs": T }
GET  /api/fiddles/{shortCode}         → Load a saved fiddle
POST /api/fiddles                     → Save a fiddle, returns shortCode
  Body: { "schema": "CREATE TABLE ...", "query": "SELECT ...", "mode": "streaming" }
DELETE /api/sessions/{id}             → Destroy session
```

### Execution model

For bounded queries (datagen with `number-of-rows` or sequence with start/end), execution is **effectively synchronous**: submit via `executeSql()`, collect all rows, return. Wrap in a `CompletableFuture` with a 30-second timeout:

```java
public QueryResult executeWithTimeout(TableEnvironment tEnv, String sql, Duration timeout) {
    CompletableFuture<QueryResult> future = CompletableFuture.supplyAsync(() -> {
        TableResult result = tEnv.executeSql(sql);
        List<Row> rows = new ArrayList<>();
        try (CloseableIterator<Row> it = result.collect()) {
            int count = 0;
            while (it.hasNext() && count < MAX_ROWS) {
                rows.add(it.next());
                count++;
            }
        }
        return new QueryResult(result.getResolvedSchema(), rows);
    });

    try {
        return future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
    } catch (TimeoutException e) {
        future.cancel(true);
        throw new ExecutionTimeoutException("Query exceeded " + timeout.getSeconds() + "s limit");
    }
}
```

For truly unbounded streaming queries, collect the first N rows (e.g., 200) then cancel, or stream results to the frontend via Server-Sent Events (SSE).

### Frontend

Use **Monaco Editor** (the VS Code editor component) for the SQL input—it supports syntax highlighting, auto-completion, and is well-maintained. The UI needs three sections:

- **Schema panel** (left/top): DDL statements for `CREATE TABLE`, `CREATE VIEW`
- **Query panel** (right/bottom): `SELECT` and `INSERT INTO` statements
- **Results panel** (bottom): Tabular results display, execution time, row count
- **Controls**: "Run" button, batch/streaming toggle, "Share" button, example dropdown

A shareable link system follows SQL Fiddle's content-addressable model: hash the DDL + query + mode into a short code, store in a lightweight database (SQLite for MVP), and generate URLs like `flinksqlfiddle.com/f/a3b2c1`.

---

## Batch and streaming mode differ in fundamental ways

A `TableEnvironment` is locked to its mode at creation time—**you cannot toggle between batch and streaming on the same instance**. The behavioral differences are significant:

| Behavior | Batch mode | Streaming mode |
|---|---|---|
| Aggregation results | Single final result | Changelog stream (insert/update/retract) |
| `ORDER BY` | Any column | Only time attributes |
| Watermarks | Automatic "perfect" watermarks | Must be explicitly declared |
| Job lifecycle | Runs to completion, terminates | Runs indefinitely until cancelled |
| Bounded source behavior | Processes all data, returns final result | Produces incremental updates, terminates when source exhausts |

**For a playground, this means**: batch mode produces clean, final results that are easy to display in a table. Streaming mode produces a changelog stream where rows can be inserted, updated, or retracted—this requires either collecting all changes and showing the final materialized state, or displaying the changelog itself with `+I`, `-U`, `+U` annotations. Both are valuable to teach users about Flink's dual nature.

The recommended UX is a toggle switch in the UI. When users switch modes, the backend creates a new `TableEnvironment` of the appropriate type and re-executes the schema DDL before running the query.

---

## Deployment needs at least 2 GB RAM

A Flink SQL Fiddle in Docker requires careful memory budgeting:

| Component | Memory |
|---|---|
| JVM base overhead + Metaspace | ~80 MB |
| Spring Boot web framework | ~100 MB |
| Flink MiniCluster (tuned) | 250–512 MB |
| Per-query execution headroom | 200–500 MB |
| OS + container overhead | ~100 MB |
| **Total minimum** | **~1.5 GB** |
| **Recommended** | **2–4 GB** |

### Dockerfile

```dockerfile
FROM eclipse-temurin:21-jre
COPY build/libs/flink-sql-fiddle.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", \
    "-Xms512m", "-Xmx1536m", \
    "-XX:+UseSerialGC", \
    "-XX:MaxMetaspaceSize=128m", \
    "-jar", "/app/app.jar"]
```

### Platform comparison

| Platform | Suitable tier | Monthly cost | Notes |
|---|---|---|---|
| **Fly.io** | 1 GB shared VM | ~$5 | Tight but works for single-user MVP |
| **Railway** | Pro plan, 2 GB | ~$10–15 | Good DX, usage-based |
| **Koyeb** | 2 GB instance | ~$10–15 | Autoscaling support |
| **Hetzner VPS** | 4 GB dedicated | ~$4–6 | Best value for memory-heavy JVM apps |
| **Render** | 2 GB/1 CPU | ~$25 | Simple but expensive for specs |

**Best value**: a Hetzner CX22 (4 GB RAM, 2 vCPU, $4.50/month) provides the most headroom. For PaaS convenience, Fly.io or Railway at the $10–15/month tier work well. Koyeb's **free tier (512 MB)** is insufficient—the MiniCluster alone needs more than that.

Scaling beyond 3–5 concurrent users requires either horizontal scaling (multiple instances behind a load balancer, each handling separate sessions) or a container-per-query architecture like ClickHouse Fiddle's approach.

---

## MVP feature set for a first release

A minimal viable Flink SQL Fiddle needs these core capabilities:

- **DDL support**: `CREATE TABLE` with `datagen` connector (bounded sources), `CREATE TEMPORARY VIEW`, `DROP TABLE`. Block all other connectors, `CREATE FUNCTION`, `ADD JAR`, `SET`.
- **DQL support**: `SELECT` queries including joins, aggregations, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`. Window TVFs: `TUMBLE`, `HOP`, `CUMULATE`.
- **DML support**: `INSERT INTO ... SELECT` with `print` or `blackhole` sinks.
- **Batch/streaming toggle**: Radio button switching execution mode.
- **Preloaded examples**: 5–8 curated examples demonstrating key Flink SQL features (simple aggregation, tumbling window, hopping window, temporal pattern, batch vs streaming difference).
- **Shareable URLs**: Content-addressed short codes for saving and sharing fiddles.
- **Result display**: Tabular results with column names and types, execution time, row count. In streaming mode, show changelog annotations (`+I`, `-U`, `+U`, `-D`).
- **Execution limits**: 30-second timeout, 1,000 row maximum, parallelism of 1.

Features to defer past MVP: auto-completion, syntax highlighting beyond basic SQL, UDF support, multiple statements in sequence, result visualization/charts, user accounts, and persistent history.

## Conclusion

The architecture is straightforward: **embed Flink's `TableEnvironment` in a Spring Boot service, validate SQL at the AST level, whitelist connectors via classpath control, and wrap execution with timeouts.** The `datagen` connector with computed timestamps and watermarks provides full streaming semantics over bounded data—windows fire correctly because bounded sources emit `MAX_WATERMARK` at end-of-input. No existing open-source tool combines a browser-based UI, URL sharing, and sandboxed Flink SQL execution, which makes this a genuine gap worth filling. The Flink SQL Gateway's REST API is a potential alternative backend, but direct `TableEnvironment` embedding is simpler for an MVP and avoids running a separate process. Start with a 2–4 GB container on a $5–10/month host, and the system can serve several concurrent users running bounded streaming queries that complete in under 10 seconds.