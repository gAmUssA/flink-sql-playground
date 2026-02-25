package com.flinksqlfiddle.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SqlSecurityValidatorTest {

    private final SqlSecurityValidator validator = new SqlSecurityValidator();

    // --- Blocked statement types ---

    @Test
    void blockCreateFunction() {
        SecurityException ex = assertThrows(SecurityException.class, () ->
                validator.validate("CREATE FUNCTION myudf AS 'com.evil.Udf'"));
        assertTrue(ex.getMessage().contains("CREATE FUNCTION"));
    }

    @Test
    void blockCreateTemporaryFunction() {
        assertThrows(SecurityException.class, () ->
                validator.validate("CREATE TEMPORARY FUNCTION myudf AS 'com.evil.Udf'"));
    }

    @Test
    void blockCreateTemporarySystemFunction() {
        assertThrows(SecurityException.class, () ->
                validator.validate("CREATE TEMPORARY SYSTEM FUNCTION myudf AS 'com.evil.Udf'"));
    }

    @Test
    void blockSetStatement() {
        SecurityException ex = assertThrows(SecurityException.class, () ->
                validator.validate("SET 'execution.runtime-mode' = 'batch'"));
        assertTrue(ex.getMessage().contains("SET"));
    }

    @Test
    void blockAddJar() {
        SecurityException ex = assertThrows(SecurityException.class, () ->
                validator.validate("ADD JAR '/tmp/evil.jar'"));
        assertTrue(ex.getMessage().contains("ADD JAR"));
    }

    @Test
    void blockCreateCatalog() {
        SecurityException ex = assertThrows(SecurityException.class, () ->
                validator.validate("CREATE CATALOG mycat WITH ('type' = 'generic_in_memory')"));
        assertTrue(ex.getMessage().contains("CREATE CATALOG"));
    }

    // --- Connector whitelisting ---

    @Test
    void allowDatagenConnector() {
        assertDoesNotThrow(() ->
                validator.validate("CREATE TABLE t (id INT) WITH ('connector' = 'datagen')"));
    }

    @Test
    void allowPrintConnector() {
        assertDoesNotThrow(() ->
                validator.validate("CREATE TABLE t (id INT) WITH ('connector' = 'print')"));
    }

    @Test
    void allowBlackholeConnector() {
        assertDoesNotThrow(() ->
                validator.validate("CREATE TABLE t (id INT) WITH ('connector' = 'blackhole')"));
    }

    @Test
    void allowTemporaryTableWithDatagen() {
        assertDoesNotThrow(() ->
                validator.validate("CREATE TEMPORARY TABLE t (id INT) WITH ('connector' = 'datagen')"));
    }

    @Test
    void blockFilesystemConnector() {
        SecurityException ex = assertThrows(SecurityException.class, () ->
                validator.validate("CREATE TABLE t (id INT) WITH ('connector' = 'filesystem', 'path' = '/etc/passwd')"));
        assertTrue(ex.getMessage().contains("filesystem"));
    }

    @Test
    void blockJdbcConnector() {
        SecurityException ex = assertThrows(SecurityException.class, () ->
                validator.validate("CREATE TABLE t (id INT) WITH ('connector' = 'jdbc')"));
        assertTrue(ex.getMessage().contains("jdbc"));
    }

    // --- Safe statement types (allowlist verification) ---

    @Test
    void allowSelect() {
        assertDoesNotThrow(() -> validator.validate("SELECT id, val FROM test_source"));
    }

    @Test
    void allowCreateTemporaryView() {
        assertDoesNotThrow(() -> validator.validate("CREATE TEMPORARY VIEW v AS SELECT 1"));
    }

    @Test
    void allowDropTable() {
        assertDoesNotThrow(() -> validator.validate("DROP TABLE IF EXISTS t"));
    }

    @Test
    void allowDropView() {
        assertDoesNotThrow(() -> validator.validate("DROP VIEW IF EXISTS v"));
    }

    @Test
    void allowInsertIntoSelect() {
        assertDoesNotThrow(() -> validator.validate("INSERT INTO sink SELECT * FROM source"));
    }

    @Test
    void allowExplain() {
        assertDoesNotThrow(() -> validator.validate("EXPLAIN SELECT * FROM orders"));
    }

    // --- Multi-statement validation ---

    @Test
    void blockMixedValidAndInvalidStatements() {
        assertThrows(SecurityException.class, () ->
                validator.validate("SELECT 1; SET 'k' = 'v'"));
    }

    @Test
    void allowMultipleSafeStatements() {
        assertDoesNotThrow(() ->
                validator.validate("SELECT 1; SELECT 2"));
    }

    @Test
    void skipEmptyStatementsInMultiStatement() {
        assertDoesNotThrow(() ->
                validator.validate("SELECT 1; ; SELECT 2;"));
    }

    // --- Edge cases ---

    @Test
    void handleNullInput() {
        assertDoesNotThrow(() -> validator.validate(null));
    }

    @Test
    void handleEmptyInput() {
        assertDoesNotThrow(() -> validator.validate(""));
    }

    @Test
    void handleBlankInput() {
        assertDoesNotThrow(() -> validator.validate("   "));
    }

    @Test
    void caseInsensitiveBlocking() {
        assertThrows(SecurityException.class, () ->
                validator.validate("set 'key' = 'value'"));
        assertThrows(SecurityException.class, () ->
                validator.validate("create function f as 'x'"));
        assertThrows(SecurityException.class, () ->
                validator.validate("Add Jar '/tmp/evil.jar'"));
    }
}
