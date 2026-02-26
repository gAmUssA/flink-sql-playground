## Why

Flink was never designed to run untrusted code. User-submitted SQL can read arbitrary files via the filesystem connector, connect to external databases via JDBC, or execute arbitrary Java via `CREATE FUNCTION`. The fiddle needs SQL AST validation before execution to block dangerous statements and restrict connectors to a safe whitelist. References blueprint section: "Defense in depth: securing user-submitted Flink SQL."

## What Changes

- Create `SqlSecurityValidator` that parses SQL into a Calcite AST and rejects unsafe statements
- Block `CREATE FUNCTION`, `ADD JAR`, `CREATE CATALOG`, `SET` statements
- Whitelist only `datagen`, `print`, and `blackhole` connectors in `CREATE TABLE` WITH clauses
- Define execution limit constants (max rows, timeout, parallelism)

## Capabilities

### New Capabilities
- `sql-validation`: SQL AST validation, statement blocking, connector whitelisting, and execution limit constants

### Modified Capabilities

## Impact

- **Code**: New `com.flinksqlfiddle.security.SqlSecurityValidator` class and `SecurityConstants`
- **Dependencies**: Uses Flink's Calcite-based SQL parser (`FlinkSqlParserImpl`) already on classpath
- **Security**: Primary defense layer against SQL injection and resource abuse
