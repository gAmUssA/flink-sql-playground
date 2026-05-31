package com.flinksqlfiddle.util;

/**
 * Small helpers for rendering SQL text in logs and error messages.
 */
public final class SqlText {

    private static final int MAX_LOG_LENGTH = 80;

    private SqlText() {
    }

    /**
     * Collapses whitespace to single spaces and clamps to {@value #MAX_LOG_LENGTH}
     * characters (with an ellipsis) so SQL fits on one log line.
     */
    public static String truncate(String sql) {
        String oneLine = sql.replaceAll("\\s+", " ").trim();
        return oneLine.length() > MAX_LOG_LENGTH ? oneLine.substring(0, MAX_LOG_LENGTH) + "..." : oneLine;
    }
}
