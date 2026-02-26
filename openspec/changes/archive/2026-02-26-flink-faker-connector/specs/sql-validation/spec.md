## MODIFIED Requirements

### Requirement: Whitelist connectors in CREATE TABLE
The validator SHALL inspect the `WITH` clause of `CREATE TABLE` statements and only allow connectors in the whitelist: `datagen`, `faker`, `print`, `blackhole`.

#### Scenario: datagen connector is allowed
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'datagen')`
- **THEN** validation SHALL pass without error

#### Scenario: faker connector is allowed
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'faker')`
- **THEN** validation SHALL pass without error

#### Scenario: filesystem connector is blocked
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'filesystem', 'path' = '/etc/passwd')`
- **THEN** a `SecurityException` SHALL be thrown indicating `filesystem` connector is not allowed

#### Scenario: jdbc connector is blocked
- **WHEN** a user submits `CREATE TABLE t (...) WITH ('connector' = 'jdbc')`
- **THEN** a `SecurityException` SHALL be thrown indicating `jdbc` connector is not allowed
