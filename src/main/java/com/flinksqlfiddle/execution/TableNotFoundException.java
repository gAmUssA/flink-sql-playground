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
    private final String suggestion;

    public TableNotFoundException(String table, String suggestion, String flinkMessage, Throwable cause) {
        super(flinkMessage, cause);
        this.table = table;
        this.suggestion = suggestion;
    }

    /** The missing table or view, unquoted, as the statement spelled it. */
    public String table() {
        return table;
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
            Optional<String> table = missingTable(message, position, sql);
            if (table.isPresent()) {
                Matcher m = OBJECT_NOT_FOUND.matcher(message);
                String suggestion = m.matches() ? m.group(3) : null;
                return Optional.of(new TableNotFoundException(table.get(), suggestion, failure.getMessage(), failure));
            }
        }
        return Optional.empty();
    }

    private static Optional<String> missingTable(String message, String position, String sql) {
        Matcher object = OBJECT_NOT_FOUND.matcher(message);
        if (object.matches()) {
            String name = object.group(1);
            String within = object.group(2);
            if (within != null) {
                // Within a database ("cat.db") the object is a table; within a catalog, a database.
                return within.split("\\.", -1).length == 2 ? Optional.of(name) : Optional.empty();
            }
            // Unqualified: the first part of the identifier failed to resolve. If the statement
            // wrote a qualified name there (nodb.orders), that part is a catalog or database.
            List<String> written = identifierAt(sql, position);
            if (written.size() > 1 && written.getFirst().equals(name)) {
                return Optional.empty();
            }
            return Optional.of(name);
        }
        Matcher cannotFind = CANNOT_FIND_TABLE.matcher(message);
        if (cannotFind.matches()) {
            return lastPart(cannotFind.group(1));
        }
        Matcher identifier = NO_SUCH_IDENTIFIER.matcher(message);
        if (identifier.matches()) {
            return lastPart(identifier.group(1));
        }
        return Optional.empty();
    }

    /** The last part of a dotted, possibly backtick-quoted path. */
    private static Optional<String> lastPart(String path) {
        List<String> parts = parseIdentifier(path);
        return parts.isEmpty() ? Optional.of(path) : Optional.of(parts.getLast());
    }

    /**
     * The parts of the identifier at Calcite's 1-based, inclusive span in {@code sql}, or an empty
     * list when the span does not hold one (it points into a view's text, or is out of range).
     */
    static List<String> identifierAt(String sql, String position) {
        if (sql == null || position == null) {
            return List.of();
        }
        Matcher m = POSITION.matcher(position);
        if (!m.find()) {
            return List.of();
        }
        int start = offset(sql, Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
        int end = offset(sql, Integer.parseInt(m.group(3)), Integer.parseInt(m.group(4)));
        if (start < 0 || end < start || end >= sql.length()) {
            return List.of();
        }
        return parseIdentifier(sql.substring(start, end + 1));
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

    /** {@code a.`b c`.d} as [a, b c, d]; empty if the text is not exactly a dotted identifier. */
    static List<String> parseIdentifier(String text) {
        List<String> parts = new ArrayList<>();
        int i = 0;
        int n = text.length();
        while (true) {
            while (i < n && Character.isWhitespace(text.charAt(i))) {
                i++;
            }
            Matcher part = IDENTIFIER_PART.matcher(text).region(i, n);
            if (!part.lookingAt()) {
                return List.of();
            }
            parts.add(part.group(1) != null ? part.group(1).replace("``", "`") : part.group(2));
            i = part.end();
            while (i < n && Character.isWhitespace(text.charAt(i))) {
                i++;
            }
            if (i == n) {
                return parts;
            }
            if (text.charAt(i) != '.') {
                return List.of();
            }
            i++;
        }
    }
}
