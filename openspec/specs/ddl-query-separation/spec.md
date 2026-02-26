## ADDED Requirements

### Requirement: Build Schema button executes DDL idempotently
The "Build Schema" button SHALL execute all statements from the schema editor. For each `CREATE TABLE` or `CREATE TEMPORARY TABLE` statement, the system SHALL first execute `DROP TABLE IF EXISTS <table_name>` before executing the create statement, preventing "already exists" errors on re-run.

#### Scenario: First-time schema build
- **WHEN** the user clicks "Build Schema" with a `CREATE TABLE orders (...)` statement
- **THEN** the system SHALL execute `DROP TABLE IF EXISTS orders` followed by `CREATE TABLE orders (...)`
- **AND** the status SHALL display "Schema built successfully"

#### Scenario: Re-running schema build
- **WHEN** the user clicks "Build Schema" a second time with the same DDL
- **THEN** the table SHALL be dropped and recreated without error
- **AND** the status SHALL display "Schema built successfully"

#### Scenario: Multiple DDL statements
- **WHEN** the schema editor contains multiple `CREATE TABLE` statements separated by semicolons
- **THEN** each statement SHALL be executed sequentially with the drop-if-exists pattern
- **AND** if any statement fails, execution SHALL stop and the error SHALL be displayed

### Requirement: Run Query button executes only the query
The "Run Query" button SHALL execute only the contents of the query editor. It SHALL NOT execute any DDL from the schema editor.

#### Scenario: Run query without building schema first
- **WHEN** the user clicks "Run Query" without having built the schema
- **THEN** the system SHALL attempt to execute the query
- **AND** if tables do not exist, the error SHALL be displayed (e.g., "Table 'orders' not found")

#### Scenario: Run query after schema is built
- **WHEN** the user has built the schema and clicks "Run Query"
- **THEN** the query SHALL execute against the existing tables
- **AND** results SHALL be displayed in the results panel

#### Scenario: Re-running query multiple times
- **WHEN** the user clicks "Run Query" multiple times
- **THEN** each execution SHALL succeed without "already exists" errors
- **AND** results SHALL refresh with each execution

### Requirement: Build Schema and Run Query are visually distinct
The UI SHALL display two separate buttons: "Build Schema" (secondary style) and "Run Query" (primary blue style). The single "Run" button SHALL be removed.

#### Scenario: Button layout
- **WHEN** the user views the controls toolbar
- **THEN** "Build Schema" SHALL appear as a secondary/outlined button
- **AND** "Run Query" SHALL appear as a primary blue button
- **AND** the old single "Run" button SHALL NOT be present
