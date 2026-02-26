## Context

The blueprint identifies five attack vectors through Flink SQL: filesystem connector (reads arbitrary files), JDBC connector (port scanning), Kafka/network connectors, UDF class loading (`CREATE FUNCTION`), and configuration manipulation (`SET`). Layer 1 (classpath control) is handled by only including safe connector JARs. This change implements Layer 2 (SQL AST validation) and Layer 3 constants (execution limits).

## Goals / Non-Goals

**Goals:**
- Parse user SQL into Calcite AST before execution
- Block dangerous statement types: `CREATE FUNCTION`, `ADD JAR`, `CREATE CATALOG`, `SET`
- Whitelist connectors in `CREATE TABLE` WITH clauses to `datagen`, `print`, `blackhole`
- Define constants: `MAX_ROWS=1000`, `EXECUTION_TIMEOUT_SECONDS=30`, `DEFAULT_PARALLELISM=1`

**Non-Goals:**
- Container-level isolation (Layer 4 — handled by `docker-deployment` change)
- Runtime timeout enforcement (handled by `sql-execution-engine` change)
- JVM SecurityManager (permanently disabled in JDK 24)

## Decisions

### 1. Flink's built-in Calcite parser for AST validation
**Choice**: Use `org.apache.flink.table.planner.parse.FlinkSqlParserImpl` or the public `TableEnvironment.getParser()` API to parse SQL into `SqlNode`.
**Rationale**: Already on classpath. Parses Flink SQL dialect accurately. No additional dependency.
**Alternatives**: Manual regex matching — fragile, easily bypassed. External SQL parser (JSqlParser) — doesn't understand Flink SQL extensions.

### 2. Whitelist approach for connectors
**Choice**: Only allow explicitly listed connectors (`datagen`, `print`, `blackhole`). Reject anything else.
**Rationale**: Whitelist is safer than blacklist — new dangerous connectors are blocked by default. These three connectors are memory-only and cannot access filesystem, network, or external systems.

### 3. Validation as a standalone service
**Choice**: `SqlSecurityValidator` as a stateless Spring `@Service` with a `validate(String sql)` method that throws `SecurityException` on violation.
**Rationale**: Decoupled from execution. Can be tested independently. Called before any SQL reaches `TableEnvironment.executeSql()`.

## Risks / Trade-offs

- **[Parser version coupling]** → Using Flink's internal parser ties us to Flink version. Mitigated by using the public `Parser` interface from `TableEnvironment.getParser()` if available.
- **[Multi-statement SQL bypass]** → Users might submit multiple statements separated by semicolons. Must split and validate each statement individually.
