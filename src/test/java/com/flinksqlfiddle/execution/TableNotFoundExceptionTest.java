package com.flinksqlfiddle.execution;

import org.apache.flink.table.api.ValidationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Detection over the exception chains Flink 2.3 throws (shapes recorded from a real MiniCluster;
 * {@link TableNotFoundSmokeTest} checks them end to end). Calcite's classes live behind the
 * planner loader, so the test stands in classes of the same simple names.
 */
class TableNotFoundExceptionTest {

    static class SqlValidatorException extends Exception {
        SqlValidatorException(String message) {
            super(message);
        }
    }

    static class CalciteContextException extends RuntimeException {
        CalciteContextException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** ValidationException -> CalciteContextException -> SqlValidatorException, as Flink wraps them. */
    private static RuntimeException validation(String span, String message) {
        String positioned = "From line " + span + ": " + message;
        return new ValidationException("SQL validation failed. " + positioned,
                new CalciteContextException(positioned, new SqlValidatorException(message)));
    }

    private static Optional<TableNotFoundException> detect(RuntimeException e, String sql) {
        return TableNotFoundException.detect(e, sql);
    }

    @Test
    void unqualifiedMissingTable() {
        String sql = "SELECT *\nFROM orders";
        TableNotFoundException e = detect(validation("2, column 6 to line 2, column 11", "Object 'orders' not found"), sql)
                .orElseThrow();
        assertEquals("orders", e.table());
        assertNull(e.suggestion());
        assertEquals("SQL validation failed. From line 2, column 6 to line 2, column 11: Object 'orders' not found",
                e.getMessage());
    }

    @Test
    void caseMismatchCarriesFlinksSuggestion() {
        TableNotFoundException e = detect(validation("1, column 15 to line 1, column 19",
                "Object 'Users' not found within 'default_catalog.default_database'; did you mean 'users'?"),
                "SELECT * FROM Users").orElseThrow();
        assertEquals("Users", e.table());
        assertEquals("users", e.suggestion());
    }

    @Test
    void fullyQualifiedMissingTable() {
        assertEquals("orders", detect(validation("1, column 15 to line 1, column 53",
                "Object 'orders' not found within 'default_catalog.default_database'"),
                "SELECT * FROM default_catalog.default_database.orders").orElseThrow().table());
    }

    @Test
    void quotedNameWithAQuoteInIt() {
        assertEquals("we'ird", detect(validation("1, column 15 to line 1, column 22", "Object 'we'ird' not found"),
                "SELECT * FROM `we'ird`").orElseThrow().table());
    }

    @Test
    void missingDatabaseIsNotAMissingTable() {
        // FROM nodb.orders: Calcite reports the first part it could not resolve.
        assertTrue(detect(validation("1, column 15 to line 1, column 25", "Object 'nodb' not found"),
                "SELECT * FROM nodb.orders").isEmpty());
        // FROM default_catalog.nodb.orders: not found within a catalog, so a database.
        assertTrue(detect(validation("1, column 15 to line 1, column 41", "Object 'nodb' not found within 'default_catalog'"),
                "SELECT * FROM default_catalog.nodb.orders").isEmpty());
    }

    @Test
    void aCommentInsideTheNameDoesNotHideAMissingDatabase() {
        // Spans recorded from Flink 2.3: the span covers the whole name, comments included.
        assertTrue(detect(validation("1, column 15 to line 1, column 35", "Object 'nodb' not found"),
                "SELECT * FROM nodb /* c */ . orders").isEmpty());
        assertTrue(detect(validation("1, column 15 to line 3, column 7", "Object 'nodb' not found"),
                "SELECT * FROM nodb\n-- x\n.orders").isEmpty());
        // A comment inside the name of a missing table: still the table.
        TableNotFoundException e = detect(validation("1, column 15 to line 1, column 47",
                "Object 'orders' not found within 'default_catalog.default_database'"),
                "SELECT * FROM default_database /* c */ . orders").orElseThrow();
        assertEquals(List.of("default_database", "orders"), e.path());
    }

