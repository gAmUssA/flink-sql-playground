package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.execution.timeline.TimelineService;
import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.flink.SharedMiniCluster;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * A DROP of a missing object, or of one of the other kind, is an {@link ObjectNotFoundException}
 * (HTTP 400, code OBJECT_NOT_FOUND) in both modes, with the message shapes the real Flink planner
 * produces. IF EXISTS and the DROP of existing objects keep working, and both environments stay in
 * sync. Run it after every Flink bump.
 */
@Tag("smoke")
class DropMissingSmokeTest {

    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 5, null, true, 0, null, null);
    private static SharedMiniCluster cluster;

    private SqlExecutionService service;
    private FlinkSession session;

    @BeforeAll
    static void startCluster() {
        cluster = new SharedMiniCluster(PROPERTIES);
        cluster.startAsync();
    }

    @AfterAll
    static void stopCluster() throws Exception {
        cluster.close();
    }

    @BeforeEach
    void setUp() {
        service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
        session = new FlinkSession("smoke-drop-missing", new FlinkEnvironmentFactory(PROPERTIES, cluster));
        run("CREATE TEMPORARY TABLE tt (a INT) WITH ('connector' = 'datagen', 'number-of-rows' = '3')");
        run("CREATE TEMPORARY VIEW tv AS SELECT a FROM tt");
        run("CREATE VIEW pv AS SELECT 1 AS x");
    }

    @AfterEach
    void tearDown() {
        session.close();
    }

    private void run(String sql) {
        service.execute(session, ExecutionMode.STREAMING, sql);
    }

    private ObjectNotFoundException notFound(ExecutionMode mode, String sql) {
        return assertThrows(ObjectNotFoundException.class, () -> service.execute(session, mode, sql), sql);
    }

    @Test
    void aMissingObjectIsNotFoundInBothModes() {
        for (ExecutionMode mode : ExecutionMode.values()) {
            for (String sql : List.of("DROP TABLE nope", "DROP TEMPORARY TABLE nope", "DROP VIEW nope",
                    "DROP TEMPORARY VIEW nope", "-- note\ndrop table `nope`", "DROP TABLE default_catalog.default_database.nope")) {
                ObjectNotFoundException e = notFound(mode, sql);
                assertTrue(e.getMessage().contains("does not exist."), e.getMessage());
                assertFalse(e.getMessage().contains("Use DROP"), "a missing object has no hint: " + e.getMessage());
            }
        }
    }

    @Test
    void aViewDroppedAsATableSaysDropView() {
        for (ExecutionMode mode : ExecutionMode.values()) {
            assertTrue(notFound(mode, "DROP TEMPORARY TABLE tv").getMessage().endsWith("Use DROP TEMPORARY VIEW to drop a view."));
            assertTrue(notFound(mode, "DROP TABLE tv").getMessage().endsWith("Use DROP TEMPORARY VIEW to drop a view."));
            assertTrue(notFound(mode, "DROP TABLE pv").getMessage().endsWith("Use DROP VIEW to drop a view."));
            assertTrue(notFound(mode, "DROP TABLE default_catalog.default_database.pv").getMessage().endsWith("Use DROP VIEW to drop a view."));
        }
    }

    @Test
    void aTableDroppedAsAViewSaysDropTable() {
        for (ExecutionMode mode : ExecutionMode.values()) {
            assertTrue(notFound(mode, "DROP VIEW tt").getMessage().endsWith("Use DROP TEMPORARY TABLE to drop a table."));
            assertTrue(notFound(mode, "DROP TEMPORARY VIEW tt").getMessage().endsWith("Use DROP TEMPORARY TABLE to drop a table."));
        }
    }

    @Test
    void aFailedDropLeavesBothEnvironmentsAsTheyWere() {
        notFound(ExecutionMode.BATCH, "DROP TABLE tv");
        notFound(ExecutionMode.STREAMING, "DROP VIEW tt");
        for (ExecutionMode mode : ExecutionMode.values()) {
            assertDoesNotThrow(() -> service.execute(session, mode, "SELECT * FROM tv"));
            assertDoesNotThrow(() -> service.execute(session, mode, "SELECT * FROM tt"));
        }
    }

    @Test
    void ifExistsStillSucceeds() {
        for (ExecutionMode mode : ExecutionMode.values()) {
            assertDoesNotThrow(() -> service.execute(session, mode, "DROP TABLE IF EXISTS nope"));
            assertDoesNotThrow(() -> service.execute(session, mode, "DROP VIEW IF EXISTS nope"));
            assertDoesNotThrow(() -> service.execute(session, mode, "DROP TEMPORARY TABLE IF EXISTS nope"));
            assertDoesNotThrow(() -> service.execute(session, mode, "DROP TEMPORARY VIEW IF EXISTS nope"));
        }
    }

    @Test
    void droppingExistingObjectsStillWorksAndGoesFromBothEnvironments() {
        for (ExecutionMode mode : ExecutionMode.values()) {
            run("CREATE TEMPORARY TABLE d1 (a INT) WITH ('connector' = 'datagen', 'number-of-rows' = '1')");
            run("CREATE TEMPORARY VIEW d2 AS SELECT 1 AS x");
            run("CREATE VIEW d3 AS SELECT 1 AS x");
            for (String sql : List.of("DROP TEMPORARY TABLE d1", "DROP TEMPORARY VIEW d2", "DROP VIEW d3")) {
                assertDoesNotThrow(() -> service.execute(session, mode, sql), sql);
            }
            for (String name : List.of("d1", "d2", "d3")) {
                for (ExecutionMode other : ExecutionMode.values()) {
                    assertThrows(TableNotFoundException.class,
                            () -> service.execute(session, other, "SELECT * FROM " + name), name + " in " + other);
                }
            }
        }
    }

    @Test
    void everyPlanningPathAnswersNotFoundNotAnInternalError() {
        String sql = "DROP TABLE nope";
        assertThrows(ObjectNotFoundException.class, () -> service.prepareStream(session, sql));
        // A DROP has no plan: explain refuses it as a bad request, never a 500.
        assertThrows(NotExplainableException.class, () -> service.explain(session, ExecutionMode.STREAMING, sql));
        RuntimeException timeline = assertThrows(RuntimeException.class,
                () -> new TimelineService(service).prepare(session, sql));
        assertTrue(timeline instanceof ObjectNotFoundException || timeline instanceof NotExplainableException
                        || timeline instanceof com.flinksqlfiddle.security.ForbiddenSqlException
                        || timeline instanceof IllegalArgumentException,
                "timeline: " + timeline);
    }

    @Test
    void aRuntimeFailureWithSimilarWordsStaysInternal() {
        // A planner-valid DROP that fails for another reason is not "not found".
        assertFalse(ObjectNotFoundException.detect(new IllegalStateException(
                "Table with identifier 'a.b.c' does not exist.")).isPresent());
    }

    @Test
    void theExistingMissingTableShapeStillWins() {
        TableNotFoundException e = assertThrows(TableNotFoundException.class,
                () -> service.execute(session, ExecutionMode.BATCH, "SELECT * FROM orders"));
        assertEquals("orders", e.table());
    }
}
