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
import org.junit.jupiter.api.function.Executable;

import static org.junit.jupiter.api.Assertions.*;

/**
 * A query against a table the session has not built fails with {@link TableNotFoundException}
 * on every path the API exposes (execute in both modes, the stream, explain, the timeline
 * probe), with the message shapes the real Flink planner produces.
 */
@Tag("smoke")
class TableNotFoundSmokeTest {

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
        session = new FlinkSession("smoke-not-found", new FlinkEnvironmentFactory(PROPERTIES, cluster));
        service.execute(session, ExecutionMode.STREAMING,
                "CREATE TEMPORARY TABLE users (user_id INT, name STRING, pt AS PROCTIME()) WITH ('connector' = 'datagen', 'number-of-rows' = '3')");
    }

    @AfterEach
    void tearDown() {
        session.close();
    }

    private static TableNotFoundException missing(Executable call) {
        return assertThrows(TableNotFoundException.class, call);
    }

    @Test
    void everyPathNamesTheMissingTable() {
        String sql = "SELECT o.id\nFROM orders o";
        for (ExecutionMode mode : ExecutionMode.values()) {
            TableNotFoundException e = missing(() -> service.execute(session, mode, sql));
            assertEquals("orders", e.table());
            assertTrue(e.getMessage().contains("Object 'orders' not found"), e.getMessage());
            assertEquals("orders", missing(() -> service.explain(session, mode, sql)).table());
        }
        assertEquals("orders", missing(() -> service.prepareStream(session, sql)).table());
        assertEquals("orders", missing(() -> new TimelineService(service).prepare(session, sql)).table());
    }

    @Test
    void qualifiedQuotedAndCaseMismatchedNames() {
        assertEquals("orders", missing(() -> service.execute(session, ExecutionMode.BATCH,
                "SELECT * FROM default_catalog.default_database.orders")).table());
        assertEquals("my orders", missing(() -> service.execute(session, ExecutionMode.BATCH,
                "SELECT *\n\tFROM\t`my orders`")).table());
        TableNotFoundException upper = missing(() -> service.execute(session, ExecutionMode.BATCH, "SELECT * FROM Users"));
        assertEquals("Users", upper.table());
        assertEquals("users", upper.suggestion());
    }

    @Test
    void cteAndTemporalJoinSides() {
        assertEquals("orders", missing(() -> service.explain(session, ExecutionMode.STREAMING,
                "WITH o AS (SELECT * FROM orders) SELECT * FROM o")).table());
        assertEquals("rates", missing(() -> service.explain(session, ExecutionMode.STREAMING,
                "SELECT * FROM users u JOIN rates FOR SYSTEM_TIME AS OF u.pt AS r ON u.user_id = r.id")).table());
    }

    @Test
    void insertTargetAndViewOverAMissingTable() {
        assertEquals("sink", missing(() -> service.explain(session, ExecutionMode.STREAMING,
                "INSERT INTO sink SELECT * FROM users")).table());
        assertEquals("orders", missing(() -> service.execute(session, ExecutionMode.STREAMING,
                "CREATE TEMPORARY VIEW v AS SELECT * FROM orders")).table());
    }

    @Test
    void otherErrorsStayWhatTheyWere() {
        // A missing database, a missing column and an unknown alias are not missing tables.
        for (String sql : new String[]{"SELECT * FROM nodb.orders", "SELECT * FROM default_catalog.nodb.orders",
                "SELECT nope FROM users", "SELECT u2.name FROM users u"}) {
            RuntimeException e = assertThrows(RuntimeException.class, () -> service.execute(session, ExecutionMode.BATCH, sql));
            assertFalse(e instanceof TableNotFoundException, sql);
            NotExplainableException plan = assertThrows(NotExplainableException.class,
                    () -> service.explain(session, ExecutionMode.STREAMING, sql));
            assertEquals("INVALID_SQL", plan.code(), sql);
        }
    }
}
