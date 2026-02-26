## 1. DTOs

- [x] 1.1 Create request DTOs in `com.flinksqlfiddle.api.dto`: `ExecuteRequest` (sql, mode), `SaveFiddleRequest` (schema, query, mode). Use `@NotBlank` validation. Acceptance: DTOs compile with validation annotations.
- [x] 1.2 Create response DTOs: `SessionResponse` (sessionId), `ExecuteResponse` (columns, rows, rowKinds, rowCount, executionTimeMs, truncated), `FiddleResponse` (shortCode, schema, query, mode), `ErrorResponse` (error, code). Acceptance: DTOs compile.

## 2. Controllers

- [x] 2.1 Create `SessionController` with `POST /api/sessions` (create) and `DELETE /api/sessions/{id}` (delete). Acceptance: endpoints respond with correct DTOs.
- [x] 2.2 Create `ExecutionController` with `POST /api/sessions/{id}/execute`. Accept `ExecuteRequest`, call `SqlExecutionService`, return `ExecuteResponse`. Acceptance: SQL execution returns results as JSON.
- [x] 2.3 Create `FiddleController` with `POST /api/fiddles` (save) and `GET /api/fiddles/{shortCode}` (load). Acceptance: save returns short code, load returns fiddle content.

## 3. Error Handling

- [x] 3.1 Create `GlobalExceptionHandler` with `@ControllerAdvice`. Map `SecurityException` → 403, `SessionNotFoundException` → 404, `SessionLimitExceededException` → 429, `ExecutionTimeoutException` → 408. Acceptance: each exception returns the correct HTTP status and ErrorResponse JSON.

## 4. CORS Configuration

- [x] 4.1 Add `WebMvcConfigurer` bean allowing `GET`, `POST`, `DELETE` from same origin. Acceptance: frontend requests are not blocked by CORS.
