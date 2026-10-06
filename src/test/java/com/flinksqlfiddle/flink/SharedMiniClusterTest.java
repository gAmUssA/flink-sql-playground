package com.flinksqlfiddle.flink;

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
