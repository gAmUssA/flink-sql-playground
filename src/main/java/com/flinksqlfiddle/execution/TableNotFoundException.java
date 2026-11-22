package com.flinksqlfiddle.execution;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A statement names a table or view the session does not have. Detected from Flink's planner
 * errors by {@link #detect(Throwable, String)}, mapped to HTTP 400 with code {@code TABLE_NOT_FOUND},
 * the missing {@link #table() name} and Flink's original message, so the frontend can explain the
 * failure without parsing English. See docs/adr/0007-table-not-found-error-contract.md.
 */
public class TableNotFoundException extends RuntimeException {

    // Calcite's objectNotFound / objectNotFoundWithin, with the optional "did you mean" tail that a
    // case-insensitive match adds. Anchored: the innermost SqlValidatorException carries exactly
    // this text, while its wrappers prefix "SQL validation failed. From line ...".
    private static final Pattern OBJECT_NOT_FOUND = Pattern.compile(
            "^Object '(.+?)' not found(?: within '(.+?)')?(?:; did you mean '(.+?)'\\?)?$", Pattern.DOTALL);
    // Flink's own catalog lookup, e.g. for the target of an INSERT INTO.
    private static final Pattern CANNOT_FIND_TABLE = Pattern.compile(
            "^Cannot find table '(.+)' in any of the catalogs \\[.*\\], nor as a temporary table\\.?$", Pattern.DOTALL);
    // DESCRIBE / SHOW CREATE of a table that does not exist.
    private static final Pattern NO_SUCH_IDENTIFIER = Pattern.compile(
            "^Tables? or views? with the identifier '(.+)' doesn't exist\\.?$", Pattern.DOTALL);
    // CalciteContextException's prefix: the span of the identifier that failed to resolve.
    private static final Pattern POSITION = Pattern.compile(
            "From line (\\d+), column (\\d+) to line (\\d+), column (\\d+): ");
    private static final Pattern IDENTIFIER_PART = Pattern.compile("`((?:[^`]|``)*)`|([\\w$]+)");

    // Only planner validation errors are trusted: a job failing at runtime with a similar
    // message (a connector, a UDF) is not a missing table.
    private static final Set<String> VALIDATION_ERRORS =
            Set.of("ValidationException", "SqlValidatorException", "CalciteContextException");

    private final String table;
    private final List<String> path;
    private final String suggestion;

    public TableNotFoundException(String table, String suggestion, String flinkMessage, Throwable cause) {
        this(table, List.of(table), suggestion, flinkMessage, cause);
    }

    public TableNotFoundException(String table, List<String> path, String suggestion, String flinkMessage,
                                  Throwable cause) {
        super(flinkMessage, cause);
        this.table = table;
        this.path = List.copyOf(path);
        this.suggestion = suggestion;
    }

    /** The missing table or view, unquoted, as the statement spelled it. */
    public String table() {
        return table;
    }

    /**
     * The missing table's name parts, unquoted, ending with {@link #table()}: as the statement wrote
     * them ({@code [orders]}, {@code [other_db, orders]}), or as Flink resolved them
     * ({@code [default_catalog, other_db, orders]}) when the statement's text is not available.
     */
    public List<String> path() {
        return path;
    }

    /** Flink's "did you mean" candidate (an existing name differing in case), or null. */
    public String suggestion() {
        return suggestion;
    }

    /**
     * The missing table {@code failure} reports, if it is a missing table or view. A missing
     * column ({@code Column 'x' not found}), an unknown alias ({@code Table 'u2' not found}) and a
     * missing catalog or database ({@code Object 'nodb' not found within 'default_catalog'}) are not.
     *
     * @param sql the statement that failed; locates the identifier Calcite rejected, to tell
     *            {@code FROM orders} (table {@code orders}) from {@code FROM nodb.orders}
     *            (database {@code nodb}). Both report {@code Object '…' not found}.
     */
    public static Optional<TableNotFoundException> detect(Throwable failure, String sql) {
        if (failure instanceof TableNotFoundException already) {
            return Optional.of(already);
        }
        String position = null;
        for (Throwable t = failure; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String message = t.getMessage();
            if (message == null || !VALIDATION_ERRORS.contains(t.getClass().getSimpleName())) {
                continue;
            }
            Matcher pos = POSITION.matcher(message);
            if (position == null && pos.find()) {
                position = pos.group();
            }
            Optional<List<String>> path = missingTable(message, position, sql);
            if (path.isPresent()) {
                Matcher m = OBJECT_NOT_FOUND.matcher(message);
                String suggestion = m.matches() ? m.group(3) : null;
                return Optional.of(new TableNotFoundException(path.get().getLast(), path.get(), suggestion,
                        failure.getMessage(), failure));
            }
        }
        return Optional.empty();
    }

    /** The missing table's path, if {@code message} reports one. */
    private static Optional<List<String>> missingTable(String message, String position, String sql) {
        Matcher object = OBJECT_NOT_FOUND.matcher(message);
        if (object.matches()) {
            return objectNotFound(object.group(1), object.group(2), spanAt(sql, position));
        }
        Matcher cannotFind = CANNOT_FIND_TABLE.matcher(message);
        if (cannotFind.matches()) {
            // Flink quotes each part here: `default_catalog`.`sales.eu`.`sink`.
            return resolvedPath(parseIdentifier(cannotFind.group(1)));
        }
        Matcher identifier = NO_SUCH_IDENTIFIER.matcher(message);
        if (identifier.matches()) {
            // Unquoted here: a dot inside a part makes the path ambiguous, and resolvedPath rejects it.
            return resolvedPath(parseIdentifier(identifier.group(1)));
        }
        return Optional.empty();
    }

    /**
     * Calcite's {@code Object 'name' not found [within 'within']}: {@code within} is the resolved
     * prefix of the identifier ({@code cat.db}: the object is a table; {@code cat}: a database;
     * none: the identifier's first part). Calcite joins {@code within} with dots, unquoted, so a
     * database named {@code `sales.eu`} cannot be told apart from a catalog and a database there.
     * The statement's text at Calcite's span keeps the part boundaries; it decides when it holds a
     * dotted name that contains {@code name}. A span that holds something else, comments aside,
     * fails closed: no missing table is claimed.
     */
    private static Optional<List<String>> objectNotFound(String name, String within, String span) {
        String prefix = within == null ? "" : within;
        if (span != null) {
            List<String> written = parseIdentifier(span);
            if (written.isEmpty()) {
                return Optional.empty();
            }
            // Which written part failed: the one named `name` whose written prefix ends what
            // Calcite resolved. Without a written prefix Calcite resolved only defaults (FROM
            // Users within 'cat.db'), or nothing at all (FROM nodb.orders, no within).
            int failed = -1;
            for (int k = 1; within != null && k < written.size(); k++) {
                String before = String.join(".", written.subList(0, k));
                if (written.get(k).equals(name) && (prefix.equals(before) || prefix.endsWith("." + before))) {
                    if (failed >= 0) {
                        return Optional.empty(); // two candidates: ambiguous
                    }
                    failed = k;
                }
            }
            if (failed < 0 && written.getFirst().equals(name)) {
                failed = 0;
            }
            if (failed >= 0) {
                return failed == written.size() - 1 ? Optional.of(written) : Optional.empty();
            }
            // The span holds some other name: it points into a view's expanded text, not here.
        }
        if (within == null) {
            return Optional.of(List.of(name));
        }
        List<String> resolved = new ArrayList<>(List.of(within.split("\\.", -1)));
        resolved.add(name);
        return resolvedPath(resolved);
    }

    /** A catalog.database.table path Flink resolved, or empty when it is not exactly three parts. */
    private static Optional<List<String>> resolvedPath(List<String> parts) {
        return parts.size() == 3 ? Optional.of(List.copyOf(parts)) : Optional.empty();
    }

    /**
     * The parts of the identifier at Calcite's 1-based, inclusive span in {@code sql}, or an empty
     * list when the span does not hold one (it points into a view's text, or is out of range).
     */
    static List<String> identifierAt(String sql, String position) {
        String span = spanAt(sql, position);
        return span == null ? List.of() : parseIdentifier(span);
    }

    /** The text at Calcite's 1-based, inclusive span in {@code sql}, or null when it is out of range. */
    private static String spanAt(String sql, String position) {
        if (sql == null || position == null) {
            return null;
        }
        Matcher m = POSITION.matcher(position);
        if (!m.find()) {
            return null;
        }
        int start = offset(sql, Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
        int end = offset(sql, Integer.parseInt(m.group(3)), Integer.parseInt(m.group(4)));
        if (start < 0 || end < start || end >= sql.length()) {
            return null;
        }
        return sql.substring(start, end + 1);
    }

    private static int offset(String sql, int line, int column) {
        int index = 0;
        for (int l = 1; l < line; l++) {
            index = sql.indexOf('\n', index);
            if (index < 0) {
                return -1;
            }
            index++;
        }
        int at = index + column - 1;
        int lineEnd = sql.indexOf('\n', index);
        return column < 1 || (lineEnd >= 0 && at > lineEnd) ? -1 : at;
    }

    /**
     * {@code a.`b c`.d} as [a, b c, d], whitespace and comments between parts skipped; empty if the
     * text is not exactly a dotted identifier (an unclosed comment included).
     */
    static List<String> parseIdentifier(String text) {
        List<String> parts = new ArrayList<>();
        int n = text.length();
        int i = skipBlanks(text, 0);
        while (i >= 0) {
            Matcher part = IDENTIFIER_PART.matcher(text).region(i, n);
            if (!part.lookingAt()) {
                return List.of();
            }
            parts.add(part.group(1) != null ? part.group(1).replace("``", "`") : part.group(2));
            i = skipBlanks(text, part.end());
            if (i == n) {
                return parts;
            }
            if (i < 0 || text.charAt(i) != '.') {
                return List.of();
            }
            i = skipBlanks(text, i + 1);
        }
        return List.of();
    }

    /** The index after whitespace and comments from {@code i}, or -1 inside an unclosed block comment. */
    private static int skipBlanks(String text, int i) {
        int n = text.length();
        while (i < n) {
            if (Character.isWhitespace(text.charAt(i))) {
                i++;
            } else if (text.startsWith("--", i)) {
                int eol = text.indexOf('\n', i);
                i = eol < 0 ? n : eol + 1;
            } else if (text.startsWith("/*", i)) {
                int close = text.indexOf("*/", i + 2);
                if (close < 0) {
                    return -1;
                }
                i = close + 2;
            } else {
                break;
            }
        }
        return i;
    }
}
