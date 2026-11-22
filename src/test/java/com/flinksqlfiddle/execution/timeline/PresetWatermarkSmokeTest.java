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
import org.apache.flink.table.api.TableEnvironment;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Holds every watermarked preset to its promise in src/test/resources/preset-watermarks.json, on
 * real Flink (ADR 0006). The timeline probe records each row's event time against the watermark it
 * arrived under; every recording must end cleanly (not truncated, rows seen, watermarks seen).
 *
 * <ul>
 *   <li>lossless: every watermarked table of the preset (both inputs of a join) is probed on its
 *       own, and no row may arrive behind its watermark. That holds at any pace, because the delay
 *       covers the whole scatter.</li>
 *   <li>lossy: the preset's query is probed, and some row must lose at least one window (or,
 *       without windows, arrive behind the watermark).</li>
 * </ul>
 *
 * Sources run ten times faster than shipped so the test takes seconds. That changes how many rows
 * share a watermark, not the scatter, so it can change how many rows a lossy preset loses but not
 * whether a lossless one loses any. preset-watermarks.test.js checks the same promises from the SQL.
 */
@Tag("smoke")
class PresetWatermarkSmokeTest {

    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 5, null, true, 0, null, null);
    private static final Pattern WATERMARK_FOR = Pattern.compile("(?i)WATERMARK\\s+FOR");
    private static final Pattern RATE = Pattern.compile("'rows-per-second'\\s*=\\s*'(\\d+)'");
    private static final Set<String> PROMISES = Set.of("lossless", "lossy");
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

    /** Ten times the preset's rate, so a 20 s preset records in 2 s; the scatter is unchanged. */
    static String faster(String ddl) {
        Matcher m = RATE.matcher(ddl);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(out, "'rows-per-second' = '" + Integer.parseInt(m.group(1)) * 10 + "'");
        }
        return m.appendTail(out).toString();
    }

    /** True when the watermark had passed the end of at least one of the record's windows. */
    static boolean missedAWindow(long t, long wm, WindowSpec w) {
        long off = w.offsetMs();
        List<Long> ends = new ArrayList<>();
        switch (w.kind()) {
            case "HOP" -> {
                for (long s = Math.floorDiv(t - off, w.slideMs()) * w.slideMs() + off; s + w.sizeMs() > t; s -= w.slideMs()) {
                    ends.add(s + w.sizeMs());
                }
            }
            case "CUMULATE" -> {
                long base = Math.floorDiv(t - off, w.sizeMs()) * w.sizeMs() + off;
                for (long e = base + w.stepMs(); e <= base + w.sizeMs(); e += w.stepMs()) {
                    if (e > t) {
                        ends.add(e);
                    }
                }
            }
            default -> ends.add(Math.floorDiv(t - off, w.sizeMs()) * w.sizeMs() + off + w.sizeMs());
        }
        return ends.stream().anyMatch(end -> wm >= end - 1);
    }

    private record Recording(TimelineService.TimelineMeta meta, List<long[]> ticks, int count, boolean truncated,
                             boolean ended) {
        static final long NONE = Long.MIN_VALUE;

        long behind() {
            return ticks.stream().filter(k -> k[1] != NONE && k[0] <= k[1]).count();
        }

        long missed() {
            WindowSpec w = meta.window();
            return w == null ? behind() : ticks.stream().filter(k -> k[1] != NONE && missedAWindow(k[0], k[1], w)).count();
        }

        /** Why this recording cannot be used as evidence, or null. */
        String unusable() {
            if (!ended) return "the probe did not end cleanly";
            if (truncated) return "the probe hit the row or time limit";
            if (ticks.isEmpty() || count != ticks.size()) return "the probe saw " + ticks.size() + " of " + count + " rows";
            if (ticks.stream().noneMatch(k -> k[1] != NONE)) return "no row saw a watermark";
            return null;
        }

        String summary() {
            return String.format("%s: %d rows, %d behind the watermark, %d lost a window", meta.table(), ticks.size(), behind(), missed());
        }
    }

    private static Recording record(TimelineService timeline, FlinkSession session, String query) throws Exception {
        TimelineService.TimelineQuery q = timeline.prepare(session, query);
        List<long[]> ticks = new ArrayList<>();
        int[] count = {-1};
        boolean[] truncated = {false};
        timeline.stream(q, new TimelineService.TimelineListener() {
            @Override
            public void onTick(long t, Long wm) {
                ticks.add(new long[]{t, wm == null ? Recording.NONE : wm});
            }

            @Override
            public void onEnd(int n, boolean trunc) {
                count[0] = n;
                truncated[0] = trunc;
            }
        });
        return new Recording(q.meta(), ticks, count[0], truncated[0], count[0] >= 0);
    }

    /** Tables (not views) of the session that declare a WATERMARK, by name. */
    private static List<String> watermarkedTables(FlinkSession session) {
        TableEnvironment tEnv = session.getStreamEnv();
        return session.runOnPlannerThread(() -> {
            List<String> out = new ArrayList<>();
            for (String name : tEnv.listTables()) {
                if (!tEnv.from("`" + name.replace("`", "``") + "`").getResolvedSchema().getWatermarkSpecs().isEmpty()) {
                    out.add(name);
                }
            }
            return out;
        });
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
            StringBuilder ddl = new StringBuilder();
            preset.get("schema").forEach(s -> ddl.append(s.asText()).append('\n'));
            if (!WATERMARK_FOR.matcher(ddl.toString().replaceAll("--[^\\n]*", "")).find()) {
                continue;
            }
            String promise = promises.path(title).asText("");
            if (!PROMISES.contains(promise)) {
                failures.add(title + ": promise \"" + promise + "\" is not one of " + PROMISES);
                continue;
            }
            FlinkSession session = new FlinkSession("smoke-wm", new FlinkEnvironmentFactory(PROPERTIES, cluster));
            try {
                for (JsonNode stmt : preset.get("schema")) {
                    service.execute(session, ExecutionMode.STREAMING, faster(stmt.asText()));
                }
                if (promise.equals("lossless")) {
                    List<String> tables = watermarkedTables(session);
                    if (tables.isEmpty()) {
                        failures.add(title + ": no watermarked table in the catalog");
                    }
                    for (String table : tables) {
                        Recording r = record(timeline, session, "SELECT * FROM `" + table.replace("`", "``") + "`");
                        if (r.unusable() != null) {
                            failures.add(title + " / " + table + ": " + r.unusable());
                        } else if (r.behind() > 0) {
                            failures.add(title + ": promised lossless, but " + r.summary());
                        }
                    }
                } else {
                    Recording r = record(timeline, session, preset.get("query").get(0).asText());
                    if (r.unusable() != null) {
                        failures.add(title + ": " + r.unusable());
                    } else if (r.missed() == 0) {
                        failures.add(title + ": promised lossy, but " + r.summary());
                    }
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

    @Test
    void aRecordThatMissesOnlyOneOfItsOverlappingWindowsCounts() {
        WindowSpec hop = new WindowSpec("HOP", 10_000, 5_000, 0, 0);
        assertTrue(missedAWindow(4_000, 4_999, hop), "[-5s,5s) fired; [0,10s) still open");
        assertFalse(missedAWindow(4_000, 4_998, hop));
        WindowSpec cumulate = new WindowSpec("CUMULATE", 10_000, 10_000, 2_000, 0);
        assertTrue(missedAWindow(1_000, 1_999, cumulate), "[0,2s) fired; [0,4s) onward open");
        WindowSpec tumble = new WindowSpec("TUMBLE", 5_000, 5_000, 0, 0);
        assertTrue(missedAWindow(3_000, 4_999, tumble));
        assertFalse(missedAWindow(3_000, 4_998, tumble));
    }
}