    @Test
    void aSpanThatHoldsMoreThanANameFailsClosed() {
        // An unclosed comment, or anything that is not a dotted name, is ambiguous: no claim.
        assertTrue(detect(validation("1, column 15 to line 1, column 24", "Object 'nodb' not found"),
                "SELECT * FROM nodb /* .orders").isEmpty());
        assertTrue(detect(validation("1, column 15 to line 1, column 22", "Object 'orders' not found"),
                "SELECT * FROM orders o").isEmpty());
    }

    @Test
    void aDatabaseWithADotInItsNameKeepsItsBoundaries() {
        // Calcite renders the database `sales.eu` as 'default_catalog.sales.eu': three dot parts.
        TableNotFoundException e = detect(validation("1, column 15 to line 1, column 31",
                "Object 'orders' not found within 'default_catalog.sales.eu'"),
                "SELECT * FROM `sales.eu`.orders").orElseThrow();
        assertEquals("orders", e.table());
        assertEquals(List.of("sales.eu", "orders"), e.path());
        assertEquals(List.of("default_catalog", "sales.eu", "orders"), detect(validation("1, column 15 to line 1, column 47",
                "Object 'orders' not found within 'default_catalog.sales.eu'"),
                "SELECT * FROM default_catalog.`sales.eu`.orders").orElseThrow().path());
        // `sales` (no such database) before orders: the database is missing.
        assertTrue(detect(validation("1, column 15 to line 1, column 28", "Object 'sales' not found"),
                "SELECT * FROM `sales`.orders").isEmpty());
        // Without the statement's text the rendered prefix is ambiguous: no claim.
        assertTrue(detect(validation("9, column 1 to line 9, column 9",
                "Object 'orders' not found within 'default_catalog.sales.eu'"), "SELECT * FROM v").isEmpty());
    }

    @Test
    void aNameRepeatedInThePathIsReadAtTheRightPart() {
        // Database x is missing in FROM default_catalog.x.x: Calcite resolved only the catalog.
        assertTrue(detect(validation("1, column 15 to line 1, column 33", "Object 'x' not found within 'default_catalog'"),
                "SELECT * FROM default_catalog.x.x").isEmpty());
        assertTrue(detect(validation("1, column 15 to line 1, column 17", "Object 'x' not found"),
                "SELECT * FROM x.x").isEmpty());
        assertEquals(List.of("x", "x"), detect(validation("1, column 15 to line 1, column 17",
                "Object 'x' not found within 'default_catalog.x'"), "SELECT * FROM x.x").orElseThrow().path());
    }

    @Test
    void thePathIsTheQualifiedNameTheStatementWrote() {
        assertEquals(List.of("orders"), detect(validation("2, column 6 to line 2, column 11", "Object 'orders' not found"),
                "SELECT *\nFROM orders").orElseThrow().path());
        assertEquals(List.of("other_db", "orders"), detect(validation("1, column 15 to line 1, column 29",
                "Object 'orders' not found within 'default_catalog.other_db'"),
                "SELECT * FROM other_db.orders").orElseThrow().path());
        RuntimeException insert = new ValidationException("Cannot find table '`default_catalog`.`sales.eu`.`sink`' "
                + "in any of the catalogs [default_catalog], nor as a temporary table.");
        TableNotFoundException e = detect(insert, "INSERT INTO `sales.eu`.sink SELECT 1").orElseThrow();
        assertEquals("sink", e.table());
        assertEquals(List.of("default_catalog", "sales.eu", "sink"), e.path());
    }

