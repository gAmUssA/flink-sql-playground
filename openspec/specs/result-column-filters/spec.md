## Requirements

### Requirement: Per-column filter inputs in results table
The results table SHALL include a filter row below the column headers, containing one text input per column (including the "op" column).

#### Scenario: Filter inputs appear after query execution
- **WHEN** a query returns results with columns `user_id`, `amount`, `city`
- **THEN** the results table SHALL display a filter input below each column header (`op`, `user_id`, `amount`, `city`)

#### Scenario: Filter inputs are empty by default
- **WHEN** results are rendered
- **THEN** all filter inputs SHALL be empty and all rows SHALL be visible

### Requirement: Case-insensitive substring filtering
Typing in a filter input SHALL immediately hide rows where the corresponding cell value does not contain the filter text as a case-insensitive substring.

#### Scenario: Single column filter narrows results
- **WHEN** results contain rows with cities "New York", "Newark", "Boston" and the user types "new" in the city filter
- **THEN** only "New York" and "Newark" rows SHALL be visible

#### Scenario: Multiple column filters combine with AND logic
- **WHEN** the user types "new" in the city filter and "+I" in the op filter
- **THEN** only rows that match BOTH conditions SHALL be visible

#### Scenario: Clearing a filter restores rows
- **WHEN** the user clears the city filter (backspace to empty)
- **THEN** rows previously hidden by that filter SHALL become visible again (subject to other active filters)

### Requirement: Op column filtering for row kinds
The "op" column filter SHALL allow users to filter by changelog operation type.

#### Scenario: Filter to inserts only
- **WHEN** the user types "+I" in the op filter
- **THEN** only insert rows SHALL be visible; update and delete rows SHALL be hidden

### Requirement: Clear-all filters button
The filter row SHALL include a clear button that resets all filter inputs and restores all rows.

#### Scenario: Clear button resets all filters
- **WHEN** the user has active filters and clicks the clear button
- **THEN** all filter inputs SHALL be cleared and all rows SHALL be visible

#### Scenario: Clear button visibility
- **WHEN** no filters are active
- **THEN** the clear button SHALL be hidden or visually inactive

### Requirement: Filters reset on new query
All filter inputs and filter state SHALL be cleared when a new query is executed.

#### Scenario: New query clears filters
- **WHEN** the user runs a new query while filters are active
- **THEN** the new results SHALL render with empty filters and all rows visible
