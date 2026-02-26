## Context

The frontend communicates with the backend exclusively via REST API. The blueprint defines five endpoints. This change creates the Spring MVC controllers, request/response DTOs, and centralized error handling.

## Goals / Non-Goals

**Goals:**
- RESTful endpoints for session lifecycle, SQL execution, and fiddle persistence
- Clean DTOs for request/response serialization
- Centralized `@ControllerAdvice` mapping exceptions to HTTP status codes
- CORS configuration for frontend (same-origin for MVP, configurable for deployment)

**Non-Goals:**
- Authentication / rate limiting (post-MVP)
- WebSocket / SSE endpoints (post-MVP)
- API versioning (not needed for MVP)

## Decisions

### 1. Spring MVC with @RestController
**Choice**: Standard `@RestController` classes with `@RequestMapping("/api")`.
**Rationale**: Spring Boot default. Familiar, well-documented, sufficient for REST API.

### 2. DTO classes separate from domain models
**Choice**: Dedicated `*Request` and `*Response` DTO classes in the `api.dto` package.
**Rationale**: Decouples API contract from internal models. Allows independent evolution.

### 3. @ControllerAdvice for error handling
**Choice**: Global exception handler mapping: `SecurityException` → 403, `SessionNotFoundException` → 404, `SessionLimitExceededException` → 429, `ExecutionTimeoutException` → 408, generic → 500.
**Rationale**: Consistent error response format. No try-catch boilerplate in controllers.

### 4. Error response format
**Choice**: `{ "error": "message", "code": "ERROR_CODE" }` JSON structure.
**Rationale**: Simple, parseable by frontend. Code field allows programmatic error handling.

## Risks / Trade-offs

- **[No input validation beyond SQL security]** → Request DTOs should validate non-null fields. Use `@Valid` and `@NotBlank` annotations.
- **[CORS misconfiguration]** → Permissive CORS in development, restrictive in production. Use Spring's `@CrossOrigin` or `WebMvcConfigurer`.
