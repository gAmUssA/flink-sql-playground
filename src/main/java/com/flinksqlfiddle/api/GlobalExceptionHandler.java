package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.ErrorResponse;
import com.flinksqlfiddle.execution.ExecutionTimeoutException;
import com.flinksqlfiddle.session.SessionLimitExceededException;
import com.flinksqlfiddle.session.SessionNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ErrorResponse handleSecurityException(SecurityException e) {
        log.warn("Security violation: {}", e.getMessage());
        return new ErrorResponse(e.getMessage(), "SECURITY_VIOLATION");
    }

    @ExceptionHandler(SessionNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleSessionNotFound(SessionNotFoundException e) {
        log.warn("Session not found: {}", e.getMessage());
        return new ErrorResponse(e.getMessage(), "SESSION_NOT_FOUND");
    }

    @ExceptionHandler(FiddleController.FiddleNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleFiddleNotFound(FiddleController.FiddleNotFoundException e) {
        log.warn("Fiddle not found: {}", e.getMessage());
        return new ErrorResponse(e.getMessage(), "FIDDLE_NOT_FOUND");
    }

    @ExceptionHandler(SessionLimitExceededException.class)
    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    public ErrorResponse handleSessionLimitExceeded(SessionLimitExceededException e) {
        log.warn("Session limit exceeded: {}", e.getMessage());
        return new ErrorResponse(e.getMessage(), "SESSION_LIMIT_EXCEEDED");
    }

    @ExceptionHandler(ExecutionTimeoutException.class)
    @ResponseStatus(HttpStatus.REQUEST_TIMEOUT)
    public ErrorResponse handleExecutionTimeout(ExecutionTimeoutException e) {
        log.warn("Execution timeout: {}", e.getMessage());
        return new ErrorResponse(e.getMessage(), "EXECUTION_TIMEOUT");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse(e.getMessage());
        log.warn("Validation error: {}", message);
        return new ErrorResponse(message, "VALIDATION_ERROR");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleMessageNotReadable(HttpMessageNotReadableException e) {
        log.warn("Bad request: {}", e.getMessage());
        return new ErrorResponse(e.getMessage(), "BAD_REQUEST");
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorResponse handleGenericException(Exception e) {
        log.error("Unexpected error: {}", e.getMessage(), e);
        return new ErrorResponse(e.getMessage(), "INTERNAL_ERROR");
    }
}
