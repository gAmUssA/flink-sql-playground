package com.flinksqlfiddle.execution.timeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.flink.SharedMiniCluster;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Holds every watermarked preset to its promise in src/test/resources/preset-watermarks.json,
 * on real Flink: the timeline probe records each row's event time against the watermark it
 * arrived under. A lossless preset may have no row behind the watermark; a lossy one must lose
 * rows (dropped by a fired window, or behind the watermark when it has no window).
 * preset-watermarks.test.js checks the same promises statically from the SQL.
 */
@Tag("smoke")
class PresetWatermarkSmokeTest {

    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 5, null, true, 0, null, null);
    private static final Pattern WATERMARK_FOR = Pattern.compile("(?i)WATERMARK\\s+FOR");
    private static final Pattern RATE = Pattern.compile("'rows-per-second'\\s*=\\s*'(\\d+)'");
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

    /** Ten times the preset's rate, so a 20 s preset records in 2 s; the disorder is unchanged. */
    static String faster(String ddl) {
        Matcher m = RATE.matcher(ddl);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(out, "'rows-per-second' = '" + Integer.parseInt(m.group(1)) * 10 + "'");
        }
        return m.appendTail(out).toString();
    }

    @Test
    void everyWatermarkedPresetKeepsItsPromise() throws Exception {
        ObjectMapper json = new ObjectMapper();
        JsonNode promises = json.readTree(getClass().getResourceAsStream("/preset-watermarks.json"));
        JsonNode presets = json.readTree(new File(System.getProperty("presets.json")));
        SqlExecutionService service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
        TimelineService timeline = new TimelineService(service);
        List<String> failures = new ArrayList<>();
        int checked = 0;

        for (JsonNode preset : presets) {
            String title = preset.get("title").asText();
            if (!WATERMARK_FOR.matcher(preset.get("schema").toString()).find()) {
                continue;
            }
            String promise = promises.path(title).asText("");
            if (promise.isEmpty()) {
                failures.add(title + ": no promise in preset-watermarks.json");
                continue;
            }
            FlinkSession session = new FlinkSession("smoke-wm", new FlinkEnvironmentFactory(PROPERTIES, cluster));
            try {
                for (JsonNode stmt : preset.get("schema")) {
                    service.execute(session, ExecutionMode.STREAMING, faster(stmt.asText()));
                }
                TimelineService.TimelineQuery q = timeline.prepare(session, preset.get("query").get(0).asText());
                List<long[]> ticks = new ArrayList<>();
                timeline.stream(q, new TimelineService.TimelineListener() {
                    @Override
                    public void onTick(long t, Long wm) {
                        ticks.add(new long[]{t, wm == null ? Long.MIN_VALUE : wm});
                    }

                    @Override
                    public void onEnd(int count, boolean truncated) {
                    }
                });
                WindowSpec w = q.meta().window();
                long behind = ticks.stream().filter(k -> k[1] != Long.MIN_VALUE && k[0] <= k[1]).count();
                long dropped = w == null ? behind : ticks.stream().filter(k -> {
                    long end = Math.floorDiv(k[0] - w.offsetMs(), w.slideMs()) * w.slideMs() + w.offsetMs() + w.sizeMs();
                    return k[1] != Long.MIN_VALUE && k[1] >= end - 1;
                }).count();
                String seen = String.format("%d rows, %d behind the watermark, %d lost", ticks.size(), behind, dropped);
                if (ticks.isEmpty()) {
                    failures.add(title + ": the probe saw no rows");
                } else if (promise.equals("lossless") && behind > 0) {
                    failures.add(title + ": promised lossless, but " + seen);
                } else if (promise.equals("lossy") && dropped == 0) {
                    failures.add(title + ": promised lossy, but " + seen);
                }
                checked++;
            } catch (Exception e) {
                failures.add(title + ": " + e);
            } finally {
                session.close();
            }
        }
        assertTrue(checked >= 5, "expected the five watermarked presets, checked " + checked);
        assertTrue(failures.isEmpty(), String.join("\n", failures));
    }

    @Test
    void fasterMultipliesEveryRate() {
        assertEquals("'rows-per-second' = '250', x, 'rows-per-second' = '10'",
                faster("'rows-per-second' = '25', x, 'rows-per-second' = '1'"));
    }
}
