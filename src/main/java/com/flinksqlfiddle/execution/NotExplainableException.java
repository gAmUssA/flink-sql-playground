package com.flinksqlfiddle.execution;

/**
 * The statement has no plan to show: it is DDL or SHOW ({@code NOT_EXPLAINABLE}), or the planner
 * rejected it, e.g. an unknown table or a syntax error ({@code INVALID_SQL}). Both are user
 * errors, mapped to 400 rather than logged as server failures.
 */
public class NotExplainableException extends RuntimeException {

    private final String code;

    public NotExplainableException(String message) {
        this(message, "NOT_EXPLAINABLE");
    }

    public NotExplainableException(String message, String code) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
