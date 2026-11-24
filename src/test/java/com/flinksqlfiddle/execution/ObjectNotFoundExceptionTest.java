package com.flinksqlfiddle.execution;

import org.apache.flink.table.api.ValidationException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ObjectNotFoundExceptionTest {

    @Test
    void flinksThreeDropShapesAreDetectedAndKeepTheMessage() {
        for (String message : new String[]{
                "Table with identifier 'default_catalog.default_database.nope' does not exist.",
                "View with identifier 'default_catalog.default_database.nope' does not exist.",
                "Temporary table or view with identifier 'default_catalog.default_database.nope' does not exist."}) {
            ObjectNotFoundException e = ObjectNotFoundException.detect(new ValidationException(message)).orElseThrow();
            assertEquals(message, e.getMessage());
        }
    }

    @Test
    void aPlainDropOfATemporaryObjectIsDetected() {
        String view = "Temporary view with identifier '`default_catalog`.`default_database`.`tv`' exists. Drop it first before removing the permanent view.";
        String table = "Temporary table with identifier '`a`.`b`.`tt`' exists. Drop it first before removing the permanent table.";
        assertEquals(view, ObjectNotFoundException.detect(new ValidationException(view)).orElseThrow().getMessage());
        assertEquals(table, ObjectNotFoundException.detect(new ValidationException(table)).orElseThrow().getMessage());
        assertTrue(ObjectNotFoundException.detect(new ValidationException(view + " Extra.")).isEmpty());
    }

    @Test
    void aHintFollowsFlinksMessage() {
        ObjectNotFoundException e = ObjectNotFoundException
                .detect(new ValidationException("Table with identifier 'a.b.v' does not exist."))
                .orElseThrow().withHint("Use DROP VIEW to drop a view.");
        assertEquals("Table with identifier 'a.b.v' does not exist. Use DROP VIEW to drop a view.", e.getMessage());
    }

    @Test
    void wrappedValidationErrorIsFound() {
        RuntimeException wrapped = new RuntimeException("outer",
                new ValidationException("View with identifier 'x.y.z' does not exist."));
        // The error body carries Flink's text, not the wrapper's.
        assertEquals("View with identifier 'x.y.z' does not exist.",
                ObjectNotFoundException.detect(wrapped).orElseThrow().getMessage());
    }

    @Test
    void aRuntimeFailureWithSimilarWordsIsNotDetected() {
        assertTrue(ObjectNotFoundException.detect(
                new IllegalStateException("Table with identifier 'a.b.c' does not exist.")).isEmpty());
        assertTrue(ObjectNotFoundException.detect(
                new RuntimeException("Job failed", new java.io.IOException("Table with identifier 'a.b.c' does not exist."))).isEmpty());
    }

    @Test
    void otherValidationErrorsAreNotDetected() {
        for (String message : new String[]{
                "Table with identifier 'a.b.c' already exists.",
                "Could not execute DropTable in path `a`.`b`.`c`",
                "Object 'orders' not found",
                "Tables or views with the identifier 'a.b.c' doesn't exist."}) {
            assertTrue(ObjectNotFoundException.detect(new ValidationException(message)).isEmpty(), message);
        }
    }

    @Test
    void theExistingMissingTableShapesAreStillTableNotFound() {
        assertTrue(TableNotFoundException.detect(new ValidationException("Object 'orders' not found"), "SELECT * FROM orders").isPresent());
        assertTrue(TableNotFoundException.detect(
                new ValidationException("Table with identifier 'default_catalog.default_database.nope' does not exist."),
                "DROP TABLE nope").isEmpty());
    }
}
