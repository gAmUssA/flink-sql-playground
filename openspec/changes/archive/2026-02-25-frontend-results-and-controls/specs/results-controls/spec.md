## ADDED Requirements

### Requirement: Results table display
The frontend SHALL render query results in an HTML table with column names as headers and row data as cells.

#### Scenario: Results are displayed as table
- **WHEN** a query returns 10 rows with 3 columns
- **THEN** a table with 3 column headers and 10 data rows SHALL be rendered

### Requirement: Changelog color coding for streaming results
In streaming mode, result rows SHALL be color-coded by RowKind: `+I` rows in green, `+U` rows in blue, `-U` and `-D` rows in red.

#### Scenario: Streaming results are color-coded
- **WHEN** streaming query results contain rows with `+I`, `-U`, and `+U` kinds
- **THEN** `+I` rows SHALL have a green background, `-U` rows SHALL have a red background, and `+U` rows SHALL have a blue background

### Requirement: Batch/streaming mode toggle
The frontend SHALL provide a toggle control (radio buttons or switch) to select between BATCH and STREAMING execution modes, defaulting to STREAMING.

#### Scenario: Mode toggle changes execution mode
- **WHEN** the user selects BATCH mode and clicks Run
- **THEN** the execute request SHALL include `"mode": "BATCH"`

### Requirement: Execution metadata display
The frontend SHALL display execution time, row count, and a truncation warning if results were truncated.

#### Scenario: Metadata shown after execution
- **WHEN** a query returns 50 rows in 2.3 seconds
- **THEN** the UI SHALL display "50 rows in 2.3s"

#### Scenario: Truncation warning
- **WHEN** results are truncated at 1000 rows
- **THEN** the UI SHALL display a warning: "Results truncated to 1,000 rows"

### Requirement: Share button saves fiddle and copies URL
The "Share" button SHALL save the current schema, query, and mode via `POST /api/fiddles`, construct a URL `/f/{shortCode}`, and copy it to the clipboard.

#### Scenario: Share generates URL
- **WHEN** the user clicks "Share" with content in the editors
- **THEN** a fiddle SHALL be saved and the URL SHALL be copied to the clipboard

### Requirement: URL routing loads shared fiddles
When the page loads with a path matching `/f/{shortCode}`, the frontend SHALL load the fiddle via `GET /api/fiddles/{shortCode}` and populate the editors.

#### Scenario: Shared fiddle loads from URL
- **WHEN** a user navigates to `/f/a3b2c1d4`
- **THEN** the fiddle content SHALL be loaded and the schema and query editors SHALL be populated

#### Scenario: Invalid short code shows error
- **WHEN** a user navigates to `/f/invalid123`
- **THEN** an error message SHALL be displayed indicating the fiddle was not found
