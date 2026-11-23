package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.security.ForbiddenSqlException;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.apache.flink.table.api.TableEnvironment;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@Tag("smoke")
class SqlExecutionServiceTest {

    private SqlExecutionService service;
    private FlinkEnvironmentFactory factory;

    @BeforeEach
    void setUp() {
        factory = new FlinkEnvironmentFactory(
                new FlinkProperties(1, "8m", "32m", 5, null)
        );
        service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
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

        assertEquals(5, result.rowCount());
        assertEquals(List.of("id", "val"), result.columnNames());
        assertEquals(2, result.columnTypes().size());
        assertFalse(result.truncated());
        assertTrue(result.executionTimeMs() >= 0);
    }

    @Test
    void executeRejectsUnsafeSql() {
        TableEnvironment env = factory.createBatchEnvironment();
        assertThrows(ForbiddenSqlException.class, () ->
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

        assertEquals(3, result.rowCount());
        assertFalse(result.rowKinds().isEmpty());
        Set<String> validKinds = Set.of("+I", "-U", "+U", "-D");
        result.rowKinds().forEach(kind ->
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

        assertEquals(List.of("name", "age"), result.columnNames());
        assertEquals(2, result.columnTypes().size());
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

        assertEquals(1000, result.rowCount());
        assertTrue(result.truncated());
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
        result.rowKinds().forEach(kind -> assertEquals("+I", kind));
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
        assertEquals(2, result.rowCount());
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
        assertEquals(3, batchResult.rowCount());
    }

    // --- views over unbounded tables (bean nhqw: the dimension presets deduplicate in a view) ---

    private static final String UNBOUNDED_UPDATES = """
            CREATE TEMPORARY TABLE tank_updates (
                tank_id INT,
                tank_name STRING,
                proc_time AS PROCTIME()
            ) WITH (
                'connector' = 'faker',
                'rows-per-second' = '1',
                'fields.tank_id.expression' = '#{Number.numberBetween ''1'',''10''}',
                'fields.tank_name.expression' = '#{Name.firstName}'
            )""";

    private static final String LATEST_TANKS = """
            CREATE TEMPORARY VIEW tanks AS
            SELECT tank_id, tank_name
            FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY tank_id ORDER BY proc_time DESC) AS rn
                FROM tank_updates
            )
            WHERE rn = 1""";

    @Test
    void aViewOverAnUnboundedTableIsCreatedForStreamingOnly() {
        FlinkSession session = new FlinkSession("test", factory);
        service.execute(session, ExecutionMode.STREAMING, UNBOUNDED_UPDATES);
        service.execute(session, ExecutionMode.STREAMING, LATEST_TANKS);

        assertTrue(session.isStreamingOnlyView("tanks"));
        assertEquals("Rank", service.explain(session, ExecutionMode.STREAMING, "SELECT * FROM tanks")
                .nodes().stream().map(n -> n.kind()).filter("Rank"::equals).findFirst().orElse(null));
        StreamingOnlyViewException batch = assertThrows(StreamingOnlyViewException.class,
                () -> service.execute(session, ExecutionMode.BATCH, "SELECT * FROM tanks"));
        assertEquals("tanks", batch.view());
        assertTrue(batch.getMessage().contains("Streaming mode only"), batch.getMessage());
        NotExplainableException explain = assertThrows(NotExplainableException.class,
                () -> service.explain(session, ExecutionMode.BATCH, "SELECT * FROM tanks"));
        assertEquals("STREAMING_ONLY_VIEW", explain.code());
    }

    @Test
    void buildingTheSchemaAgainKeepsTheViewStreamingOnly() {
        FlinkSession session = new FlinkSession("test", factory);
        for (int i = 0; i < 2; i++) {
            service.execute(session, ExecutionMode.STREAMING, UNBOUNDED_UPDATES);
            service.execute(session, ExecutionMode.STREAMING, LATEST_TANKS);
        }
        assertTrue(session.isStreamingOnlyView("tanks"));
        assertThrows(StreamingOnlyViewException.class,
                () -> service.execute(session, ExecutionMode.BATCH, "SELECT * FROM tanks"));
    }

    @Test
    void aViewRecreatedOverABoundedTableWorksInBatchAgain() {
        FlinkSession session = new FlinkSession("test", factory);
        service.execute(session, ExecutionMode.STREAMING, UNBOUNDED_UPDATES);
        service.execute(session, ExecutionMode.STREAMING, LATEST_TANKS);
        service.execute(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE bounded_tanks (tank_id INT, tank_name STRING) WITH (
                    'connector' = 'datagen', 'number-of-rows' = '3',
                    'fields.tank_id.kind' = 'sequence', 'fields.tank_id.start' = '1', 'fields.tank_id.end' = '3')
                """);
        service.execute(session, ExecutionMode.STREAMING, "CREATE TEMPORARY VIEW tanks AS SELECT * FROM bounded_tanks");

        assertFalse(session.isStreamingOnlyView("tanks"));
        assertEquals(3, service.execute(session, ExecutionMode.BATCH, "SELECT * FROM tanks").rowCount());
    }

    @Test
    void aDroppedStreamingOnlyViewIsMissingInBothModes() {
        FlinkSession session = new FlinkSession("test", factory);
        service.execute(session, ExecutionMode.STREAMING, UNBOUNDED_UPDATES);
        service.execute(session, ExecutionMode.STREAMING, LATEST_TANKS);
        service.execute(session, ExecutionMode.STREAMING, "DROP TEMPORARY VIEW tanks");

        assertFalse(session.isStreamingOnlyView("tanks"));
        assertThrows(TableNotFoundException.class,
                () -> service.execute(session, ExecutionMode.BATCH, "SELECT * FROM tanks"));
    }

    @Test
    void aViewWithAnotherErrorStillFails() {
        FlinkSession session = new FlinkSession("test", factory);
        assertThrows(TableNotFoundException.class, () -> service.execute(session, ExecutionMode.STREAMING,
                "CREATE TEMPORARY VIEW v AS SELECT * FROM no_such_table"));
        assertFalse(session.isStreamingOnlyView("v"));
    }

    @Test
    void ddlObjectNameIsTheUnquotedLastNamePart() {
        assertEquals(Optional.of("tanks"), SqlExecutionService.ddlObjectName("CREATE TEMPORARY VIEW tanks AS SELECT 1"));
        assertEquals(Optional.of("my view"), SqlExecutionService.ddlObjectName(
                "-- note\nCREATE VIEW IF NOT EXISTS db.`my view` AS SELECT 1"));
        assertEquals(Optional.of("t"), SqlExecutionService.ddlObjectName("DROP TEMPORARY VIEW IF EXISTS t;"));
        assertEquals(Optional.of("orders"), SqlExecutionService.ddlObjectName("CREATE TABLE orders (id INT)"));
        assertEquals(Optional.empty(), SqlExecutionService.ddlObjectName("SELECT 1"));
    }

    @Test
    void dropStatementForCreateTable() {
        String sql = "CREATE TABLE orders (id INT) WITH ('connector' = 'datagen')";
        assertEquals(Optional.of("DROP TABLE IF EXISTS orders"),
                SqlExecutionService.dropStatementFor(sql));
    }

    @Test
    void dropStatementForBacktickQuotedNames() {
        String sql = "CREATE TABLE `my-table` (id INT) WITH ('connector' = 'datagen')";
        assertEquals(Optional.of("DROP TABLE IF EXISTS `my-table`"),
                SqlExecutionService.dropStatementFor(sql));
    }

    @Test
    void dropStatementForTemporaryTable() {
        String sql = "CREATE TEMPORARY TABLE temp_orders (id INT) WITH ('connector' = 'datagen')";
        assertEquals(Optional.of("DROP TEMPORARY TABLE IF EXISTS temp_orders"),
                SqlExecutionService.dropStatementFor(sql));
    }

    @Test
    void dropStatementForIfNotExists() {
        String sql = "CREATE TABLE IF NOT EXISTS orders (id INT) WITH ('connector' = 'datagen')";
        assertEquals(Optional.of("DROP TABLE IF EXISTS orders"),
                SqlExecutionService.dropStatementFor(sql));
    }

    @Test
    void dropStatementForEmptyOnNonCreateStatements() {
        assertEquals(Optional.empty(), SqlExecutionService.dropStatementFor("SELECT * FROM t"));
        assertEquals(Optional.empty(), SqlExecutionService.dropStatementFor("DROP TABLE t"));
        assertEquals(Optional.empty(), SqlExecutionService.dropStatementFor("DROP VIEW v"));
        assertEquals(Optional.empty(), SqlExecutionService.dropStatementFor("CREATE FUNCTION f AS 'x.Y'"));
    }

    @Test
    void dropStatementForViewsMatchesTheirKind() {
        // A rebuild after a partial build must get past the views the first build created.
        assertEquals(Optional.of("DROP VIEW IF EXISTS v"),
                SqlExecutionService.dropStatementFor("CREATE VIEW v AS SELECT 1"));
        assertEquals(Optional.of("DROP TEMPORARY VIEW IF EXISTS v"),
                SqlExecutionService.dropStatementFor("create temporary view v AS SELECT 1"));
        assertEquals(Optional.of("DROP TEMPORARY VIEW IF EXISTS v"),
                SqlExecutionService.dropStatementFor("-- dedup\nCREATE TEMPORARY VIEW IF NOT EXISTS v(a) AS SELECT 1"));
    }

    @Test
    void dropStatementForKeepsTheWholeQualifiedName() {
        assertEquals(Optional.of("DROP TEMPORARY TABLE IF EXISTS `my db`.`my-table`"),
                SqlExecutionService.dropStatementFor("CREATE TEMPORARY TABLE `my db`.`my-table` (id INT)"));
        assertEquals(Optional.of("DROP TABLE IF EXISTS cat.db.orders"),
                SqlExecutionService.dropStatementFor("CREATE TABLE cat.db.orders(id INT)"));
        assertEquals(Optional.of("DROP TEMPORARY VIEW IF EXISTS db . v"),
                SqlExecutionService.dropStatementFor("CREATE TEMPORARY VIEW db . v AS SELECT 1"));
    }

    @Test
    void isDdlDetectsStatements() {
        assertTrue(SqlExecutionService.isDdl("CREATE TABLE t (id INT) WITH ('connector' = 'datagen')"));
        assertTrue(SqlExecutionService.isDdl("CREATE TEMPORARY TABLE t (id INT) WITH ('connector' = 'datagen')"));
        assertTrue(SqlExecutionService.isDdl("CREATE VIEW v AS SELECT 1"));
        assertTrue(SqlExecutionService.isDdl("CREATE TEMPORARY VIEW v AS SELECT 1"));
        assertTrue(SqlExecutionService.isDdl("DROP TABLE t"));
        assertTrue(SqlExecutionService.isDdl("DROP VIEW v"));
        assertTrue(SqlExecutionService.isDdl("DROP TEMPORARY TABLE t"));
        assertTrue(SqlExecutionService.isDdl("DROP TEMPORARY VIEW v"));
        assertTrue(SqlExecutionService.isDdl("DROP TEMPORARY TABLE IF EXISTS t"));
        assertFalse(SqlExecutionService.isDdl("SELECT * FROM t"));
        assertFalse(SqlExecutionService.isDdl("INSERT INTO t SELECT 1"));
        assertFalse(SqlExecutionService.isDdl("EXPLAIN SELECT * FROM t"));
    }

    @Test
    void isDdlDetectsStatementsWithLeadingComments() {
        // Leading line comment(s)
        assertTrue(SqlExecutionService.isDdl("-- a note\nCREATE TABLE t (id INT)"));
        assertTrue(SqlExecutionService.isDdl("-- one\n-- two\n  CREATE TEMPORARY TABLE t (id INT)"));
        assertTrue(SqlExecutionService.isDdl("-- comment with a ; semicolon\nDROP TABLE t"));
        // Leading block comment + whitespace
        assertTrue(SqlExecutionService.isDdl("/* block\n comment */\nCREATE TABLE t (id INT)"));
        assertTrue(SqlExecutionService.isDdl("   \n  -- indented\n   CREATE VIEW v AS SELECT 1"));
        // A comment that merely mentions CREATE is still not DDL on its own
        assertFalse(SqlExecutionService.isDdl("-- CREATE TABLE in a comment\nSELECT * FROM t"));
    }

    @Test
    void dropStatementForHandlesLeadingComments() {
        assertEquals(Optional.of("DROP TABLE IF EXISTS orders"),
                SqlExecutionService.dropStatementFor("-- create the orders table\nCREATE TABLE orders (id INT)"));
        assertEquals(Optional.of("DROP TEMPORARY TABLE IF EXISTS orders"),
                SqlExecutionService.dropStatementFor("/* setup */ CREATE TEMPORARY TABLE orders (id INT)"));
    }

    @Test
    void stripLeadingCommentsRemovesOnlyLeadingComments() {
        assertEquals("CREATE TABLE t (id INT)",
                SqlExecutionService.stripLeadingComments("-- note\nCREATE TABLE t (id INT)"));
        assertEquals("CREATE TABLE t (id INT)",
                SqlExecutionService.stripLeadingComments("  -- a\n  -- b\n  CREATE TABLE t (id INT)"));
        assertEquals("CREATE TABLE t (id INT)",
                SqlExecutionService.stripLeadingComments("/* a */ CREATE TABLE t (id INT)"));
        // No leading comment -> unchanged; trailing comment preserved
        assertEquals("SELECT 1 -- trailing", SqlExecutionService.stripLeadingComments("SELECT 1 -- trailing"));
        assertEquals("", SqlExecutionService.stripLeadingComments(null));
    }
}
