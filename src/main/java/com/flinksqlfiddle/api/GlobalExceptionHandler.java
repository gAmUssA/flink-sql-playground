package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.ErrorResponse;
import com.flinksqlfiddle.execution.ExecutionTimeoutException;
import com.flinksqlfiddle.fiddle.FiddleNotFoundException;
import com.flinksqlfiddle.security.ForbiddenSqlException;
import com.flinksqlfiddle.session.SessionLimitExceededException;
import com.flinksqlfiddle.session.SessionNotFoundException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.WebApplicationException;
import org.jboss.resteasy.reactive.RestResponse;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.stream.Collectors;

/**
 * Maps application exceptions to JSON {@link ErrorResponse} bodies with the right HTTP
 * status — the Quarkus REST equivalent of the former Spring {@code @RestControllerAdvice}.
 * Each {@code @ServerExceptionMapper} method handles one exception type; the most specific
 * match wins, so the catch-all {@code RuntimeException} mapper only fires for unmapped errors.
 */
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleForbiddenSql(ForbiddenSqlException e) {
        log.warn("Security violation: {}", e.getMessage());
        return RestResponse.status(RestResponse.Status.FORBIDDEN,
                new ErrorResponse(e.getMessage(), "SECURITY_VIOLATION"));
    }

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleSessionNotFound(SessionNotFoundException e) {
        log.warn("Session not found: {}", e.getMessage());
        return RestResponse.status(RestResponse.Status.NOT_FOUND,
                new ErrorResponse(e.getMessage(), "SESSION_NOT_FOUND"));
    }

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleFiddleNotFound(FiddleNotFoundException e) {
        log.warn("Fiddle not found: {}", e.getMessage());
        return RestResponse.status(RestResponse.Status.NOT_FOUND,
                new ErrorResponse(e.getMessage(), "FIDDLE_NOT_FOUND"));
    }

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleSessionLimitExceeded(SessionLimitExceededException e) {
        log.warn("Session limit exceeded: {}", e.getMessage());
        // 429 Too Many Requests
        return RestResponse.ResponseBuilder.<ErrorResponse>create(429)
                .entity(new ErrorResponse(e.getMessage(), "SESSION_LIMIT_EXCEEDED"))
                .build();
    }

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleExecutionTimeout(ExecutionTimeoutException e) {
        log.warn("Execution timeout: {}", e.getMessage());
        // 408 Request Timeout
        return RestResponse.ResponseBuilder.<ErrorResponse>create(408)
                .entity(new ErrorResponse(e.getMessage(), "EXECUTION_TIMEOUT"))
                .build();
    }

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleValidation(ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .map(GlobalExceptionHandler::formatViolation)
                .collect(Collectors.joining("; "));
        log.warn("Validation error: {}", message);
        return RestResponse.status(RestResponse.Status.BAD_REQUEST,
                new ErrorResponse(message, "VALIDATION_ERROR"));
    }

    @ServerExceptionMapper
    public RestResponse<ErrorResponse> handleRuntime(RuntimeException e) {
        // Preserve framework-generated responses (404 for unknown routes, 405, etc.)
        // rather than masking them as 500s — WebApplicationException carries its own status.
        if (e instanceof WebApplicationException wae) {
            int status = wae.getResponse().getStatus();
            return RestResponse.ResponseBuilder.<ErrorResponse>create(status)
                    .entity(new ErrorResponse(e.getMessage(), "ERROR"))
                    .build();
        }
        log.error("Unexpected error: {}", e.getMessage(), e);
        return RestResponse.status(RestResponse.Status.INTERNAL_SERVER_ERROR,
                new ErrorResponse(e.getMessage(), "INTERNAL_ERROR"));
    }

    private static String formatViolation(ConstraintViolation<?> v) {
        String path = v.getPropertyPath().toString();
        // Keep only the leaf field name (e.g. "execute.request.sql" -> "sql").
        int lastDot = path.lastIndexOf('.');
        String field = lastDot >= 0 ? path.substring(lastDot + 1) : path;
        return field + ": " + v.getMessage();
    }
}
