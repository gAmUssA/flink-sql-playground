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

    /**
     * Strips leading line ({@code --}) and block ({@code /* *}{@code /}) comments and
     * whitespace so that start-anchored patterns (DDL detection, the security validator's
     * statement-type checks) match a statement that opens with a comment. Flink's SQL parser
     * ignores such leading comments, so a statement like {@code "-- note\nCREATE FUNCTION ..."}
     * runs as a CREATE FUNCTION even though a naive {@code ^\s*CREATE\s+FUNCTION} regex would
     * miss it. Only intended for pattern matching — the original SQL (comments intact) is what
     * actually executes.
     */
    public static String stripLeadingComments(String sql) {
        if (sql == null) {
            return "";
        }
        int i = 0;
        int n = sql.length();
        while (i < n) {
            while (i < n && Character.isWhitespace(sql.charAt(i))) {
                i++;
            }
            if (i + 1 < n && sql.charAt(i) == '-' && sql.charAt(i + 1) == '-') {
                int nl = sql.indexOf('\n', i);
                i = (nl == -1) ? n : nl + 1;
            } else if (i + 1 < n && sql.charAt(i) == '/' && sql.charAt(i + 1) == '*') {
                int close = sql.indexOf("*/", i + 2);
                i = (close == -1) ? n : close + 2;
            } else {
                break;
            }
        }
        return sql.substring(Math.min(i, n));
    }
}
