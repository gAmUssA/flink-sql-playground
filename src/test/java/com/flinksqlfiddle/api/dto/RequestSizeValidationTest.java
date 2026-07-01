package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.ExecutionMode;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression tests for the @Size caps that bound request payloads so a single request
 * can't submit or persist an unreasonably large SQL script (storage/DoS hardening).
 */
class RequestSizeValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    private static final int MAX = 50_000;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    void executeRequestRejectsOversizedSql() {
        ExecuteRequest tooBig = new ExecuteRequest("x".repeat(MAX + 1), ExecutionMode.BATCH);
        assertFalse(validator.validate(tooBig).isEmpty(), "oversized sql must be rejected");
    }

    @Test
    void executeRequestAcceptsSqlAtLimit() {
        ExecuteRequest atLimit = new ExecuteRequest("x".repeat(MAX), ExecutionMode.BATCH);
        assertTrue(validator.validate(atLimit).isEmpty(), "sql at the limit must be accepted");
    }

    @Test
    void saveFiddleRequestRejectsOversizedQuery() {
        SaveFiddleRequest tooBig =
                new SaveFiddleRequest("CREATE TABLE t (id INT)", "y".repeat(MAX + 1), ExecutionMode.BATCH);
        assertFalse(validator.validate(tooBig).isEmpty(), "oversized query must be rejected");
    }

    @Test
    void saveFiddleRequestRejectsOversizedSchema() {
        SaveFiddleRequest tooBig =
                new SaveFiddleRequest("z".repeat(MAX + 1), "SELECT 1", ExecutionMode.BATCH);
        assertFalse(validator.validate(tooBig).isEmpty(), "oversized schema must be rejected");
    }

    @Test
    void saveFiddleRequestAcceptsNormalPayload() {
        SaveFiddleRequest ok =
                new SaveFiddleRequest("CREATE TABLE t (id INT)", "SELECT * FROM t", ExecutionMode.STREAMING);
        assertTrue(validator.validate(ok).isEmpty(), "normal payload must be accepted");
    }
}
