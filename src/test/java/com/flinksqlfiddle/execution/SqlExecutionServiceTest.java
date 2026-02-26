package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.apache.flink.table.api.TableEnvironment;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class SqlExecutionServiceTest {

    private SqlExecutionService service;
    private FlinkEnvironmentFactory factory;

    @BeforeEach
    void setUp() {
        factory = new FlinkEnvironmentFactory(
                new FlinkProperties(1, "8m", "32m", 5, null)
        );
        service = new SqlExecutionService(new SqlSecurityValidator());
    }

    @Test
    void executeSelectReturnsResults() {
        TableEnvironment env = factory.createBatchEnvironment();
        env.executeSql("""
                CREATE TEMPORARY TABLE test_source (
                    id INT, val INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '5',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '5',
                    'fields.val.min' = '1',
                    'fields.val.max' = '100'
                )
                """);

        QueryResult result = service.execute(env, "SELECT id, val FROM test_source");

        assertEquals(5, result.getRowCount());
        assertEquals(List.of("id", "val"), result.getColumnNames());
        assertEquals(2, result.getColumnTypes().size());
        assertFalse(result.isTruncated());
        assertTrue(result.getExecutionTimeMs() >= 0);
    }

    @Test
    void executeRejectsUnsafeSql() {
        TableEnvironment env = factory.createBatchEnvironment();
        assertThrows(SecurityException.class, () ->
                service.execute(env, "CREATE FUNCTION evil AS 'com.evil.Udf'"));
    }

    @Test
    void executeStreamingReturnsRowKindLabels() {
        TableEnvironment env = factory.createStreamingEnvironment();
        env.executeSql("""
                CREATE TEMPORARY TABLE test_source (
                    id INT, val INT
                ) WITH (
                    'connector' = 'datagen',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '3',
                    'fields.val.min' = '1',
                    'fields.val.max' = '100'
                )
                """);

        QueryResult result = service.execute(env, "SELECT id, val FROM test_source");

        assertEquals(3, result.getRowCount());
        assertFalse(result.getRowKinds().isEmpty());
        Set<String> validKinds = Set.of("+I", "-U", "+U", "-D");
        result.getRowKinds().forEach(kind ->
                assertTrue(validKinds.contains(kind), "Unexpected RowKind: " + kind));
    }

    @Test
    void executeColumnMetadataIsCorrect() {
        TableEnvironment env = factory.createBatchEnvironment();
        env.executeSql("""
                CREATE TEMPORARY TABLE test_source (
                    name STRING, age INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '1'
                )
                """);

        QueryResult result = service.execute(env, "SELECT name, age FROM test_source");

        assertEquals(List.of("name", "age"), result.getColumnNames());
        assertEquals(2, result.getColumnTypes().size());
    }

    @Test
    void executeTruncatesAtMaxRows() {
        TableEnvironment env = factory.createBatchEnvironment();
        env.executeSql("""
                CREATE TEMPORARY TABLE big_source (
                    id INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '1500',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '1500'
                )
                """);

        QueryResult result = service.execute(env, "SELECT id FROM big_source");

        assertEquals(1000, result.getRowCount());
        assertTrue(result.isTruncated());
    }

    // --- Dual-mode tests ---

    @Test
    void batchModeReturnsInsertRowKinds() {
        TableEnvironment env = factory.createBatchEnvironment();
        env.executeSql("""
                CREATE TEMPORARY TABLE test_source (
                    id INT, val INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '3',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '3',
                    'fields.val.min' = '1',
                    'fields.val.max' = '100'
                )
                """);

        QueryResult result = service.execute(env, "SELECT id, val FROM test_source");
        result.getRowKinds().forEach(kind -> assertEquals("+I", kind));
    }

    @Test
    void modeAwareExecutionSelectsBatchEnv() {
        FlinkSession session = new FlinkSession("test", factory);

        // DDL via session execute — synced to both envs
        service.execute(session, ExecutionMode.BATCH, """
                CREATE TEMPORARY TABLE src (id INT) WITH (
                    'connector' = 'datagen', 'number-of-rows' = '2',
                    'fields.id.kind' = 'sequence', 'fields.id.start' = '1', 'fields.id.end' = '2')
                """);

        QueryResult result = service.execute(session, ExecutionMode.BATCH, "SELECT id FROM src");
        assertEquals(2, result.getRowCount());
    }

    @Test
    void ddlSyncsMakesTableAvailableInBothModes() {
        FlinkSession session = new FlinkSession("test", factory);

        // Create table via STREAMING mode — should sync to BATCH env too
        service.execute(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE synced_src (id INT) WITH (
                    'connector' = 'datagen', 'number-of-rows' = '3',
                    'fields.id.kind' = 'sequence', 'fields.id.start' = '1', 'fields.id.end' = '3')
                """);

        // Query in BATCH mode — should find the table
        QueryResult batchResult = service.execute(session, ExecutionMode.BATCH,
                "SELECT id FROM synced_src");
        assertEquals(3, batchResult.getRowCount());
    }

    @Test
    void makeIdempotentPrependsDropForCreateTable() {
        String sql = "CREATE TABLE orders (id INT) WITH ('connector' = 'datagen')";
        String result = SqlExecutionService.makeIdempotent(sql);
        assertTrue(result.startsWith("DROP TABLE IF EXISTS orders;\n"));
        assertTrue(result.endsWith(sql));
    }

    @Test
    void makeIdempotentHandlesBacktickQuotedNames() {
        String sql = "CREATE TABLE `my-table` (id INT) WITH ('connector' = 'datagen')";
        String result = SqlExecutionService.makeIdempotent(sql);
        assertTrue(result.startsWith("DROP TABLE IF EXISTS `my-table`;\n"));
    }

    @Test
    void makeIdempotentHandlesTemporaryTable() {
        String sql = "CREATE TEMPORARY TABLE temp_orders (id INT) WITH ('connector' = 'datagen')";
        String result = SqlExecutionService.makeIdempotent(sql);
        assertTrue(result.startsWith("DROP TABLE IF EXISTS temp_orders;\n"));
    }

    @Test
    void makeIdempotentHandlesIfNotExists() {
        String sql = "CREATE TABLE IF NOT EXISTS orders (id INT) WITH ('connector' = 'datagen')";
        String result = SqlExecutionService.makeIdempotent(sql);
        assertTrue(result.startsWith("DROP TABLE IF EXISTS orders;\n"));
    }

    @Test
    void makeIdempotentPassesThroughNonCreateStatements() {
        assertEquals("SELECT * FROM t", SqlExecutionService.makeIdempotent("SELECT * FROM t"));
        assertEquals("DROP TABLE t", SqlExecutionService.makeIdempotent("DROP TABLE t"));
        assertEquals("CREATE VIEW v AS SELECT 1", SqlExecutionService.makeIdempotent("CREATE VIEW v AS SELECT 1"));
    }

    @Test
    void isDdlDetectsStatements() {
        assertTrue(SqlExecutionService.isDdl("CREATE TABLE t (id INT) WITH ('connector' = 'datagen')"));
        assertTrue(SqlExecutionService.isDdl("CREATE TEMPORARY TABLE t (id INT) WITH ('connector' = 'datagen')"));
        assertTrue(SqlExecutionService.isDdl("CREATE VIEW v AS SELECT 1"));
        assertTrue(SqlExecutionService.isDdl("CREATE TEMPORARY VIEW v AS SELECT 1"));
        assertTrue(SqlExecutionService.isDdl("DROP TABLE t"));
        assertTrue(SqlExecutionService.isDdl("DROP VIEW v"));
        assertFalse(SqlExecutionService.isDdl("SELECT * FROM t"));
        assertFalse(SqlExecutionService.isDdl("INSERT INTO t SELECT 1"));
        assertFalse(SqlExecutionService.isDdl("EXPLAIN SELECT * FROM t"));
    }
}
