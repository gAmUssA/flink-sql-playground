## ADDED Requirements

### Requirement: Create session endpoint
`POST /api/sessions` SHALL create a new session and return the session ID.

#### Scenario: Successful session creation
- **WHEN** a POST request is sent to `/api/sessions`
- **THEN** a 200 response SHALL be returned with `{ "sessionId": "<uuid>" }`

#### Scenario: Session limit exceeded
- **WHEN** 5 sessions already exist and a POST is sent to `/api/sessions`
- **THEN** a 429 response SHALL be returned with an error message

### Requirement: Delete session endpoint
`DELETE /api/sessions/{id}` SHALL destroy the specified session.

#### Scenario: Successful session deletion
- **WHEN** a DELETE request is sent to `/api/sessions/{id}` with a valid session ID
- **THEN** a 200 response SHALL be returned and the session SHALL be destroyed

#### Scenario: Session not found
- **WHEN** a DELETE request is sent with an unknown session ID
- **THEN** a 404 response SHALL be returned

### Requirement: Execute SQL endpoint
`POST /api/sessions/{id}/execute` SHALL execute SQL on the specified session.

#### Scenario: Successful SQL execution
- **WHEN** a POST with `{ "sql": "SELECT 1", "mode": "BATCH" }` is sent
- **THEN** a 200 response SHALL be returned with columns, rows, rowCount, executionTimeMs, and truncated fields

#### Scenario: Security violation
- **WHEN** a POST with `{ "sql": "CREATE FUNCTION ..." }` is sent
- **THEN** a 403 response SHALL be returned with the security error message

#### Scenario: Execution timeout
- **WHEN** a query exceeds the 30-second timeout
- **THEN** a 408 response SHALL be returned

### Requirement: Save fiddle endpoint
`POST /api/fiddles` SHALL save a fiddle and return its short code.

#### Scenario: Successful fiddle save
- **WHEN** a POST with `{ "schema": "CREATE TABLE ...", "query": "SELECT ...", "mode": "STREAMING" }` is sent
- **THEN** a 200 response SHALL be returned with `{ "shortCode": "<8chars>" }`

### Requirement: Load fiddle endpoint
`GET /api/fiddles/{shortCode}` SHALL return the saved fiddle content.

#### Scenario: Successful fiddle load
- **WHEN** a GET request is sent with a valid short code
- **THEN** a 200 response SHALL be returned with schema, query, and mode

#### Scenario: Fiddle not found
- **WHEN** a GET request is sent with an unknown short code
- **THEN** a 404 response SHALL be returned

### Requirement: Centralized error handling
A `@ControllerAdvice` SHALL map domain exceptions to consistent HTTP error responses with `{ "error": "message", "code": "ERROR_CODE" }` format.

#### Scenario: SecurityException maps to 403
- **WHEN** a `SecurityException` is thrown during request processing
- **THEN** a 403 response SHALL be returned with `code: "SECURITY_VIOLATION"`
