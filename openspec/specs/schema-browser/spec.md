## ADDED Requirements

### Requirement: Backend table introspection endpoint
The system SHALL expose `GET /api/sessions/{sessionId}/tables` returning a JSON array of tables registered in the session's catalog, each with column names and data types.

#### Scenario: Session with tables
- **WHEN** a GET request is made to `/api/sessions/{sessionId}/tables` after DDL has been executed
- **THEN** the response SHALL be 200 OK with a JSON body containing a `tables` array
- **AND** each table entry SHALL have `name` (string), and `columns` (array of `{name, type}` objects)

#### Scenario: Session with no tables
- **WHEN** a GET request is made to `/api/sessions/{sessionId}/tables` on a fresh session
- **THEN** the response SHALL be 200 OK with `{ "tables": [] }`

#### Scenario: Invalid session
- **WHEN** a GET request is made with a non-existent session ID
- **THEN** the response SHALL be 404 NOT_FOUND with error code `SESSION_NOT_FOUND`

### Requirement: Schema browser panel displays tables
The frontend SHALL display a collapsible schema browser panel showing all tables registered in the current session. Each table entry SHALL be expandable to reveal its columns with data types.

#### Scenario: Panel shows tables after schema build
- **WHEN** the user clicks "Build Schema" and DDL executes successfully
- **THEN** the schema browser panel SHALL refresh and display the newly created tables
- **AND** each table name SHALL be visible in the panel

#### Scenario: Expanding a table shows columns
- **WHEN** the user clicks on a table name in the schema browser
- **THEN** the table entry SHALL expand to show a list of columns
- **AND** each column SHALL display its name and Flink data type (e.g., `order_id: INT`, `product: STRING`)

#### Scenario: Empty state
- **WHEN** no tables exist in the session
- **THEN** the schema browser SHALL display a message indicating no tables are registered (e.g., "No tables. Use Build Schema to create tables.")

### Requirement: Schema browser auto-refreshes after DDL
The schema browser SHALL automatically refresh its contents after a successful "Build Schema" execution.

#### Scenario: Auto-refresh on schema build
- **WHEN** "Build Schema" completes successfully
- **THEN** the schema browser SHALL fetch the updated table list from `GET /api/sessions/{sessionId}/tables`
- **AND** the panel SHALL reflect any added or removed tables

### Requirement: Schema browser is collapsible
The schema browser panel SHALL be collapsible to maximize editor space. It SHALL default to expanded when tables exist and collapsed when empty.

#### Scenario: Toggle collapse
- **WHEN** the user clicks the collapse toggle on the schema browser
- **THEN** the panel SHALL collapse to a narrow strip (showing only a toggle icon)
- **AND** clicking again SHALL expand it back to full width
