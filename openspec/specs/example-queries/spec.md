## ADDED Requirements

### Requirement: Curated example set
The application SHALL include at least 6 preloaded examples, each with a title, schema DDL (using `datagen` connector), and a query SQL.

#### Scenario: Examples cover key Flink SQL features
- **WHEN** the examples list is loaded
- **THEN** it SHALL include examples for: simple aggregation, tumbling window, hopping window, cumulate window, temporal join, and batch vs streaming comparison

### Requirement: Example dropdown selector
The frontend SHALL display a dropdown (`<select>`) element listing all available examples by title.

#### Scenario: Dropdown lists all examples
- **WHEN** the page loads
- **THEN** the dropdown SHALL list all example titles plus a blank "Custom" option

### Requirement: Example selection populates editors
When a user selects an example from the dropdown, the schema and query editors SHALL be populated with the example's DDL and SQL respectively.

#### Scenario: Selecting an example fills editors
- **WHEN** the user selects "Tumbling Window" from the dropdown
- **THEN** the schema editor SHALL contain the CREATE TABLE DDL and the query editor SHALL contain the window aggregation SQL

### Requirement: Default example on fresh load
When the page loads without a fiddle short code in the URL, the first example SHALL be loaded into the editors automatically.

#### Scenario: Default example on initial visit
- **WHEN** a user visits `http://localhost:8080/` (no `/f/` path)
- **THEN** the first example (simple aggregation) SHALL be loaded into both editors

### Requirement: Examples use bounded datagen sources
All examples SHALL use the `datagen` connector with sequence fields to produce bounded data sets that complete execution within 10 seconds.

#### Scenario: Example queries complete quickly
- **WHEN** any example is executed
- **THEN** it SHALL complete within 10 seconds and produce a finite result set

### Requirement: Faker-based example query
The application SHALL include at least one preloaded example that uses the `faker` connector to demonstrate realistic data generation with DataFaker expressions.

#### Scenario: Faker example produces readable output
- **WHEN** a user selects and runs the faker-based example
- **THEN** the query results SHALL contain human-readable realistic data (e.g., names, products, cities) instead of random strings/numbers
