## MODIFIED Requirements

### Requirement: Execution metadata display
The frontend SHALL display execution time, row count, and a truncation warning if results were truncated. When column filters are active, the metadata SHALL additionally show the count of visible rows.

#### Scenario: Metadata shown after execution
- **WHEN** a query returns 50 rows in 2.3 seconds
- **THEN** the UI SHALL display "50 rows in 2300ms"

#### Scenario: Truncation warning
- **WHEN** results are truncated at 1000 rows
- **THEN** the UI SHALL display a warning: "results truncated to 1000 rows"

#### Scenario: Filtered row count displayed
- **WHEN** 50 rows are returned and column filters reduce visible rows to 12
- **THEN** the metadata SHALL display "showing 12 of 50 rows in 2300ms"

#### Scenario: Metadata reverts when filters cleared
- **WHEN** all column filters are cleared
- **THEN** the metadata SHALL revert to "50 rows in 2300ms" without the "showing X of" prefix
