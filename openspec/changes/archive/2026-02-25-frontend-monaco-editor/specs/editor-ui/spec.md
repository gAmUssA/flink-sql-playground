## ADDED Requirements

### Requirement: HTML application shell
The application SHALL serve a single-page HTML file at the root path (`/`) with a header, two editor panels, a results area, and a control bar.

#### Scenario: Page loads successfully
- **WHEN** a user navigates to `http://localhost:8080/`
- **THEN** the HTML page SHALL load with a visible header, two editor areas, and a "Run" button

### Requirement: Monaco Editor for SQL editing
The application SHALL load Monaco Editor from CDN and create two editor instances: one for schema DDL and one for query SQL, both configured with SQL language mode.

#### Scenario: Editors load with SQL highlighting
- **WHEN** the page loads and CDN resources are available
- **THEN** both editor panels SHALL render with SQL syntax highlighting enabled

### Requirement: Session creation on page load
The frontend SHALL create a new backend session by calling `POST /api/sessions` when the page loads, and store the returned session ID for subsequent API calls.

#### Scenario: Session is created automatically
- **WHEN** the page finishes loading
- **THEN** a `POST /api/sessions` request SHALL be made and the session ID SHALL be stored

### Requirement: SQL execution on Run button click
When the user clicks "Run", the frontend SHALL first execute the schema DDL (if non-empty), then execute the query SQL by calling `POST /api/sessions/{id}/execute`.

#### Scenario: Run executes schema then query
- **WHEN** the user enters a CREATE TABLE in the schema panel and a SELECT in the query panel and clicks "Run"
- **THEN** the schema DDL SHALL be sent first, followed by the query, and the query results SHALL be displayed

#### Scenario: Run with empty schema
- **WHEN** the schema panel is empty and the query panel has SQL
- **THEN** only the query SHALL be sent to the execute endpoint
