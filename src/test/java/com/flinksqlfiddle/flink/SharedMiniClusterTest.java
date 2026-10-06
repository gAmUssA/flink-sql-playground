package com.flinksqlfiddle.flink;

import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.types.Row;
import org.apache.flink.util.CloseableIterator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@Tag("smoke")
class SharedMiniClusterTest {

    // Two slots, so running more queries than that proves finished jobs release their slots.
    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 1, null, true, 2, "32m", Duration.ofSeconds(60));

    private static SharedMiniCluster cluster;
    private static FlinkEnvironmentFactory factory;

    @BeforeAll
    static void start() {
        cluster = new SharedMiniCluster(PROPERTIES);
        cluster.startAsync();
        factory = new FlinkEnvironmentFactory(PROPERTIES, cluster);
    }

    @AfterAll
    static void stop() throws Exception {
        cluster.close();
    }

    @Test
    void restEndpointBindsToLoopbackOnEphemeralPort() {
        URI rest = cluster.awaitRestAddress();

        assertEquals("127.0.0.1", rest.getHost());
        assertTrue(rest.getPort() > 0);
        assertNotEquals(8081, rest.getPort());
        assertTrue(cluster.isRunning());
    }

    @Test
    void batchAndStreamingQueriesRunOnTheSharedCluster() throws Exception {
        TableEnvironment batch = factory.createBatchEnvironment();
        batch.executeSql(boundedSource("b_src", 5));
        assertEquals(5, collectRows(batch.executeSql("SELECT id FROM b_src")).size());

        TableEnvironment stream = factory.createStreamingEnvironment();
        stream.executeSql(boundedSource("s_src", 10));
        assertEquals(10, collectRows(stream.executeSql("SELECT id FROM s_src")).size());
    }

    @Test
    void finishedJobsReleaseTheirSlots() throws Exception {
        TableEnvironment env = factory.createBatchEnvironment();
        env.executeSql(boundedSource("seq_src", 3));

        for (int i = 0; i < 5; i++) {
            assertEquals(3, collectRows(env.executeSql("SELECT id FROM seq_src")).size(),
                    "query " + i + " should get a slot after earlier jobs finished");
        }
    }

    @Test
    void jobsRunInProcessWithoutTheRestEndpoint() {
        TableEnvironment env = factory.createBatchEnvironment();
        String target = ((org.apache.flink.table.api.internal.TableEnvironmentImpl) env).getConfig()
                .get(org.apache.flink.configuration.DeploymentOptions.TARGET);
        assertEquals(SharedClusterExecutorFactory.NAME, target);
    }

    @Test
    void runtimeFailureReportsItsCauseQuickly() {
        SqlExecutionService service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
        FlinkSession session = new FlinkSession("runtime-failure", factory);
        try {
            service.execute(session, ExecutionMode.BATCH, boundedSource("fail_src", 3));
            long begin = System.nanoTime();
            RuntimeException e = assertThrows(RuntimeException.class, () -> service.execute(session, ExecutionMode.BATCH,
                    "SELECT CAST(CONCAT(CAST(id AS STRING), 'x') AS INT) AS bad FROM fail_src"));
            long seconds = Duration.ofNanos(System.nanoTime() - begin).toSeconds();
            assertTrue(seconds < 5, "failure took " + seconds + "s to report");
            assertTrue(e.getMessage().contains("NumberFormatException"), e.getMessage());
        } finally {
            session.close();
        }
    }

    @Test
    void concurrentStartRequestsStartOneCluster() throws Exception {
        SharedMiniCluster fresh = new SharedMiniCluster(PROPERTIES);
        try {
            Thread[] callers = new Thread[8];
            for (int i = 0; i < callers.length; i++) {
                callers[i] = new Thread(fresh::awaitRestAddress);
                callers[i].start();
            }
            fresh.startAsync();
            for (Thread caller : callers) {
                caller.join();
            }
            assertEquals(1, fresh.startAttempts());
            assertTrue(fresh.isRunning());
        } finally {
            fresh.close();
        }
        assertFalse(fresh.isRunning());
    }

    @Test
    void waitingAfterCloseFailsFastInsteadOfTimingOut() throws Exception {
        FlinkProperties slowTimeout = new FlinkProperties(
                1, "8m", "32m", 1, null, true, 1, "32m", Duration.ofSeconds(30));
        SharedMiniCluster closed = new SharedMiniCluster(slowTimeout);
        closed.close();

        long begin = System.nanoTime();
        IllegalStateException e = assertThrows(IllegalStateException.class, closed::awaitRestAddress);
        assertTrue(Duration.ofNanos(System.nanoTime() - begin).toSeconds() < 5, "should not wait for the start timeout");
        assertTrue(e.getMessage().contains("closed"), e.getMessage());
    }

    @Test
    void startFailureSurfacesAsIllegalState() {
        FlinkProperties broken = new FlinkProperties(
                1, "8m", "32m", 1, null, true, 1, "not-a-size", Duration.ofSeconds(10));
        SharedMiniCluster failing = new SharedMiniCluster(broken);

        IllegalStateException e = assertThrows(IllegalStateException.class, failing::awaitRestAddress);
        assertTrue(e.getMessage().startsWith("Shared Flink MiniCluster failed to start"), e.getMessage());
        assertFalse(failing.isRunning());
    }

    private static String boundedSource(String name, int rows) {
        return """
                CREATE TEMPORARY TABLE %s (id INT) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '%d',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '%d'
                )
                """.formatted(name, rows, rows);
    }

    private static List<Row> collectRows(TableResult result) throws Exception {
        List<Row> rows = new ArrayList<>();
        try (CloseableIterator<Row> it = result.collect()) {
            while (it.hasNext()) {
                rows.add(it.next());
            }
        }
        return rows;
    }
}
