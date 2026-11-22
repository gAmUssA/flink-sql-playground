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
    }

    @Test
    void identifierAtRejectsSpansOffTheText() {
        assertEquals(List.of(), TableNotFoundException.identifierAt("SELECT 1", "From line 1, column 5 to line 1, column 99: "));
        assertEquals(List.of(), TableNotFoundException.identifierAt("SELECT 1", "From line 3, column 1 to line 3, column 2: "));
        assertEquals(List.of("orders"), TableNotFoundException.identifierAt("SELECT * FROM orders",
                "From line 1, column 15 to line 1, column 20: "));
    }
}
