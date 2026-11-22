package com.flinksqlfiddle.execution.timeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.NotExplainableException;
import com.flinksqlfiddle.execution.SqlExecutionService;
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

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Records real timelines on the shared MiniCluster, starting from the canonical
 * "Watermark Timeline" preset: its tight watermark must drop clicks, a wide one none.
 */
@Tag("smoke")
class TimelineSmokeTest {

    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 5, null, true, 0, null, null);
    private static final String PRESET = "Watermark Timeline: who misses the window";
    private static SharedMiniCluster cluster;

    private SqlExecutionService service;
    private TimelineService timeline;
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
        timeline = new TimelineService(service);
        session = new FlinkSession("smoke-timeline", new FlinkEnvironmentFactory(PROPERTIES, cluster));
    }

    @AfterEach
    void tearDown() {
        session.close();
    }

    private record Tick(long t, Long wm) {
    }

    private record Recording(TimelineService.TimelineMeta meta, List<Tick> ticks, int count) {
    }

    private Recording record(String query) throws Exception {
        TimelineService.TimelineQuery q = timeline.prepare(session, query);
        List<Tick> ticks = new ArrayList<>();
        int[] count = {-1};
        timeline.stream(q, new TimelineService.TimelineListener() {
            @Override
            public void onTick(long eventTime, Long watermark) {
                ticks.add(new Tick(eventTime, watermark));
            }

            @Override
            public void onEnd(int n, boolean truncated) {
                count[0] = n;
            }
        });
        return new Recording(q.meta(), ticks, count[0]);
    }

    /** Ticks whose tumbling window had already fired when they arrived. */
    private static long dropped(Recording r) {
        long size = r.meta().window().sizeMs();
        return r.ticks().stream().filter(k -> {
            long end = Math.floorDiv(k.t(), size) * size + size;
            return k.wm() != null && k.wm() >= end - 1;
        }).count();
    }

    private static JsonNode preset() throws Exception {
        JsonNode presets = new ObjectMapper().readTree(new File(System.getProperty("presets.json")));
        for (JsonNode p : presets) {
            if (p.get("title").asText().equals(PRESET)) {
                return p;
            }
        }
        throw new AssertionError("preset not found: " + PRESET);
    }

    /** The preset's DDL, ten times faster so the test takes ~2s instead of 20s. */
    private void createClicks(String watermarkSeconds) throws Exception {
        String ddl = preset().get("schema").get(0).asText()
                .replace("'rows-per-second' = '25'", "'rows-per-second' = '250'")
                .replace("ts - INTERVAL '2' SECOND", "ts - INTERVAL '" + watermarkSeconds + "' SECOND");
        service.execute(session, ExecutionMode.STREAMING, ddl);
    }

    @Test
    void canonicalPresetDropsClicksBehindATightWatermark() throws Exception {
        createClicks("2");
        Recording r = record(preset().get("query").get(0).asText());

        assertEquals("clicks", r.meta().table());
        assertEquals("ts", r.meta().rowtime());
        assertTrue(r.meta().watermark().contains("2"), r.meta().watermark());
        assertEquals(new WindowSpec("TUMBLE", 5_000, 5_000, 0, 0), r.meta().window());
        assertEquals(500, r.ticks().size());
        assertEquals(500, r.count());
        assertTrue(r.ticks().stream().anyMatch(k -> k.wm() != null), "watermarks arrive during the run");
        // Every watermark trails the largest event time seen so far by the 2s delay.
        long max = Long.MIN_VALUE;
        for (Tick k : r.ticks()) {
            if (k.wm() != null) {
                assertTrue(k.wm() <= max - 2_000 + 1, "watermark ahead of max event time - 2s");
            }
            max = Math.max(max, k.t());
        }
        assertTrue(dropped(r) > 0, "a 2s watermark over 10s of disorder must drop clicks");
    }

    @Test
    void wideWatermarkDropsNothing() throws Exception {
        createClicks("11");
        Recording r = record(preset().get("query").get(0).asText());
        assertEquals(500, r.ticks().size());
        assertEquals(0, dropped(r));
    }

    @Test
    void queryWithoutEventTimeHasNoTimeline() {
        service.execute(session, ExecutionMode.STREAMING,
                "CREATE TEMPORARY TABLE plain (a INT) WITH ('connector' = 'datagen', 'number-of-rows' = '5')");
        NotExplainableException e = assertThrows(NotExplainableException.class,
                () -> timeline.prepare(session, "SELECT a FROM plain"));
        assertEquals("NO_EVENT_TIME", e.code());
    }

    @Test
    void joinProbesTheFirstWatermarkedInputAndLtzTimesAreWallClock() throws Exception {
        service.execute(session, ExecutionMode.STREAMING,
                "CREATE TEMPORARY TABLE dim (k INT) WITH ('connector' = 'datagen', 'number-of-rows' = '5')");
        service.execute(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE ev (k INT, ts TIMESTAMP_LTZ(3), WATERMARK FOR ts AS ts - INTERVAL '1' SECOND)
                WITH ('connector' = 'datagen', 'number-of-rows' = '20', 'fields.k.min' = '1', 'fields.k.max' = '5')""");
        long before = System.currentTimeMillis();
        Recording r = record("SELECT e.k FROM dim d JOIN ev e ON d.k = e.k");
        assertEquals("ev", r.meta().table(), "dim has no watermark, so ev is probed");
        assertNull(r.meta().window());
        assertEquals(20, r.ticks().size());
        // A TIMESTAMP_LTZ is shown as wall-clock time in the session zone, the clock windows align to.
        long offset = java.util.TimeZone.getDefault().getOffset(before);
        long wall = before + offset;
        r.ticks().forEach(k -> assertTrue(Math.abs(k.t() - wall) < 60_000, () -> "tick " + k.t() + " vs wall " + wall));
    }

    @Test
    void forbiddenSqlIsRejectedBeforeAnyProbe() {
        assertThrows(com.flinksqlfiddle.security.ForbiddenSqlException.class,
                () -> timeline.prepare(session, "CREATE FUNCTION f AS 'x.Y'"));
    }
}
