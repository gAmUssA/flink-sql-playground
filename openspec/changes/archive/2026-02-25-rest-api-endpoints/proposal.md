## Why

The frontend needs HTTP endpoints to create sessions, execute SQL, and manage fiddles. This change creates the Spring MVC REST API layer with proper DTOs, validation, and centralized error handling. References blueprint section: "REST API design."

## What Changes

- Create `SessionController` with POST/DELETE for session lifecycle
- Create `ExecutionController` with POST for SQL execution
- Create `FiddleController` with GET/POST for fiddle save/load
- Create request/response DTOs for all endpoints
- Add `@ControllerAdvice` global exception handler mapping domain exceptions to HTTP status codes

## Capabilities

### New Capabilities
- `rest-api`: Spring MVC controllers, DTOs, and error handling for sessions, execution, and fiddles

### Modified Capabilities

## Impact

- **API**: New endpoints: `POST /api/sessions`, `DELETE /api/sessions/{id}`, `POST /api/sessions/{id}/execute`, `GET /api/fiddles/{shortCode}`, `POST /api/fiddles`
- **Code**: New `com.flinksqlfiddle.api` package with controllers, DTOs, and exception handler
- **Dependencies**: Depends on `SessionManager`, `SqlExecutionService`, and fiddle persistence
