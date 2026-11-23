package com.flinksqlfiddle.execution;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.flink.SharedMiniCluster;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The shipped presets that join a stream with faker "dimension" tables show each fact once
 * (bean nhqw). Faker emits a random key per row, so a dimension key arrives many times. With a
 * PRIMARY KEY declared on that insert-only table, Flink trusted the key and appended a second
 * joined row for every new dimension row: 251 of 385 orders showed up more than once. The
 * presets now keep the latest row per key in a view (ROW_NUMBER over PROCTIME), so the join
 * retracts (-U) the old result and emits (+U) the new one.
 *
 * <p>Runs each preset as shipped and replays its changelog: no key may be live twice.
 */
@Tag("smoke")
class DimensionPresetSmokeTest {

    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 5, null, true, 0, null, null);
    private static final int ROWS = 400;
    private static final long MAX_MS = 40_000;
    private static SharedMiniCluster cluster;

    @BeforeAll
    static void startCluster() {
        cluster = new SharedMiniCluster(PROPERTIES);
        cluster.startAsync();
    }

    @AfterAll
    static void stopCluster() throws Exception {
        cluster.close();
    }

    private static JsonNode preset(String title) throws IOException {
        for (JsonNode p : new ObjectMapper().readTree(new File(System.getProperty("presets.json")))) {
            if (p.get("title").asText().equals(title)) {
                return p;
            }
        }
        return fail("no shipped preset titled " + title);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "E-Commerce Streaming (Faker)|order_id",
            "Brewmaster Monitoring (Faker)|window_start,tank_id,recipe_id",
    })
    void eachFactIsShownOnce(String title, String keyColumns) throws Exception {
        JsonNode preset = preset(title);
        SqlExecutionService service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
        FlinkSession session = new FlinkSession("smoke-dim", new FlinkEnvironmentFactory(PROPERTIES, cluster));
        for (JsonNode stmt : preset.get("schema")) {
            String sql = stmt.asText();
            if (!sql.replaceAll("--[^\\n]*", "").isBlank()) {
                service.execute(session, ExecutionMode.STREAMING, sql);
            }
        }
        SqlExecutionService.StreamingQuery query = service.prepareStream(session, preset.get("query").get(0).asText());

        List<String> keys = List.of(keyColumns.split(","));
        Map<String, Integer> live = new HashMap<>();
        Map<String, Integer> kinds = new HashMap<>();
        long start = System.currentTimeMillis();
        try {
            service.streamRows(query, new ResultStreamListener() {
                private List<String> columns;
                private int rows;

                @Override
                public void onSchema(List<String> names, List<String> types) {
                    columns = names;
                }

                @Override
                public void onRow(String kind, List<Object> values) throws IOException {
                    StringBuilder key = new StringBuilder();
                    for (String k : keys) {
                        key.append(values.get(columns.indexOf(k))).append('|');
                    }
                    live.merge(key.toString(), kind.startsWith("+") ? 1 : -1, Integer::sum);
                    kinds.merge(kind, 1, Integer::sum);
                    if (++rows >= ROWS || System.currentTimeMillis() - start > MAX_MS) {
                        throw new IOException("enough rows"); // ends the stream and cancels the job
                    }
                }

                @Override
                public void onEnd(int rowCount, boolean truncated, long executionTimeMs) {
                }
            });
        } finally {
            session.close();
        }

        assertFalse(live.isEmpty(), title + ": no rows");
        List<String> twice = live.entrySet().stream().filter(e -> e.getValue() > 1).map(Map.Entry::getKey).toList();
        assertTrue(twice.isEmpty(), title + ": " + twice.size() + " of " + live.size()
                + " keys are live more than once, e.g. " + twice.stream().limit(3).toList() + "; row kinds " + kinds);
        assertTrue(live.values().stream().allMatch(n -> n >= 0), title + ": a retraction without its row; " + kinds);
    }
}