    @Test
    void spanCountsATabAsOneColumn() {
        // Calcite counts a tab as one column; the identifier at the span is `my orders`, one part.
        assertEquals("my orders", detect(validation("2, column 8 to line 2, column 18", "Object 'my orders' not found"),
                "SELECT *\n\tFROM\t\t`my orders`").orElseThrow().table());
        assertTrue(detect(validation("2, column 7 to line 2, column 19", "Object 'x' not found"),
                "SELECT *\nFROM  x.`my orders`").isEmpty());
    }

    @Test
    void aSpanOutsideTheStatementFallsBackToTheReportedName() {
        // A view's expanded text is not the statement: the span points elsewhere.
        assertEquals("tmp", detect(validation("9, column 6 to line 9, column 47", "Object 'tmp' not found"),
                "SELECT * FROM vv").orElseThrow().table());
    }

    @Test
    void missingInsertTarget() {
        RuntimeException e = new ValidationException("Cannot find table '`default_catalog`.`default_database`.`sink`' "
                + "in any of the catalogs [default_catalog], nor as a temporary table.");
        assertEquals("sink", detect(e, "INSERT INTO sink SELECT 1").orElseThrow().table());
    }

    @Test
    void describeOfAMissingTable() {
        RuntimeException e = new ValidationException(
                "Tables or views with the identifier 'default_catalog.default_database.orders' doesn't exist.");
        assertEquals("orders", detect(e, "DESCRIBE orders").orElseThrow().table());
    }

    @Test
    void createViewOverAMissingTableThrowsCalciteDirectly() {
        String positioned = "From line 1, column 42 to line 1, column 47: Object 'orders' not found";
        RuntimeException e = new CalciteContextException(positioned, new SqlValidatorException("Object 'orders' not found"));
        assertEquals("orders", detect(e, "CREATE TEMPORARY VIEW v AS SELECT * FROM orders").orElseThrow().table());
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "1, column 8 to line 1, column 11|Column 'nope' not found in any table",
            "1, column 10 to line 1, column 13|Column 'nope' not found in table 'u'",
            "1, column 29 to line 1, column 30|Table 'u2' not found",
            "1, column 8 to line 1, column 14|No match found for function signature nofn(<NUMERIC>)",
    })
    void otherValidationErrorsAreNotMissingTables(String span, String message) {
        assertTrue(detect(validation(span, message), "SELECT nope FROM users u WHERE u2.user_id = nofn(1)").isEmpty());
    }

    @Test
    void aRuntimeFailureWithTheSameWordsIsNotAMissingTable() {
        RuntimeException e = new RuntimeException("Query failed", new IllegalStateException("Object 'orders' not found"));
        assertTrue(detect(e, "SELECT * FROM orders").isEmpty());
    }

    @Test
    void parsesDottedIdentifiers() {
        assertEquals(List.of("a", "b c", "d`e"), TableNotFoundException.parseIdentifier("a . `b c`.`d``e`"));
        assertEquals(List.of(), TableNotFoundException.parseIdentifier("a b"));
        assertEquals(List.of(), TableNotFoundException.parseIdentifier("a."));
        assertEquals(List.of(), TableNotFoundException.parseIdentifier("TABLE(x)"));
        assertEquals(List.of("a", "b"), TableNotFoundException.parseIdentifier("/* x */ a -- y\n . /* z */ b -- end"));
        assertEquals(List.of(), TableNotFoundException.parseIdentifier("a /* b"));
        assertEquals(List.of(), TableNotFoundException.parseIdentifier("a /* x */ b"));
    }

    @Test
    void identifierAtRejectsSpansOffTheText() {
        assertEquals(List.of(), TableNotFoundException.identifierAt("SELECT 1", "From line 1, column 5 to line 1, column 99: "));
        assertEquals(List.of(), TableNotFoundException.identifierAt("SELECT 1", "From line 3, column 1 to line 3, column 2: "));
        assertEquals(List.of("orders"), TableNotFoundException.identifierAt("SELECT * FROM orders",
                "From line 1, column 15 to line 1, column 20: "));
    }
}
