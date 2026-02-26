## ADDED Requirements

### Requirement: Block dangerous statement types
The `SqlSecurityValidator` SHALL reject SQL statements of types `CREATE FUNCTION`, `ADD JAR`, `CREATE CATALOG`, and `SET` by throwing a `SecurityException`.

#### Scenario: CREATE FUNCTION is blocked
- **WHEN** a user submits `CREATE FUNCTION myudf AS 'com.evil.Udf'`
- **THEN** a `SecurityException` SHALL be thrown with a message indicating `CREATE FUNCTION` is not allowed

#### Scenario: SET statement is blocked
- **WHEN** a user submits `SET 'execution.runtime-mode' = 'batch'`
- **THEN** a `SecurityException` SHALL be thrown with a message indicating `SET` is not allowed

#### Scenario: ADD JAR is blocked
- **WHEN** a user submits `ADD JAR '/tmp/evil.jar'`
- **THEN** a `SecurityException` SHALL be thrown

### Requirement: Whitelist connectors in CREATE TABLE
The validator SHALL inspect the `WITH` clause of `CREATE TABLE` statements and only allow connectors in the whitelist: `datagen`, `print`, `blackhole`.

#### Scenario: datagen connector is allowed
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'datagen')`
- **THEN** validation SHALL pass without error

#### Scenario: filesystem connector is blocked
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'filesystem', 'path' = '/etc/passwd')`
- **THEN** a `SecurityException` SHALL be thrown indicating `filesystem` connector is not allowed

#### Scenario: jdbc connector is blocked
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'jdbc')`
- **THEN** a `SecurityException` SHALL be thrown indicating `jdbc` connector is not allowed

### Requirement: Allow safe SQL statement types
The validator SHALL allow `CREATE TABLE` (with whitelisted connectors), `CREATE TEMPORARY VIEW`, `DROP TABLE`, `DROP VIEW`, `SELECT`, `INSERT INTO`, and `EXPLAIN` statements.

#### Scenario: SELECT is allowed
- **WHEN** a user submits `SELECT * FROM orders`
- **THEN** validation SHALL pass without error

#### Scenario: CREATE TEMPORARY VIEW is allowed
- **WHEN** a user submits `CREATE TEMPORARY VIEW v AS SELECT 1`
- **THEN** validation SHALL pass without error

### Requirement: Multi-statement SQL is validated individually
The validator SHALL split SQL input on semicolons and validate each statement independently.

#### Scenario: Mixed valid and invalid statements
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'datagen'); SET 'key' = 'val'`
- **THEN** a `SecurityException` SHALL be thrown for the `SET` statement

### Requirement: Execution limit constants are defined
The system SHALL define constants: `MAX_ROWS = 1000`, `EXECUTION_TIMEOUT_SECONDS = 30`, `DEFAULT_PARALLELISM = 1`.

#### Scenario: Constants are accessible
- **WHEN** code references `SecurityConstants.MAX_ROWS`
- **THEN** the value SHALL be `1000`
