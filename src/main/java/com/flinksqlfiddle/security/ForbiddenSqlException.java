package com.flinksqlfiddle.security;

/**
 * Thrown when a SQL statement violates the playground's security policy
 * (forbidden statement type or disallowed connector).
 */
public class ForbiddenSqlException extends RuntimeException {

    public ForbiddenSqlException(String message) {
        super(message);
    }
}
