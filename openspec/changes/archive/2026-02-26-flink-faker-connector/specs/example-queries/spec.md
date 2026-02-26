## ADDED Requirements

### Requirement: Faker-based example query
The application SHALL include at least one preloaded example that uses the `faker` connector to demonstrate realistic data generation with DataFaker expressions.

#### Scenario: Faker example produces readable output
- **WHEN** a user selects and runs the faker-based example
- **THEN** the query results SHALL contain human-readable realistic data (e.g., names, products, cities) instead of random strings/numbers
