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

    /**
     * Removes ALL SQL comments — {@code --} line comments (to end of line) and
     * {@code /* *}{@code /} block comments — that occur OUTSIDE single-quoted string literals,
     * returning a view of the statement equivalent to what Flink's parser effectively sees.
     * The contents of single-quoted string literals are preserved verbatim (so a value like
     * {@code 'a--b'}, {@code 'a/*b*}{@code /'}, or a faker expression is NOT corrupted), and the
     * SQL doubled-quote escape ({@code ''}) inside a literal is handled correctly. String
     * literals themselves are kept — only comments outside them are stripped.
     *
     * <p>Unlike {@link #stripLeadingComments(String)} (which only skips comments at the very
     * start), this removes inline and trailing comments too, closing comment-based bypasses of
     * the security validator's statement-type and connector checks (e.g. {@code CREATE/**}{@code /FUNCTION},
     * {@code 'connector'/**}{@code /='jdbc'}, or an allowlisted connector hidden in a trailing
     * {@code -- 'connector'='datagen'}). Detection only — the original SQL is what executes.
     */
    public static String stripComments(String sql) {
        if (sql == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(sql.length());
        int i = 0;
        int n = sql.length();
        while (i < n) {
            char c = sql.charAt(i);
            if (c == '\'') {
                // Copy the entire string literal verbatim, respecting the '' escape.
                out.append(c);
                i++;
                while (i < n) {
                    char d = sql.charAt(i);
                    if (d == '\'') {
                        if (i + 1 < n && sql.charAt(i + 1) == '\'') {
                            // Escaped quote inside the literal: copy both, stay in literal.
                            out.append("''");
                            i += 2;
                            continue;
                        }
                        // Closing quote.
                        out.append('\'');
                        i++;
                        break;
                    }
                    out.append(d);
                    i++;
                }
            } else if (c == '-' && i + 1 < n && sql.charAt(i + 1) == '-') {
                // Line comment: skip to end of line (keep the newline for readability).
                int nl = sql.indexOf('\n', i + 2);
                i = (nl == -1) ? n : nl;
            } else if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                // Block comment: skip to the closing */. Replace with a space so tokens on
                // either side (e.g. CREATE/**/FUNCTION) do not fuse into one keyword.
                int close = sql.indexOf("*/", i + 2);
                i = (close == -1) ? n : close + 2;
                out.append(' ');
            } else {
                out.append(c);
                i++;
            }
        }
        return out.toString();
    }
}
