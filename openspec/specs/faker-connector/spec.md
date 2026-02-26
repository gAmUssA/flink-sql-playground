## ADDED Requirements

### Requirement: Faker connector generates realistic data from expressions
The system SHALL include a Flink SQL table source connector registered as `'connector' = 'faker'` that generates data using DataFaker expressions specified per column via `'fields.<column>.expression'`.

#### Scenario: Create table with faker expressions
- **WHEN** a user executes `CREATE TEMPORARY TABLE t (name STRING) WITH ('connector' = 'faker', 'fields.name.expression' = '#{Name.full_name}')`
- **THEN** the table SHALL be created successfully and `SELECT * FROM t` SHALL return rows with realistic full names

#### Scenario: Faker supports bounded generation
- **WHEN** a user creates a faker table with `'number-of-rows' = '50'`
- **THEN** the source SHALL emit exactly 50 rows and terminate

#### Scenario: Faker supports streaming generation
- **WHEN** a user creates a faker table with `'rows-per-second' = '5'` and no `number-of-rows`
- **THEN** the source SHALL emit approximately 5 rows per second as an unbounded stream

### Requirement: Faker connector supports standard SQL types
The faker connector SHALL support generating data for STRING, INT, DOUBLE, BOOLEAN, DATE, and TIMESTAMP column types.

#### Scenario: Numeric expression generates correct type
- **WHEN** a column is defined as `amount DOUBLE` with expression `'#{Number.randomDouble ''2'',''5'',''500''}'`
- **THEN** the generated values SHALL be DOUBLE values between 5 and 500

#### Scenario: String expression generates realistic text
- **WHEN** a column is defined as `city STRING` with expression `'#{Address.city}'`
- **THEN** the generated values SHALL be realistic city name strings

### Requirement: Faker connector is registered via SPI
The connector SHALL be discoverable by Flink's table factory SPI mechanism via `META-INF/services/org.apache.flink.table.factories.Factory`.

#### Scenario: Connector loads without explicit registration
- **WHEN** the application starts and a user creates a table with `'connector' = 'faker'`
- **THEN** Flink SHALL resolve the factory automatically via SPI without additional configuration
